"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

import type {
  ContractAnalysisData,
  DetectedTool,
  DirectedTestDefinition,
  DirectedTestEvaluation,
  ExecutionEvidenceData,
  ToolVerificationStatus,
} from "@/features/inspect/components/inspection-data";
import type {
  BrowserSessionView,
  SectionProgress,
  VerificationStreamEvent,
} from "@/features/inspect/components/inspection-stream";
import { mergeHydratedProbeRecords } from "@/features/inspect/lib/probe-history";
import { shouldApplyEventSequence } from "@/features/inspect/lib/verification-event-order";

export type ToolVerificationRecord = {
  attempt: number;
  probeId: string;
  toolId: string;
  status: ToolVerificationStatus;
  error: string | null;
  browserSession: BrowserSessionView | null;
  evidenceData: ExecutionEvidenceData | null;
  analysisData: ContractAnalysisData | null;
  verifiedTool: DetectedTool | null;
  directedTest: DirectedTestDefinition | null;
  directedEvaluation: DirectedTestEvaluation | null;
  evidenceProgress: SectionProgress;
  analysisProgress: SectionProgress;
  lastEventSequence: number;
};

export type VerificationState = {
  recordsByProbeId: Record<string, ToolVerificationRecord>;
  probeOrderByToolId: Record<string, string[]>;
  activeProbeIdByToolId: Record<string, string>;
  isRunningAll: boolean;
};

type VerificationAction =
  | {
      type: "starting";
      toolId: string;
      probeId: string;
      attempt: number;
      directedTest?: DirectedTestDefinition;
    }
  | {
      type: "event";
      probeId: string;
      sequence: number;
      event: VerificationStreamEvent;
    }
  | { type: "failed"; probeId: string; message: string }
  | { type: "hydrated"; records: ToolVerificationRecord[] }
  | { type: "selected"; toolId: string; probeId: string }
  | { type: "batch.started" }
  | { type: "batch.completed" };

type DirectedStartResult =
  | { started: true; probeId: string }
  | { started: false; result: unknown };

type ProbeDetailResponse = {
  probeId: string;
  toolId: string;
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  directedTest?: DirectedTestDefinition;
  directedTestResult?: DirectedTestEvaluation;
  tool?: DetectedTool;
  evidence?: ExecutionEvidenceData;
  contract?: ContractAnalysisData;
  error?: string;
  browserSession?: BrowserSessionView;
  lastEventSequence?: number;
};

const createInitialRecord = (
  toolId: string,
  probeId: string,
  attempt = 0,
): ToolVerificationRecord => ({
  attempt,
  probeId,
  toolId,
  status: "idle",
  error: null,
  browserSession: null,
  evidenceData: null,
  analysisData: null,
  verifiedTool: null,
  directedTest: null,
  directedEvaluation: null,
  evidenceProgress: {
    value: 5,
    message: "Waiting to start a verification probe",
  },
  analysisProgress: {
    value: 5,
    message: "Waiting for runtime evidence",
  },
  lastEventSequence: 0,
});

const initialState: VerificationState = {
  recordsByProbeId: {},
  probeOrderByToolId: {},
  activeProbeIdByToolId: {},
  isRunningAll: false,
};

const getAnalysisStatus = (
  data: ContractAnalysisData,
): ToolVerificationStatus =>
  data.verdict === "pending" ? "running" : data.verdict;

const appendProbe = (
  order: Record<string, string[]>,
  toolId: string,
  probeId: string,
) => ({
  ...order,
  [toolId]: order[toolId]?.includes(probeId)
    ? order[toolId]
    : [...(order[toolId] ?? []), probeId],
});

const updateProbeRecord = (
  state: VerificationState,
  probeId: string,
  update: (record: ToolVerificationRecord) => ToolVerificationRecord,
) => {
  const record = state.recordsByProbeId[probeId];
  if (!record) return state;
  return {
    ...state,
    recordsByProbeId: {
      ...state.recordsByProbeId,
      [probeId]: update(record),
    },
  };
};

