import type { VerificationStreamEvent } from "@/features/inspect/components/inspection-stream";
import {
  InspectionBrowserSessionUnavailableError,
  openInspectionBrowserSession,
  toBrowserSessionView,
} from "@/features/inspect/server/inspection-browser-session";
import {
  cancelInspectionProbe,
  disposeInspectionProbeBrowserSession,
  getInspectionProbe,
  getInspectionRun,
  getOrCreateInspectionProbeBrowserSession,
  getOrStartInspectionProbe,
  publishInspectionProbeEvent,
  retainInspectionProbeScreenshot,
  subscribeToInspectionProbe,
} from "@/features/inspect/server/inspection-run-store";
import { runToolVerification } from "@/features/inspect/server/run-tool-verification";

type ProbeParams = {
  params: Promise<{ runId: string; probeId: string }>;
};

const encodeEvent = (
  encoder: TextEncoder,
  id: number,
  event: VerificationStreamEvent,
) => {
  return encoder.encode(
    `id: ${id}\nevent: verification\ndata: ${JSON.stringify(event)}\n\n`,
  );
};

const isTerminalEvent = (event: VerificationStreamEvent) => {
  return event.kind === "probe.completed" || event.kind === "probe.failed";
};

const isAbortError = (error: unknown) => {
  return error instanceof DOMException && error.name === "AbortError";
};

export const GET = async (request: Request, { params }: ProbeParams) => {
  const { runId, probeId } = await params;
  const run = getInspectionRun(runId);
  const probe = run ? getInspectionProbe(run, probeId) : undefined;

  if (!run || !probe) {
    return Response.json(
      { error: "This verification probe was not found or has expired." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const tools = await run.toolDiscovery?.catch(() => undefined);
  const selectedTool = tools?.find((tool) => tool.id === probe.toolId);
  if (!selectedTool) {
    return Response.json(
      { error: "The selected tool is no longer available for this run." },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  const encoder = new TextEncoder();
  let eventId = 0;
  let closed = false;
  let unsubscribe: () => void = () => undefined;

  const stream = new ReadableStream<Uint8Array>({
    start: (controller) => {
      const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        controller.close();
      };
      const send = (event: VerificationStreamEvent) => {
        if (closed) return;
        eventId += 1;
        controller.enqueue(encodeEvent(encoder, eventId, event));
        if (isTerminalEvent(event)) close();
      };

      controller.enqueue(
        encoder.encode("retry: 1500\n: verification stream ready\n\n"),
      );
      send({
        kind: "probe.connected",
        probeId: probe.id,
        toolId: probe.toolId,
      });

      for (const event of probe.events) {
        send(event);
        if (closed) return;
      }

      unsubscribe = subscribeToInspectionProbe(probe, send);

      void getOrStartInspectionProbe(probe, async (signal) => {
        const runWithDisposableBrowser = async () => {
          const browserSession = getOrCreateInspectionProbeBrowserSession(
            run,
            probe,
            (reportLifecycle) =>
              openInspectionBrowserSession(
                (progress) =>
                  publishInspectionProbeEvent(probe, {
                    kind: "section.progress",
                    section: "evidence",
                    progress: {
                      ...progress,
                      value: Math.max(
                        5,
                        Math.min(9, Math.round(progress.value / 3)),
                      ),
                    },
                  }),
                (lifecycle) => {
                  reportLifecycle(lifecycle);
                  publishInspectionProbeEvent(probe, {
                    kind: "browser.session.updated",
                    data: toBrowserSessionView(lifecycle, run.targetUrl),
                  });
                },
              ),
          );

          let terminationReason:
            | "completed"
            | "failed"
            | "canceled" = "completed";

          try {
            await runToolVerification({
              runId: run.id,
              probeId: probe.id,
              targetUrl: run.targetUrl,
              selectedTool,
              browserSession: await browserSession,
              releaseBrowser: () =>
                disposeInspectionProbeBrowserSession(probe, browserSession),
              signal,
              report: (event) => publishInspectionProbeEvent(probe, event),
              retainScreenshot: (screenshot) =>
                retainInspectionProbeScreenshot(run, probe, screenshot),
            });
          } catch (error) {
            terminationReason = signal.aborted ? "canceled" : "failed";
            throw error;
          } finally {
            await disposeInspectionProbeBrowserSession(
              probe,
              browserSession,
              terminationReason,
            );
          }
        };

        try {
          try {
            await runWithDisposableBrowser();
          } catch (error) {
            if (
              !(error instanceof InspectionBrowserSessionUnavailableError) ||
              signal.aborted
            ) {
              throw error;
            }

            await runWithDisposableBrowser();
          }
        } catch (error) {
          if (!isAbortError(error)) {
            console.error("ToolTruth verification failed", {
              runId: run.id,
              probeId: probe.id,
              toolId: probe.toolId,
              error,
            });
          }
          publishInspectionProbeEvent(probe, {
            kind: "probe.failed",
            toolId: probe.toolId,
            message:
              isAbortError(error)
                ? "The verification was cancelled."
                : error instanceof Error
                ? error.message
                : "The verification could not be completed.",
          });
        }
      });

      request.signal.addEventListener("abort", () => {
        closed = true;
        unsubscribe();
        cancelInspectionProbe(probe);
      });
    },
    cancel: () => {
      closed = true;
      unsubscribe();
      cancelInspectionProbe(probe);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
};
