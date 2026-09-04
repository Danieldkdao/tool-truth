import {
  sanitizeDirectedEvaluation,
  sanitizeDirectedTest,
} from "@/features/inspect/lib/directed-redaction";
import { toBrowserSessionView } from "@/features/inspect/server/inspection-browser-session";
import {
  cancelInspectionProbe,
  getInspectionProbe,
  getInspectionProbeBrowserbaseLifecycle,
  getInspectionRun,
  publishInspectionProbeEvent,
} from "@/features/inspect/server/inspection-run-store";

type ProbeParams = {
  params: Promise<{ runId: string; probeId: string }>;
};

const jsonResponse = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

export const GET = async (_request: Request, { params }: ProbeParams) => {
  const { runId, probeId } = await params;
  const run = getInspectionRun(runId);
  const probe = run ? getInspectionProbe(run, probeId) : undefined;

  if (!run || !probe) {
    return jsonResponse(
      { error: "This verification probe was not found or has expired." },
      404,
    );
  }

  return jsonResponse({
    probeId: probe.id,
    toolId: probe.toolId,
    status: probe.status,
    createdAt: probe.createdAt,
    directedTest: probe.directedTest
      ? sanitizeDirectedTest(probe.directedTest)
      : undefined,
    directedTestResult: probe.directedEvaluation
      ? sanitizeDirectedEvaluation(probe.directedEvaluation)
      : undefined,
    browserSession: (() => {
      const lifecycle = getInspectionProbeBrowserbaseLifecycle(run, probe);
      return lifecycle ? toBrowserSessionView(lifecycle, run.targetUrl) : undefined;
    })(),
    tool: probe.verifiedTool,
    evidence: probe.evidenceData,
    contract: probe.analysisData,
    error: probe.failureMessage,
    lastEventSequence: probe.nextEventSequence - 1,
  });
};

export const DELETE = async (_request: Request, { params }: ProbeParams) => {
  const { runId, probeId } = await params;
  const run = getInspectionRun(runId);
  const probe = run ? getInspectionProbe(run, probeId) : undefined;

  if (!probe) {
    return jsonResponse(
      { error: "This verification probe was not found or has expired." },
      404,
    );
  }

  if (["completed", "failed", "canceled"].includes(probe.status)) {
    return jsonResponse({ probeId: probe.id, status: probe.status });
  }

  cancelInspectionProbe(probe);
  if (probe.status === "queued") {
    publishInspectionProbeEvent(probe, {
      kind: "probe.canceled",
      toolId: probe.toolId,
      message: "The verification was canceled before it started.",
    });
  }

  return jsonResponse({ probeId: probe.id, status: "canceling" }, 202);
};
