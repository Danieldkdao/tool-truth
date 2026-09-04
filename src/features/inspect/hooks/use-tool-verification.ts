"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

import type {
  ContractAnalysisData,
  DetectedTool,
  ExecutionEvidenceData,
  ToolVerificationStatus,
} from "@/features/inspect/components/inspection-data";
import type {
  BrowserSessionView,
  SectionProgress,
  VerificationStreamEvent,
} from "@/features/inspect/components/inspection-stream";

export type ToolVerificationRecord = {
  attempt: number;
  probeId: string | null;
  status: ToolVerificationStatus;
  error: string | null;
  browserSession: BrowserSessionView | null;
  evidenceData: ExecutionEvidenceData | null;
  analysisData: ContractAnalysisData | null;
  verifiedTool: DetectedTool | null;
  evidenceProgress: SectionProgress;
  analysisProgress: SectionProgress;
};

type VerificationState = {
  records: Record<string, ToolVerificationRecord>;
  isRunningAll: boolean;
};

type VerificationAction =
  | { type: "starting"; toolId: string; attempt: number }
  | {
      type: "event";
      toolId: string;
      attempt: number;
      event: VerificationStreamEvent;
    }
  | { type: "failed"; toolId: string; attempt: number; message: string }
  | { type: "batch.started" }
  | { type: "batch.completed" };

const createInitialRecord = (attempt = 0): ToolVerificationRecord => ({
  attempt,
  probeId: null,
  status: "idle",
  error: null,
  browserSession: null,
  evidenceData: null,
  analysisData: null,
  verifiedTool: null,
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
      ...createInitialRecord(action.attempt),
      status: "running",
      evidenceProgress: {
        value: 5,
        message: "Creating a disposable verification probe",
      },
    }));
  }

  const activeRecord = state.records[action.toolId];
  if (!activeRecord || activeRecord.attempt !== action.attempt) {
    return state;
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
      case "browser.session.updated":
        return { ...record, browserSession: event.data };
      case "tool.ready":
        return { ...record, verifiedTool: event.data };
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
        return { ...record, probeId: event.probeId };
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

const createAbortError = () => {
  return new DOMException("The verification was cancelled.", "AbortError");
};

const isAbortError = (error: unknown) => {
  return error instanceof DOMException && error.name === "AbortError";
};

const linkAbortSignal = (
  controller: AbortController,
  signal?: AbortSignal,
) => {
  if (!signal) return () => undefined;

  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  return () => signal.removeEventListener("abort", abort);
};

export const useToolVerification = (runId: string) => {
  const [state, dispatch] = useReducer(reduceVerification, initialState);
  const sourceRef = useRef<EventSource | null>(null);
  const operationActiveRef = useRef(false);
  const operationControllerRef = useRef<AbortController | null>(null);
  const nextAttemptRef = useRef(0);

  const closeSource = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  useEffect(
    () => () => {
      operationControllerRef.current?.abort();
      closeSource();
    },
    [closeSource],
  );

  const runOneVerification = useCallback(
    async (toolId: string, attempt: number, signal: AbortSignal) => {
      closeSource();
      dispatch({ type: "starting", toolId, attempt });

      try {
        if (signal.aborted) throw createAbortError();
        const response = await fetch(
          `/api/inspection/${encodeURIComponent(runId)}/probe`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ toolId }),
            signal,
          },
        );

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        const body = (await response.json()) as { eventsUrl?: unknown };
        if (typeof body.eventsUrl !== "string") {
          throw new Error("The verification stream URL was not returned.");
        }

        await new Promise<void>((resolve, reject) => {
          const source = new EventSource(body.eventsUrl as string);
          sourceRef.current = source;
          let settled = false;
          let handleAbort: () => void = () => undefined;

          const finish = (error?: Error) => {
            if (settled) {
              return;
            }

            settled = true;
            signal.removeEventListener("abort", handleAbort);
            if (sourceRef.current === source) {
              closeSource();
            } else {
              source.close();
            }
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          };

          handleAbort = () => finish(createAbortError());
          signal.addEventListener("abort", handleAbort, { once: true });

          const handleVerificationEvent = (message: MessageEvent<string>) => {
            let event: VerificationStreamEvent;
            try {
              event = JSON.parse(message.data) as VerificationStreamEvent;
            } catch {
              return;
            }

            dispatch({ type: "event", toolId, attempt, event });
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
                attempt,
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
          attempt,
          message:
            isAbortError(error)
              ? "The verification was cancelled."
              : error instanceof Error
              ? error.message
              : "The verification probe could not be started.",
        });
        closeSource();
        if (isAbortError(error)) throw error;
      }
    },
    [closeSource, runId],
  );

  const runExclusiveOperation = useCallback(
    async (
      operation: (signal: AbortSignal) => Promise<void>,
      signal?: AbortSignal,
    ) => {
      if (operationActiveRef.current) return false;
      if (signal?.aborted) throw createAbortError();

      operationActiveRef.current = true;
      const controller = new AbortController();
      operationControllerRef.current = controller;
      const unlinkSignal = linkAbortSignal(controller, signal);

      try {
        await operation(controller.signal);
        return true;
      } catch (error) {
        if (isAbortError(error) && !signal?.aborted) return true;
        throw error;
      } finally {
        unlinkSignal();
        if (operationControllerRef.current === controller) {
          operationControllerRef.current = null;
        }
        operationActiveRef.current = false;
      }
    },
    [],
  );

  const startVerification = useCallback(
    (toolId: string, signal?: AbortSignal) => {
      return runExclusiveOperation(async (operationSignal) => {
        nextAttemptRef.current += 1;
        await runOneVerification(
          toolId,
          nextAttemptRef.current,
          operationSignal,
        );
      }, signal);
    },
    [runExclusiveOperation, runOneVerification],
  );

  const runAllVerifications = useCallback(
    (toolIds: string[], signal?: AbortSignal) => {
      if (toolIds.length === 0) return Promise.resolve(false);

      return runExclusiveOperation(async (operationSignal) => {
        dispatch({ type: "batch.started" });
        try {
          for (const toolId of toolIds) {
            if (operationSignal.aborted) throw createAbortError();
            nextAttemptRef.current += 1;
            await runOneVerification(
              toolId,
              nextAttemptRef.current,
              operationSignal,
            );
          }
        } finally {
          dispatch({ type: "batch.completed" });
        }
      }, signal);
    },
    [runExclusiveOperation, runOneVerification],
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
