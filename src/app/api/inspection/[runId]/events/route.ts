import type { InspectionStreamEvent } from "@/features/inspect/components/inspection-stream";
import { discoverWebMcpTools } from "@/features/inspect/server/discover-webmcp-tools";
import { getInspectionBrowserFailureMessage } from "@/features/inspect/server/stagehand-browser";
import {
  disposeInspectionBrowserSession,
  getInspectionDiscoveryBrowserbaseLifecycle,
  getInspectionRun,
  getOrCreateInspectionBrowserSession,
  getOrCreateToolDiscovery,
} from "@/features/inspect/server/inspection-run-store";
import {
  openInspectionBrowserSession,
  toBrowserSessionView,
} from "@/features/inspect/server/inspection-browser-session";
import type { ParamsId } from "@/lib/types";

const encodeEvent = (
  encoder: TextEncoder,
  id: number,
  event: InspectionStreamEvent,
) => {
  return encoder.encode(
    `id: ${id}\nevent: inspection\ndata: ${JSON.stringify(event)}\n\n`,
  );
};

export const GET = async (
  request: Request,
  { params }: ParamsId<"runId">,
) => {
  const { runId } = await params;
  const run = getInspectionRun(runId);

  if (!run) {
    return Response.json(
      { error: "This inspection run was not found or has expired." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const encoder = new TextEncoder();
  let closed = false;
  let eventId = 0;

  const stream = new ReadableStream<Uint8Array>({
    start: (controller) => {
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };
      const send = (event: InspectionStreamEvent) => {
        if (closed) return;
        eventId += 1;
        controller.enqueue(encodeEvent(encoder, eventId, event));
      };
      const sendLatestBrowserSession = () => {
        const lifecycle = getInspectionDiscoveryBrowserbaseLifecycle(run);
        if (!lifecycle) return;

        send({
          kind: "browser.session.updated",
          data: toBrowserSessionView(lifecycle, run.targetUrl),
        });
      };

      controller.enqueue(
        encoder.encode("retry: 1500\n: inspection stream ready\n\n"),
      );
      send({ kind: "run.connected", runId });
      sendLatestBrowserSession();
      send({
        kind: "section.progress",
        section: "tools",
        progress: {
          value: 12,
          message: "Opening the WebMCP discovery channel",
        },
      });

      void getOrCreateToolDiscovery(run, async () => {
        const browserSession = getOrCreateInspectionBrowserSession(
          run,
          (reportLifecycle) =>
            openInspectionBrowserSession(
              run.targetHostname,
              (progress) => {
                send({ kind: "section.progress", section: "tools", progress });
              },
              (lifecycle) => {
                reportLifecycle(lifecycle);
                send({
                  kind: "browser.session.updated",
                  data: toBrowserSessionView(lifecycle, run.targetUrl),
                });
              },
            ),
        );

        let failed = false;

        try {
          return await discoverWebMcpTools(
            run.targetUrl,
            (progress) => {
              send({ kind: "section.progress", section: "tools", progress });
            },
            await browserSession,
          );
        } catch (error) {
          failed = true;
          throw error;
        } finally {
          await disposeInspectionBrowserSession(
            run,
            browserSession,
            failed ? "failed" : "completed",
          );
        }
      })
        .then(async (tools) => {
          for (const tool of tools) {
            send({ kind: "tool.discovered", data: tool });
            await new Promise<void>((resolve) => setTimeout(resolve, 50));
          }

          send({ kind: "tools.ready", data: tools });
        })
        .catch((error: unknown) => {
          console.error("WebMCP tool discovery failed", {
            runId,
            targetHostname: run.targetHostname,
            error,
          });
          send({
            kind: "tools.failed",
            message: getInspectionBrowserFailureMessage(error),
          });
        })
        .finally(() => {
          sendLatestBrowserSession();
          send({ kind: "run.completed" });
          close();
        });

      request.signal.addEventListener("abort", () => {
        closed = true;
      });
    },
    cancel: () => {
      closed = true;
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
