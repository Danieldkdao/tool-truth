import type { VerificationStreamEvent } from "@/features/inspect/components/inspection-stream";
import {
  sanitizeDirectedEvaluation,
  sanitizeDirectedTest,
} from "@/features/inspect/lib/directed-redaction";
import { eventsAfterSequence } from "@/features/inspect/lib/verification-event-order";
import {
  InspectionBrowserSessionUnavailableError,
  openInspectionBrowserSession,
  toBrowserSessionView,
} from "@/features/inspect/server/inspection-browser-session";
import {
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
  return (
    event.kind === "probe.completed" ||
    event.kind === "probe.failed" ||
    event.kind === "probe.canceled"
  );
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
  const querySequence = Number(
    new URL(request.url).searchParams.get("after") ?? "0",
  );
  const headerSequence = Number(request.headers.get("last-event-id") ?? "0");
  const afterSequence = Math.max(
    Number.isSafeInteger(querySequence) ? querySequence : 0,
    Number.isSafeInteger(headerSequence) ? headerSequence : 0,
    0,
  );
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
      const send = (sequence: number, event: VerificationStreamEvent) => {
        if (closed) return;
        controller.enqueue(encodeEvent(encoder, sequence, event));
        if (isTerminalEvent(event)) close();
      };

      controller.enqueue(
        encoder.encode("retry: 1500\n: verification stream ready\n\n"),
      );
      send(afterSequence, {
        kind: "probe.connected",
        probeId: probe.id,
        toolId: probe.toolId,
      });

      for (const storedEvent of eventsAfterSequence(
        probe.events,
        afterSequence,
      )) {
        send(storedEvent.sequence, storedEvent.event);
        if (closed) return;
      }

      unsubscribe = subscribeToInspectionProbe(
        probe,
        (storedEvent) => send(storedEvent.sequence, storedEvent.event),
      );

      if (
        probe.directedTest &&
        !probe.events.some(
          (storedEvent) => storedEvent.event.kind === "directed.started",
        )
      ) {
        publishInspectionProbeEvent(probe, {
          kind: "directed.started",
          toolId: probe.toolId,
          data: sanitizeDirectedTest(probe.directedTest),
        });
      }

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
              inputSource: probe.directedTest
                ? { kind: "directed", test: probe.directedTest }
                : { kind: "generated" },
              browserSession: await browserSession,
              releaseBrowser: () =>
                disposeInspectionProbeBrowserSession(probe, browserSession),
              signal,
              report: (event) =>
                publishInspectionProbeEvent(
                  probe,
                  event.kind === "directed.ready"
                    ? {
                        ...event,
                        data: sanitizeDirectedEvaluation(event.data),
                      }
                    : event,
                ),
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
          const wasCanceled = signal.aborted || isAbortError(error);
          if (!wasCanceled) {
            console.error("ToolTruth verification failed", {
              runId: run.id,
              probeId: probe.id,
              toolId: probe.toolId,
              error,
            });
          }
          publishInspectionProbeEvent(
            probe,
            wasCanceled
              ? {
                  kind: "probe.canceled",
                  toolId: probe.toolId,
                  message: "The verification was canceled.",
                }
              : {
                  kind: "probe.failed",
                  toolId: probe.toolId,
                  message:
                    error instanceof Error
                      ? error.message
                      : "The verification could not be completed.",
                },
          );
        }
      });

      request.signal.addEventListener("abort", () => {
        closed = true;
        unsubscribe();
      });
    },
    cancel: () => {
      closed = true;
      unsubscribe();
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
