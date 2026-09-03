"use client";

import { useCallback, useMemo, useState } from "react";

import type {
  DetectedTool,
  EvidenceTab,
  ToolVerificationStatus,
} from "@/features/inspect/components/inspection-data";
import { useInspectionRunStream } from "@/features/inspect/hooks/use-inspection-run-stream";
import {
  type ToolVerificationRecord,
  useToolVerification,
} from "@/features/inspect/hooks/use-tool-verification";

type InspectionRunStreamState = ReturnType<typeof useInspectionRunStream>;

export type InspectionEvidenceFocus = {
  toolId?: string;
  tab?: EvidenceTab;
};

export type InspectionSessionSnapshot = {
  runId: string;
  tools: DetectedTool[] | null;
  browserData: InspectionRunStreamState["browserData"];
  evidenceData: InspectionRunStreamState["evidenceData"];
  analysisData: InspectionRunStreamState["analysisData"];
  selectedToolId: string | null;
  selectedTool: DetectedTool | null;
  activeEvidenceTab: EvidenceTab;
  selectedVerification: ToolVerificationRecord | undefined;
  verificationRecords: Record<string, ToolVerificationRecord>;
  verificationStatuses: Record<
    string,
    ToolVerificationStatus | undefined
  >;
  isBusy: boolean;
  isRunningAll: boolean;
  toolDiscoveryError: string | null;
  runError: InspectionRunStreamState["runError"];
  progress: InspectionRunStreamState["progress"];
};

export type InspectionSessionController = {
  snapshot: InspectionSessionSnapshot;
  focusEvidence: (focus: InspectionEvidenceFocus) => boolean;
  startVerification: (
    toolId?: string,
    signal?: AbortSignal,
  ) => Promise<boolean>;
  runAllVerifications: (signal?: AbortSignal) => Promise<boolean>;
};

export const useInspectionSessionController = (
  runId: string,
): InspectionSessionController => {
  const run = useInspectionRunStream(runId);
  const {
    records: verificationRecords,
    isAnyRunning,
    isRunningAll,
    startVerification: startToolVerification,
    runAllVerifications: runToolVerifications,
  } = useToolVerification(runId);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [activeEvidenceTab, setActiveEvidenceTab] =
    useState<EvidenceTab>("Timeline");

  const resolvedToolId =
    selectedToolId && run.tools?.some((tool) => tool.id === selectedToolId)
      ? selectedToolId
      : (run.tools?.[0]?.id ?? null);
  const selectedTool =
    run.tools?.find((tool) => tool.id === resolvedToolId) ?? null;
  const selectedVerification = resolvedToolId
    ? verificationRecords[resolvedToolId]
    : undefined;
  const isBusy = isAnyRunning || isRunningAll;

  const verificationStatuses = useMemo(
    () =>
      run.tools?.reduce<
        Record<string, ToolVerificationStatus | undefined>
      >((statuses, tool) => {
        statuses[tool.id] = verificationRecords[tool.id]?.status;
        return statuses;
      }, {}) ?? {},
    [run.tools, verificationRecords],
  );

  const focusEvidence = useCallback(
    ({ toolId, tab }: InspectionEvidenceFocus) => {
      if (toolId && !run.tools?.some((tool) => tool.id === toolId)) {
        return false;
      }

      if (toolId) setSelectedToolId(toolId);
      if (tab) setActiveEvidenceTab(tab);
      return true;
    },
    [run.tools],
  );

  const startVerification = useCallback(
    async (toolId?: string, signal?: AbortSignal) => {
      const targetToolId = toolId ?? resolvedToolId;
      if (!targetToolId || isBusy) return false;
      if (!focusEvidence({ toolId: targetToolId, tab: "Timeline" })) {
        return false;
      }

      return startToolVerification(targetToolId, signal);
    },
    [focusEvidence, isBusy, resolvedToolId, startToolVerification],
  );

  const runAllVerifications = useCallback(async (signal?: AbortSignal) => {
    const toolIds = run.tools?.map((tool) => tool.id) ?? [];
    if (toolIds.length === 0 || isBusy) return false;

    return runToolVerifications(toolIds, signal);
  }, [isBusy, run.tools, runToolVerifications]);

  const snapshot = useMemo<InspectionSessionSnapshot>(
    () => ({
      runId,
      tools: run.tools,
      browserData: run.browserData,
      evidenceData: run.evidenceData,
      analysisData: run.analysisData,
      selectedToolId: resolvedToolId,
      selectedTool,
      activeEvidenceTab,
      selectedVerification,
      verificationRecords,
      verificationStatuses,
      isBusy,
      isRunningAll,
      toolDiscoveryError: run.toolDiscoveryError,
      runError: run.runError,
      progress: run.progress,
    }),
    [
      activeEvidenceTab,
      isBusy,
      isRunningAll,
      resolvedToolId,
      run.analysisData,
      run.browserData,
      run.evidenceData,
      run.progress,
      run.runError,
      run.toolDiscoveryError,
      run.tools,
      runId,
      selectedTool,
      selectedVerification,
      verificationRecords,
      verificationStatuses,
    ],
  );

  return {
    snapshot,
    focusEvidence,
    startVerification,
    runAllVerifications,
  };
};