const reduceVerification = (
  state: VerificationState,
  action: VerificationAction,
): VerificationState => {
  if (action.type === "batch.started") return { ...state, isRunningAll: true };
  if (action.type === "batch.completed") return { ...state, isRunningAll: false };

  if (action.type === "hydrated") {
    return {
      ...state,
      ...mergeHydratedProbeRecords(state, action.records),
    };
  }

  if (action.type === "selected") {
    const record = state.recordsByProbeId[action.probeId];
    if (!record || record.toolId !== action.toolId) return state;
    return {
      ...state,
      activeProbeIdByToolId: {
        ...state.activeProbeIdByToolId,
        [action.toolId]: action.probeId,
      },
    };
  }

  if (action.type === "starting") {
    return {
      ...state,
      recordsByProbeId: {
        ...state.recordsByProbeId,
        [action.probeId]: {
          ...createInitialRecord(action.toolId, action.probeId, action.attempt),
          status: "running",
          directedTest: action.directedTest ?? null,
          evidenceProgress: {
            value: 5,
            message: "Creating a disposable verification probe",
          },
        },
      },
      probeOrderByToolId: appendProbe(
        state.probeOrderByToolId,
        action.toolId,
        action.probeId,
      ),
      activeProbeIdByToolId: {
        ...state.activeProbeIdByToolId,
        [action.toolId]: action.probeId,
      },
    };
  }

  if (action.type === "failed") {
    return updateProbeRecord(state, action.probeId, (record) => ({
      ...record,
      status: "error",
      error: action.message,
    }));
  }

  const current = state.recordsByProbeId[action.probeId];
  if (
    !current ||
    !shouldApplyEventSequence(current.lastEventSequence, action.sequence)
  ) {
    return state;
  }

  return updateProbeRecord(state, action.probeId, (record) => {
    const sequenced = {
      ...record,
      lastEventSequence: Math.max(record.lastEventSequence, action.sequence),
    };
    switch (action.event.kind) {
      case "directed.started":
        return { ...sequenced, directedTest: action.event.data };
      case "directed.ready":
        return { ...sequenced, directedEvaluation: action.event.data };
      case "section.progress":
        return action.event.section === "evidence"
          ? { ...sequenced, evidenceProgress: action.event.progress }
          : { ...sequenced, analysisProgress: action.event.progress };
      case "browser.session.updated":
        return { ...sequenced, browserSession: action.event.data };
      case "tool.ready":
        return { ...sequenced, verifiedTool: action.event.data };
      case "evidence.ready":
        return { ...sequenced, evidenceData: action.event.data };
      case "analysis.ready":
        return { ...sequenced, analysisData: action.event.data };
      case "probe.failed":
        return { ...sequenced, status: "error", error: action.event.message };
      case "probe.canceled":
        return {
          ...sequenced,
          status: "canceled",
          error: action.event.message,
        };
      case "probe.completed":
        return sequenced.analysisData
          ? {
              ...sequenced,
              status: getAnalysisStatus(sequenced.analysisData),
              error: null,
            }
          : {
              ...sequenced,
              status: "error",
              error: "The probe completed without returning an analysis.",
            };
      case "probe.connected":
        return sequenced;
    }
  });
};

