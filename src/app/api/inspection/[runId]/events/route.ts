import type { InspectionStreamEvent } from "@/features/inspect/components/inspection-stream";
import { discoverWebMcpTools } from "@/features/inspect/server/discover-webmcp-tools";
import { getInspectionBrowserFailureMessage } from "@/features/inspect/server/stagehand-browser";
import {
  disposeInspectionBrowserSession,
  getInspectionRun,
  getOrCreateInspectionBrowserSession,
  getOrCreateToolDiscovery,
} from "@/features/inspect/server/inspection-run-store";
import { openInspectionBrowserSession } from "@/features/inspect/server/inspection-browser-session";
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

      controller.enqueue(
        encoder.encode("retry: 1500\n: inspection stream ready\n\n"),
      );
      send({ kind: "run.connected", runId });
      send({
        kind: "section.progress",
        section: "tools",
        progress: {
          value: 12,
          message: "Opening the WebMCP discovery channel",
        },
      });

      const browserSession = getOrCreateInspectionBrowserSession(
        run,
        () =>
          openInspectionBrowserSession((progress) => {
            send({ kind: "section.progress", section: "tools", progress });
          }),
      );
      void getOrCreateToolDiscovery(run, async () =>
        discoverWebMcpTools(
          run.targetUrl,
          (progress) => {
            send({ kind: "section.progress", section: "tools", progress });
          },
          await browserSession,
        ),
      )
        .then(async (tools) => {
          for (const tool of tools) {
            send({ kind: "tool.discovered", data: tool });
            await new Promise<void>((resolve) => setTimeout(resolve, 50));
          }

          send({ kind: "tools.ready", data: tools });
        })
        .catch((error: unknown) => {
          void disposeInspectionBrowserSession(run);
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
