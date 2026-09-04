import { sanitizeForExport } from "@/features/inspect/lib/report-redaction";
import { selectHydratableProbes } from "@/features/inspect/lib/probe-history";
import { getInspectionRun } from "@/features/inspect/server/inspection-run-store";
import type { ParamsId } from "@/lib/types";

export const GET = async (
  _request: Request,
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

  const probes = selectHydratableProbes([...run.probes.values()])
    .sort((left, right) => left.createdAt - right.createdAt)
    .map((probe) => ({
      probeId: probe.id,
      toolId: probe.toolId,
      status: probe.status,
      createdAt: probe.createdAt,
      round: probe.directedTest?.round,
      parentProbeId: probe.directedTest?.parentProbeId,
      request: probe.directedTest
        ? sanitizeForExport(probe.directedTest.request)
        : undefined,
      inputHash: probe.directedTest?.inputHash,
      directedVerdict: probe.directedEvaluation?.verdict,
      contractVerdict: probe.analysisData?.verdict,
    }));

  return Response.json(
    { probes },
    { headers: { "Cache-Control": "no-store" } },
  );
};
