"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

import type {
  ContractAnalysisData,
  ExecutionEvidenceData,
  ToolVerificationStatus,
} from "@/features/inspect/components/inspection-data";
import type {
  SectionProgress,
  VerificationStreamEvent,
} from "@/features/inspect/components/inspection-stream";

export type ToolVerificationRecord = {
  status: ToolVerificationStatus;
  error: string | null;
  evidenceData: ExecutionEvidenceData | null;
  analysisData: ContractAnalysisData | null;
  evidenceProgress: SectionProgress;
  analysisProgress: SectionProgress;
};

type VerificationState = {
  records: Record<string, ToolVerificationRecord>;
  isRunningAll: boolean;
};

type VerificationAction =
  | { type: "starting"; toolId: string }
  | { type: "event"; toolId: string; event: VerificationStreamEvent }
  | { type: "failed"; toolId: string; message: string }
  | { type: "batch.started" }
  | { type: "batch.completed" };

const createInitialRecord = (): ToolVerificationRecord => ({
  status: "idle",
  error: null,
  evidenceData: null,
  analysisData: null,
  evidenceProgress: {
    value: 5,
    message: "Waiting to start a verification probe",
  },
  analysisProgress: {
    value: 5,
    message: "Waiting for runtime evidence",
  },
});

const initialState: VerificationState = {
  records: {},
  isRunningAll: false,
};

const getAnalysisStatus = (
  data: ContractAnalysisData,
): ToolVerificationStatus => {
  return data.verdict === "pending" ? "running" : data.verdict;
};

const updateRecord = (
  state: VerificationState,
  toolId: string,
  update: (record: ToolVerificationRecord) => ToolVerificationRecord,
): VerificationState => {
  const record = state.records[toolId] ?? createInitialRecord();
  return {
    ...state,
    records: {
      ...state.records,
      [toolId]: update(record),
    },
  };
};

const reduceVerification = (
  state: VerificationState,
  action: VerificationAction,
): VerificationState => {
  if (action.type === "batch.started") {
    return { ...state, isRunningAll: true };
  }

  if (action.type === "batch.completed") {
    return { ...state, isRunningAll: false };
  }

  if (action.type === "starting") {
    return updateRecord(state, action.toolId, () => ({
      ...createInitialRecord(),
      status: "running",
      evidenceProgress: {
        value: 5,
        message: "Creating a disposable verification probe",
      },
    }));
  }

  if (action.type === "failed") {
    return updateRecord(state, action.toolId, (record) => ({
      ...record,
      status: "error",
      error: action.message,
    }));
  }

  const { event, toolId } = action;
  return updateRecord(state, toolId, (record) => {
    switch (event.kind) {
      case "section.progress":
        return event.section === "evidence"
          ? { ...record, evidenceProgress: event.progress }
          : { ...record, analysisProgress: event.progress };
      case "evidence.ready":
        return { ...record, evidenceData: event.data };
      case "analysis.ready":
        return {
          ...record,
          analysisData: event.data,
        };
      case "probe.failed":
        return { ...record, status: "error", error: event.message };
      case "probe.completed":
        return record.analysisData
          ? {
              ...record,
              status: getAnalysisStatus(record.analysisData),
              error: null,
            }
          : {
              ...record,
              status: "error",
              error: "The probe completed without returning an analysis.",
            };
      case "probe.connected":
        return record;
    }
  });
};

const readErrorMessage = async (response: Response) => {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string"
      ? body.error
      : "The verification probe could not be started.";
  } catch {
    return "The verification probe could not be started.";
  }
};

export const useToolVerification = (runId: string) => {
  const [state, dispatch] = useReducer(reduceVerification, initialState);
  const sourceRef = useRef<EventSource | null>(null);
  const operationActiveRef = useRef(false);

  const closeSource = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  useEffect(() => closeSource, [closeSource]);

  const runOneVerification = useCallback(
    async (toolId: string) => {
      closeSource();
      dispatch({ type: "starting", toolId });

      try {
        const response = await fetch(
          `/api/inspection/${encodeURIComponent(runId)}/probe`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ toolId }),
          },
        );

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        const body = (await response.json()) as { eventsUrl?: unknown };
        if (typeof body.eventsUrl !== "string") {
          throw new Error("The verification stream URL was not returned.");
        }

        await new Promise<void>((resolve) => {
          const source = new EventSource(body.eventsUrl as string);
          sourceRef.current = source;
          let settled = false;

          const finish = () => {
            if (settled) {
              return;
            }

            settled = true;
            if (sourceRef.current === source) {
              closeSource();
            } else {
              source.close();
            }
            resolve();
          };

          const handleVerificationEvent = (message: MessageEvent<string>) => {
            let event: VerificationStreamEvent;
            try {
              event = JSON.parse(message.data) as VerificationStreamEvent;
            } catch {
              return;
            }

            dispatch({ type: "event", toolId, event });
            if (
              event.kind === "probe.completed" ||
              event.kind === "probe.failed"
            ) {
              finish();
            }
          };

          source.addEventListener("verification", handleVerificationEvent);
          source.onerror = () => {
            if (!settled && sourceRef.current === source) {
              dispatch({
                type: "failed",
                toolId,
                message:
                  "The verification stream disconnected before completion.",
              });
              finish();
            }
          };
        });
      } catch (error) {
        dispatch({
          type: "failed",
          toolId,
          message:
            error instanceof Error
              ? error.message
              : "The verification probe could not be started.",
        });
        closeSource();
      }
    },
    [closeSource, runId],
  );

  const startVerification = useCallback(
    async (toolId: string) => {
      if (operationActiveRef.current) {
        return;
      }

      operationActiveRef.current = true;
      try {
        await runOneVerification(toolId);
      } finally {
        operationActiveRef.current = false;
      }
    },
    [runOneVerification],
  );

  const runAllVerifications = useCallback(
    async (toolIds: string[]) => {
      if (operationActiveRef.current || toolIds.length === 0) {
        return;
      }

      operationActiveRef.current = true;
      dispatch({ type: "batch.started" });
      try {
        for (const toolId of toolIds) {
          await runOneVerification(toolId);
        }
      } finally {
        operationActiveRef.current = false;
        dispatch({ type: "batch.completed" });
      }
    },
    [runOneVerification],
  );

  const isAnyRunning = Object.values(state.records).some(
    (record) => record.status === "running",
  );

  return {
    ...state,
    isAnyRunning,
    startVerification,
    runAllVerifications,
  };
};
