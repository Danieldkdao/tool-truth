import type { DetectedTool } from "@/features/inspect/components/inspection-data";
import type { InspectionSessionSnapshot } from "@/features/inspect/hooks/use-inspection-session-controller";
import {
  sanitizeDirectedAssertion,
  sanitizeDirectedEvaluation,
  sanitizeDirectedTest,
} from "@/features/inspect/lib/directed-redaction";
import { sanitizeForExport } from "@/features/inspect/lib/report-redaction";
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

const summarizeDirectedRounds = (
  snapshot: InspectionSessionSnapshot,
  toolId: string,
) =>
  (snapshot.probeOrderByToolId[toolId] ?? [])
    .map((probeId) => snapshot.recordsByProbeId[probeId])
    .filter((record) => Boolean(record?.directedTest))
    .map((record) => ({
      probeId: record.probeId,
      round: record.directedTest?.round,
      request: record.directedTest
        ? sanitizeForExport(record.directedTest.request)
        : null,
      inputHash: record.directedTest?.inputHash,
      assertions: record.directedTest
        ? record.directedTest.assertions.map(sanitizeDirectedAssertion)
        : [],
      directedVerdict: record.directedEvaluation?.verdict ?? null,
      contractVerdict: record.analysisData?.verdict ?? null,
    }));

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
      directedRounds: summarizeDirectedRounds(snapshot, tool.id),
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

export const createDirectedVerificationResult = (
  snapshot: InspectionSessionSnapshot,
  probeId: string,
) => {
  const record = snapshot.recordsByProbeId[probeId];
  if (!record?.directedTest) {
    throw new Error("The completed directed verification result is unavailable.");
  }
  const safeTest = sanitizeDirectedTest(record.directedTest);

  const result = {
    status:
      record.status === "canceled"
        ? "canceled"
        : record.status === "error"
          ? "error"
          : "completed",
    runId: snapshot.runId,
    probeId: record.probeId,
    parentProbeId: record.directedTest.parentProbeId,
    round: record.directedTest.round,
    test: {
      request: safeTest.request,
      input: safeTest.input,
      inputHash: safeTest.inputHash,
      assertions: safeTest.assertions,
    },
    directedTest: record.directedEvaluation
      ? sanitizeDirectedEvaluation(record.directedEvaluation)
      : { verdict: "not_run", checks: [] },
    contract: record.analysisData
      ? {
          verdict: record.analysisData.verdict,
          decisionBasis: record.analysisData.decisionBasis,
          evidenceStatus: record.analysisData.evidenceStatus,
        }
      : undefined,
    evidence: record.evidenceData ?? undefined,
    error: record.error ?? undefined,
  };

  return sanitizeForExport(result);
};

export const createBatchVerificationResult = (
  snapshot: InspectionSessionSnapshot,
) => ({
  runId: snapshot.runId,
  status: "completed",
  results:
    snapshot.tools?.map((tool) => summarizeVerification(snapshot, tool)) ?? [],
});
