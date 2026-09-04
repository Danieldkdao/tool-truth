import type { InspectionSessionSnapshot } from "@/features/inspect/hooks/use-inspection-session-controller";
import type { EvidenceReceiptSource } from "@/features/inspect/lib/evidence-receipt";

type EvidenceReceiptSelection = {
  toolId?: string | null;
  probeId?: string;
};

export const createEvidenceReceiptSourceFromSnapshot = (
  snapshot: InspectionSessionSnapshot,
  selection: EvidenceReceiptSelection = {},
): EvidenceReceiptSource | null => {
  const selectedRecord = selection.probeId
    ? snapshot.recordsByProbeId[selection.probeId]
    : undefined;

  if (selection.probeId && !selectedRecord) {
    return null;
  }

  const toolId =
    selection.toolId ?? selectedRecord?.toolId ?? snapshot.selectedToolId;

  if (!toolId || (selectedRecord && selectedRecord.toolId !== toolId)) {
    return null;
  }

  const tool = snapshot.tools?.find((candidate) => candidate.id === toolId);
  const record =
    selectedRecord ?? snapshot.verificationRecords[toolId];

  if (
    !tool ||
    !record?.probeId ||
    !record.evidenceData ||
    !record.analysisData
  ) {
    return null;
  }

  const verifiedTool = record.verifiedTool ?? tool;

  return {
    runId: snapshot.runId,
    probeId: record.probeId,
    attempt: record.attempt,
    status: record.status,
    error: record.error,
    selectedTool: verifiedTool,
    discoveredTools: snapshot.tools
      ? snapshot.tools.map((candidate) =>
          candidate.id === toolId ? verifiedTool : candidate,
        )
      : [verifiedTool],
    browserData: snapshot.browserData,
    browserSession: record.browserSession ?? snapshot.browserSession,
    evidence: record.evidenceData,
    analysis: record.analysisData,
    directedTest: record.directedTest,
    directedEvaluation: record.directedEvaluation,
  };
};
