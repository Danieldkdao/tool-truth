import {
  browserPreview,
  contractAnalysis,
  executionEvidence,
} from "@/features/inspect/components/inspection-data";
import type { InspectionStreamEvent } from "@/features/inspect/components/inspection-stream";
import { discoverWebMcpTools } from "@/features/inspect/server/discover-webmcp-tools";
import {
  getInspectionRun,
  getOrCreateToolDiscovery,
} from "@/features/inspect/server/inspection-run-store";
import type { ParamsId } from "@/lib/types";

type TimedMockEvent = {
  delayMs: number;
  event: InspectionStreamEvent;
};

const createMockEventSequence = (): TimedMockEvent[] => {
  return [
    {
      delayMs: 180,
      event: {
        kind: "section.progress",
        section: "browser",
        progress: {
          value: 14,
          message: "Launching a disposable browser context",
        },
      },
    },
    {
      delayMs: 1_500,
      event: {
        kind: "section.progress",
        section: "browser",
        progress: {
          value: 46,
          message: "Loading the AgentMart commerce fixture",
        },
      },
    },
    {
      delayMs: 2_200,
      event: {
        kind: "section.progress",
        section: "browser",
        progress: {
          value: 78,
          message: "Capturing the rendered application",
        },
      },
    },
    {
      delayMs: 2_900,
      event: { kind: "browser.ready", data: browserPreview },
    },
    {
      delayMs: 3_000,
      event: {
        kind: "section.progress",
        section: "evidence",
        progress: {
          value: 28,
          message: "Capturing the baseline state",
        },
      },
    },
    {
      delayMs: 3_150,
      event: {
        kind: "section.progress",
        section: "analysis",
        progress: {
          value: 22,
          message: "Reading the declared tool contract",
        },
      },
    },
    {
      delayMs: 3_700,
      event: {
        kind: "section.progress",
        section: "evidence",
        progress: {
          value: 52,
          message: "Invoking preview_order with fixture inputs",
        },
      },
    },
    {
      delayMs: 4_250,
      event: {
        kind: "section.progress",
        section: "analysis",
        progress: {
          value: 49,
          message: "Comparing declared and observed behavior",
        },
      },
    },
    {
      delayMs: 4_750,
      event: {
        kind: "section.progress",
        section: "evidence",
        progress: {
          value: 81,
          message: "Recording state and network mutations",
        },
      },
    },
    {
      delayMs: 5_300,
      event: { kind: "evidence.ready", data: executionEvidence },
    },
    {
      delayMs: 5_450,
      event: {
        kind: "section.progress",
        section: "analysis",
        progress: {
          value: 84,
          message: "Building an evidence-backed verdict",
        },
      },
    },
    {
      delayMs: 6_150,
      event: { kind: "analysis.ready", data: contractAnalysis },
    },
  ];
};

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
      {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const encoder = new TextEncoder();
  const timers: ReturnType<typeof setTimeout>[] = [];
  let closed = false;
  let discoveryFinished = false;
  let mockSequenceFinished = false;
  let eventId = 0;

  const clearTimers = () => {
    for (const timer of timers) {
      clearTimeout(timer);
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start: (controller) => {
      const closeStream = () => {
        if (closed) {
          return;
        }

        closed = true;
        clearTimers();
        controller.close();
      };

      const sendEvent = (event: InspectionStreamEvent) => {
        if (closed) {
          return;
        }

        eventId += 1;
        controller.enqueue(encodeEvent(encoder, eventId, event));
      };

      const finishIfReady = () => {
        if (closed || !discoveryFinished || !mockSequenceFinished) {
          return;
        }

        sendEvent({ kind: "run.completed" });
        const closeTimer = setTimeout(closeStream, 100);
        timers.push(closeTimer);
      };

      controller.enqueue(encoder.encode("retry: 1500\n: inspection stream ready\n\n"));
      sendEvent({ kind: "run.connected", runId });
      sendEvent({
        kind: "section.progress",
        section: "tools",
        progress: {
          value: 12,
          message: "Opening the WebMCP discovery channel",
        },
      });

      const mockEvents = createMockEventSequence();
      mockEvents.forEach(({ delayMs, event }, index) => {
        const timer = setTimeout(() => {
          if (closed) {
            return;
          }

          sendEvent(event);

          if (index === mockEvents.length - 1) {
            mockSequenceFinished = true;
            finishIfReady();
          }
        }, delayMs);

        timers.push(timer);
      });

      void getOrCreateToolDiscovery(run, () =>
        discoverWebMcpTools(run.targetUrl, (progress) => {
          sendEvent({
            kind: "section.progress",
            section: "tools",
            progress,
          });
        }),
      )
        .then(async (tools) => {
          for (const tool of tools) {
            sendEvent({ kind: "tool.discovered", data: tool });

            await new Promise<void>((resolve) => {
              setTimeout(resolve, 90);
            });
          }

          sendEvent({ kind: "tools.ready", data: tools });
        })
        .catch((error: unknown) => {
          console.error("WebMCP tool discovery failed", {
            runId,
            targetHostname: run.targetHostname,
            error,
          });
          sendEvent({
            kind: "tools.failed",
            message:
              "The website could not be opened in the discovery browser, or its WebMCP tools could not be read.",
          });
        })
        .finally(() => {
          discoveryFinished = true;
          finishIfReady();
        });

      request.signal.addEventListener("abort", () => {
        closed = true;
        clearTimers();
      });
    },
    cancel: () => {
      closed = true;
      clearTimers();
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