const readResponseBody = async (response: Response) => {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const readErrorMessage = (body: Record<string, unknown>) =>
  typeof body.error === "string"
    ? body.error
    : "The verification probe could not be started.";

const createAbortError = () =>
  new DOMException("The verification was canceled.", "AbortError");

const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

const linkAbortSignal = (controller: AbortController, signal?: AbortSignal) => {
  if (!signal) return () => undefined;
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  return () => signal.removeEventListener("abort", abort);
};

const toHydratedRecord = (detail: ProbeDetailResponse) => {
  const record = createInitialRecord(detail.toolId, detail.probeId);
  const status: ToolVerificationStatus =
    detail.status === "completed" && detail.contract
      ? getAnalysisStatus(detail.contract)
      : detail.status === "failed"
        ? "error"
        : detail.status === "queued" || detail.status === "completed"
          ? "running"
          : detail.status;
  return {
    ...record,
    status,
    error: detail.error ?? null,
    browserSession: detail.browserSession ?? null,
    evidenceData: detail.evidence ?? null,
    analysisData: detail.contract ?? null,
    verifiedTool: detail.tool ?? null,
    directedTest: detail.directedTest ?? null,
    directedEvaluation: detail.directedTestResult ?? null,
    lastEventSequence: detail.lastEventSequence ?? 0,
  } satisfies ToolVerificationRecord;
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

  useEffect(() => closeSource, [closeSource]);

  useEffect(() => {
    const controller = new AbortController();
    const hydrate = async () => {
      const response = await fetch(
        `/api/inspection/${encodeURIComponent(runId)}/probes`,
        { signal: controller.signal },
      );
      if (!response.ok) return;
      const body = (await response.json()) as {
        probes?: Array<{ probeId?: unknown }>;
      };
      const probeIds = (body.probes ?? [])
        .map((probe) => probe.probeId)
        .filter((probeId): probeId is string => typeof probeId === "string");
      const details = await Promise.all(
        probeIds.map(async (probeId) => {
          const detailResponse = await fetch(
            `/api/inspection/${encodeURIComponent(runId)}/probe/${encodeURIComponent(probeId)}`,
            { signal: controller.signal },
          );
          return detailResponse.ok
            ? ((await detailResponse.json()) as ProbeDetailResponse)
            : null;
        }),
      );
      dispatch({
        type: "hydrated",
        records: details
          .filter((detail): detail is ProbeDetailResponse => detail !== null)
          .map(toHydratedRecord),
      });

      const activeDetail = details.findLast(
        (detail) => detail?.status === "running" || detail?.status === "queued",
      );
      if (activeDetail) {
        const source = new EventSource(
          `/api/inspection/${encodeURIComponent(runId)}/probe/${encodeURIComponent(activeDetail.probeId)}/events?after=${activeDetail.lastEventSequence ?? 0}`,
        );
        sourceRef.current = source;
        source.addEventListener(
          "verification",
          (message: MessageEvent<string>) => {
            let event: VerificationStreamEvent;
            try {
              event = JSON.parse(message.data) as VerificationStreamEvent;
            } catch {
              return;
            }
            const sequence = Number(message.lastEventId);
            dispatch({
              type: "event",
              probeId: activeDetail.probeId,
              sequence: Number.isSafeInteger(sequence) ? sequence : 0,
              event,
            });
            if (
              event.kind === "probe.completed" ||
              event.kind === "probe.failed" ||
              event.kind === "probe.canceled"
            ) {
              source.close();
              if (sourceRef.current === source) sourceRef.current = null;
            }
          },
        );
      }
    };
    void hydrate().catch(() => undefined);
    return () => controller.abort();
  }, [runId]);

  const runOneVerification = useCallback(
    async (
      toolId: string,
      attempt: number,
      requestBody: Record<string, unknown>,
      signal: AbortSignal,
      directed: boolean,
    ): Promise<DirectedStartResult> => {
      closeSource();
      if (signal.aborted) throw createAbortError();
      const response = await fetch(
        `/api/inspection/${encodeURIComponent(runId)}/probe`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal,
        },
      );
      const body = await readResponseBody(response);

      if (!response.ok) {
        if (directed) return { started: false, result: body };
        throw new Error(readErrorMessage(body));
      }

      const probeId = body.probeId;
      const eventsUrl = body.eventsUrl;
      if (typeof probeId !== "string" || typeof eventsUrl !== "string") {
        throw new Error("The verification stream details were not returned.");
      }

      dispatch({
        type: "starting",
        toolId,
        probeId,
        attempt,
        directedTest: body.directedTest as DirectedTestDefinition | undefined,
      });

      try {
        await new Promise<void>((resolve, reject) => {
          const source = new EventSource(eventsUrl);
          sourceRef.current = source;
          let settled = false;
          let handleAbort = () => undefined;
          let disconnectTimer: number | undefined;

          const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            if (disconnectTimer !== undefined) {
              window.clearTimeout(disconnectTimer);
            }
            signal.removeEventListener("abort", handleAbort);
            if (sourceRef.current === source) closeSource();
            else source.close();
            if (error) reject(error);
            else resolve();
          };

          handleAbort = () => {
            void fetch(
              `/api/inspection/${encodeURIComponent(runId)}/probe/${encodeURIComponent(probeId)}`,
              { method: "DELETE", keepalive: true },
            );
            finish(createAbortError());
          };
          signal.addEventListener("abort", handleAbort, { once: true });
          source.onopen = () => {
            if (disconnectTimer !== undefined) {
              window.clearTimeout(disconnectTimer);
              disconnectTimer = undefined;
            }
          };

          source.addEventListener(
            "verification",
            (message: MessageEvent<string>) => {
              let event: VerificationStreamEvent;
              try {
                event = JSON.parse(message.data) as VerificationStreamEvent;
              } catch {
                return;
              }
              const sequence = Number(message.lastEventId);
              dispatch({
                type: "event",
                probeId,
                sequence: Number.isSafeInteger(sequence) ? sequence : 0,
                event,
              });
              if (
                event.kind === "probe.completed" ||
                event.kind === "probe.failed" ||
                event.kind === "probe.canceled"
              ) {
                finish();
              }
            },
          );
          source.onerror = () => {
            if (settled || disconnectTimer !== undefined) return;
            disconnectTimer = window.setTimeout(() => {
              finish(
                new Error(
                  "The verification stream could not reconnect after a short grace period.",
                ),
              );
            }, 10_000);
          };
        });
      } catch (error) {
        dispatch({
          type: "failed",
          probeId,
          message:
            isAbortError(error)
              ? "The verification was canceled."
              : error instanceof Error
                ? error.message
                : "The verification probe could not be completed.",
        });
        closeSource();
        if (isAbortError(error)) throw error;
      }

      return { started: true, probeId };
    },
    [closeSource, runId],
  );

  const runExclusiveOperation = useCallback(
    async <Result,>(
      operation: (signal: AbortSignal) => Promise<Result>,
      signal?: AbortSignal,
    ): Promise<Result | false> => {
      if (operationActiveRef.current) return false;
      if (signal?.aborted) throw createAbortError();
      operationActiveRef.current = true;
      const controller = new AbortController();
      operationControllerRef.current = controller;
      const unlinkSignal = linkAbortSignal(controller, signal);
      try {
        return await operation(controller.signal);
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
    async (toolId: string, signal?: AbortSignal) => {
      const result = await runExclusiveOperation(async (operationSignal) => {
        nextAttemptRef.current += 1;
        return runOneVerification(
          toolId,
          nextAttemptRef.current,
          { toolId },
          operationSignal,
          false,
        );
      }, signal);
      return result !== false && result.started;
    },
    [runExclusiveOperation, runOneVerification],
  );

  const startDirectedVerification = useCallback(
    async (requestBody: Record<string, unknown>, signal?: AbortSignal) => {
      const toolId = String(requestBody.toolId ?? "");
      const result = await runExclusiveOperation(async (operationSignal) => {
        nextAttemptRef.current += 1;
        return runOneVerification(
          toolId,
          nextAttemptRef.current,
          requestBody,
          operationSignal,
          true,
        );
      }, signal);
      return result === false
        ? ({ started: false, result: { status: "error", error: "busy" } } as const)
        : result;
    },
    [runExclusiveOperation, runOneVerification],
  );

  const runAllVerifications = useCallback(
    async (toolIds: string[], signal?: AbortSignal) => {
      if (toolIds.length === 0) return false;
      const result = await runExclusiveOperation(async (operationSignal) => {
        dispatch({ type: "batch.started" });
        try {
          for (const toolId of toolIds) {
            if (operationSignal.aborted) throw createAbortError();
            nextAttemptRef.current += 1;
            await runOneVerification(
              toolId,
              nextAttemptRef.current,
              { toolId },
              operationSignal,
              false,
            );
          }
        } finally {
          dispatch({ type: "batch.completed" });
        }
        return true;
      }, signal);
      return result === true;
    },
    [runExclusiveOperation, runOneVerification],
  );

  const selectProbe = useCallback((toolId: string, probeId: string) => {
    dispatch({ type: "selected", toolId, probeId });
  }, []);

  const records = useMemo(() => {
    const latest: Record<string, ToolVerificationRecord> = {};
    for (const [toolId, probeId] of Object.entries(
      state.activeProbeIdByToolId,
    )) {
      const record = state.recordsByProbeId[probeId];
      if (record) latest[toolId] = record;
    }
    return latest;
  }, [state.activeProbeIdByToolId, state.recordsByProbeId]);

  const isAnyRunning = Object.values(state.recordsByProbeId).some(
    (record) => record.status === "running",
  );

  return {
    ...state,
    records,
    isAnyRunning,
    startVerification,
    startDirectedVerification,
    runAllVerifications,
    selectProbe,
  };
};
