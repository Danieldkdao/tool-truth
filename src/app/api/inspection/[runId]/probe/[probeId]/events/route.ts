import type { VerificationStreamEvent } from "@/features/inspect/components/inspection-stream";
import {
  getInspectionBrowserSession,
  getInspectionProbe,
  getInspectionRun,
  getOrStartInspectionProbe,
  publishInspectionProbeEvent,
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

  const browserSession = getInspectionBrowserSession(run);
  if (!browserSession) {
    return Response.json(
      {
        error:
          "The browser session for this inspection is no longer available. Start a new inspection.",
      },
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

      controller.enqueue(encoder.encode("retry: 1500\n: verification stream ready\n\n"));
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

      void getOrStartInspectionProbe(probe, async () => {
        try {
          await runToolVerification({
            runId: run.id,
            probeId: probe.id,
            targetUrl: run.targetUrl,
            selectedTool,
            browserSession: await browserSession,
            report: (event) => publishInspectionProbeEvent(probe, event),
          });
        } catch (error) {
          console.error("ToolTruth verification failed", {
            runId: run.id,
            probeId: probe.id,
            toolId: probe.toolId,
            error,
          });
          publishInspectionProbeEvent(probe, {
            kind: "probe.failed",
            toolId: probe.toolId,
            message:
              error instanceof Error
                ? error.message
                : "The verification could not be completed.",
          });
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
