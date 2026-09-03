"use client";

import { useEffect, useReducer } from "react";

import type {
  BrowserPreviewData,
  ContractAnalysisData,
  DetectedTool,
  ExecutionEvidenceData,
} from "@/features/inspect/components/inspection-data";
import type {
  BrowserSessionView,
  InspectionSection,
  InspectionStreamEvent,
  SectionProgress,
} from "@/features/inspect/components/inspection-stream";

type InspectionRunStreamState = {
  tools: DetectedTool[] | null;
  browserData: BrowserPreviewData | null;
  browserSession: BrowserSessionView | null;
  evidenceData: ExecutionEvidenceData | null;
  analysisData: ContractAnalysisData | null;
  toolDiscoveryError: string | null;
  runError: {
    code: "not_found" | "connection_failed";
    message: string;
  } | null;
  progress: Record<InspectionSection, SectionProgress>;
};

type InspectionRunStreamAction =
  | {
      type: "event";
      event: InspectionStreamEvent;
    }
  | {
      type: "disconnected";
    }
  | {
      type: "failed";
      code: "not_found" | "connection_failed";
      message: string;
    };

const createInitialState = (): InspectionRunStreamState => {
  return {
    tools: null,
    browserData: null,
    browserSession: null,
    evidenceData: null,
    analysisData: null,
    toolDiscoveryError: null,
    runError: null,
    progress: {
      tools: {
        value: 5,
        message: "Waiting for the discovery process to begin",
      },
      browser: {
        value: 5,
        message: "Allocating a clean browser session",
      },
      evidence: {
        value: 5,
        message: "Waiting for the baseline snapshot",
      },
      analysis: {
        value: 5,
        message: "Waiting for observed behavior",
      },
    },
  };
};

const reduceInspectionRunStream = (
  state: InspectionRunStreamState,
  action: InspectionRunStreamAction,
): InspectionRunStreamState => {
  if (action.type === "disconnected") {
    return {
      ...state,
      progress: Object.fromEntries(
        Object.entries(state.progress).map(([section, progress]) => [
          section,
          {
            ...progress,
            message: "The inspection stream disconnected and is reconnecting",
          },
        ]),
      ) as Record<InspectionSection, SectionProgress>,
    };
  }

  if (action.type === "failed") {
    return {
      ...state,
      runError: {
        code: action.code,
        message: action.message,
      },
    };
  }

  const { event } = action;

  switch (event.kind) {
    case "section.progress":
      return {
        ...state,
        progress: {
          ...state.progress,
          [event.section]: event.progress,
        },
      };
    case "tool.discovered": {
      const currentTools = state.tools ?? [];

      if (currentTools.some((tool) => tool.id === event.data.id)) {
        return state;
      }

      return {
        ...state,
        tools: [...currentTools, event.data],
      };
    }
    case "tools.ready":
      return {
        ...state,
        tools: event.data,
        toolDiscoveryError: null,
      };
    case "tools.failed":
      return {
        ...state,
        toolDiscoveryError: event.message,
      };
    case "browser.ready":
      return {
        ...state,
        browserData: event.data,
      };
    case "browser.session.updated":
      return {
        ...state,
        browserSession: event.data,
      };
    case "evidence.ready":
      return {
        ...state,
        evidenceData: event.data,
      };
    case "analysis.ready":
      return {
        ...state,
        analysisData: event.data,
      };
    case "run.connected":
    case "run.completed":
      return state;
  }
};

export const useInspectionRunStream = (runId: string) => {
  const [state, dispatch] = useReducer(
    reduceInspectionRunStream,
    undefined,
    createInitialState,
  );

  useEffect(() => {
    const controller = new AbortController();
    let source: EventSource | null = null;

    const connect = async () => {
      try {
        const response = await fetch(
          `/api/inspection/${encodeURIComponent(runId)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          let message = "This inspection run could not be opened.";

          try {
            const body = (await response.json()) as { error?: unknown };
            if (typeof body.error === "string") {
              message = body.error;
            }
          } catch {
            // Keep the safe fallback message when the response is not JSON.
          }

          dispatch({
            type: "failed",
            code: response.status === 404 ? "not_found" : "connection_failed",
            message,
          });
          return;
        }

        if (controller.signal.aborted) {
          return;
        }

        source = new EventSource(
          `/api/inspection/${encodeURIComponent(runId)}/events`,
        );

        const handleInspectionEvent = (message: MessageEvent<string>) => {
          let event: InspectionStreamEvent;

          try {
            event = JSON.parse(message.data) as InspectionStreamEvent;
          } catch {
            return;
          }

          dispatch({ type: "event", event });

          if (event.kind === "run.completed") {
            source?.close();
          }
        };

        source.addEventListener("inspection", handleInspectionEvent);
        source.onerror = () => dispatch({ type: "disconnected" });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        dispatch({
          type: "failed",
          code: "connection_failed",
          message:
            error instanceof Error
              ? error.message
              : "This inspection run could not be opened.",
        });
      }
    };

    void connect();

    return () => {
      controller.abort();
      source?.close();
    };
  }, [runId]);

  return state;
};
