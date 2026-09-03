import type { DetectedTool } from "@/features/inspect/components/inspection-data";
import type { InspectionSessionSnapshot } from "@/features/inspect/hooks/use-inspection-session-controller";
import { toEvidenceView } from "@/features/inspect/webmcp/tool-helpers";

const getSessionStatus = (snapshot: InspectionSessionSnapshot) => {
  if (snapshot.runError) return "error";
  if (snapshot.toolDiscoveryError) return "discovery_error";
  if (!snapshot.tools) return "discovering";
  if (snapshot.isBusy) return "verifying";
  return "ready";
};

const summarizeVerification = (
  snapshot: InspectionSessionSnapshot,
  tool: DetectedTool,
) => {
  const record = snapshot.verificationRecords[tool.id];

  return {
    toolId: tool.id,
    toolName: tool.name,
    status: record?.status ?? "idle",
    verdict: record?.analysisData?.verdict ?? null,
    unexpectedStateChanges:
      record?.analysisData?.unexpectedStateChanges ?? null,
    error: record?.error ?? null,
    hasEvidence: Boolean(record?.evidenceData),
  };
};

export const createInspectionContextResult = (
  snapshot: InspectionSessionSnapshot,
) => ({
  runId: snapshot.runId,
  status: getSessionStatus(snapshot),
  selectedToolId: snapshot.selectedToolId,
  evidenceView: toEvidenceView(snapshot.activeEvidenceTab),
  isBusy: snapshot.isBusy,
  isRunningAll: snapshot.isRunningAll,
  errors: {
    discovery: snapshot.toolDiscoveryError,
    run: snapshot.runError,
  },
  progress: snapshot.progress,
  tools:
    snapshot.tools?.map((tool) => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema ?? null,
      annotations: tool.annotations ?? null,
      verification: summarizeVerification(snapshot, tool),
    })) ?? [],
});

export const createVerificationResult = (
  snapshot: InspectionSessionSnapshot,
  toolId: string,
) => {
  const tool = snapshot.tools?.find((candidate) => candidate.id === toolId);
  const record = snapshot.verificationRecords[toolId];

  if (!tool || !record) {
    throw new Error("The completed verification result is unavailable.");
  }

  return {
    runId: snapshot.runId,
    tool: {
      id: tool.id,
      name: tool.name,
      description: tool.description,
    },
    status: record.status,
    verdict: record.analysisData?.verdict ?? null,
    analysis: record.analysisData,
    evidence: record.evidenceData,
    error: record.error,
    selectedToolId: snapshot.selectedToolId,
    evidenceView: toEvidenceView(snapshot.activeEvidenceTab),
  };
};

export const createBatchVerificationResult = (
  snapshot: InspectionSessionSnapshot,
) => ({
  runId: snapshot.runId,
  status: "completed",
  results:
    snapshot.tools?.map((tool) => summarizeVerification(snapshot, tool)) ?? [],
});
