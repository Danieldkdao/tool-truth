import type {
  DetectedTool,
  EvidenceTab,
} from "@/features/inspect/components/inspection-data";
import type { InspectionSessionSnapshot } from "@/features/inspect/hooks/use-inspection-session-controller";
import type {
  EvidenceView,
  GetInspectionSessionController,
} from "@/features/inspect/webmcp/types";

const EVIDENCE_TABS_BY_VIEW: Record<EvidenceView, EvidenceTab> = {
  timeline: "Timeline",
  state_diff: "State diff",
  network: "Network",
  logs: "Logs",
  statistics: "Statistics",
  replay: "Replay",
};

const EVIDENCE_VIEWS_BY_TAB: Record<EvidenceTab, EvidenceView> = {
  Timeline: "timeline",
  "State diff": "state_diff",
  Network: "network",
  Logs: "logs",
  Statistics: "statistics",
  Replay: "replay",
};

const TERMINAL_VERIFICATION_STATUSES = new Set([
  "passed",
  "failed",
  "inconclusive",
  "canceled",
  "error",
]);

const createAbortError = () =>
  new DOMException("The WebMCP tool call was cancelled.", "AbortError");

export const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw createAbortError();
  }
};

export const awaitWithSignal = <Result>(
  operation: Promise<Result>,
  signal?: AbortSignal,
) => {
  if (!signal) {
    return operation;
  }

  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise<Result>((resolve, reject) => {
    const handleAbort = () => reject(createAbortError());

    signal.addEventListener("abort", handleAbort, { once: true });
    operation.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", handleAbort);
    });
  });
};

const waitForNextSnapshot = (signal?: AbortSignal) => {
  return new Promise<void>((resolve, reject) => {
    if (!signal) {
      window.setTimeout(resolve, 20);
      return;
    }

    if (signal.aborted) {
      reject(createAbortError());
      return;
    }

    const handleAbort = () => {
      window.clearTimeout(timeoutId);
      reject(createAbortError());
    };
    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, 20);

    signal.addEventListener("abort", handleAbort, { once: true });
  });
};

export const waitForControllerSnapshot = async (
  getController: GetInspectionSessionController,
  predicate: (snapshot: InspectionSessionSnapshot) => boolean,
  signal?: AbortSignal,
) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    throwIfAborted(signal);
    const snapshot = getController().snapshot;

    if (predicate(snapshot)) {
      return snapshot;
    }

    await waitForNextSnapshot(signal);
  }

  throw new Error(
    "The workbench did not publish the updated inspection state in time.",
  );
};

export const readRequiredToolId = (input: Record<string, unknown>) => {
  const toolId = input.toolId;

  if (typeof toolId !== "string" || toolId.trim().length === 0) {
    throw new Error("toolId must be a non-empty string.");
  }

  if (toolId.length > 500) {
    throw new Error("toolId must be 500 characters or fewer.");
  }

  return toolId;
};

export const readEvidenceTab = (input: Record<string, unknown>) => {
  const evidenceView = input.evidenceView;

  if (evidenceView === undefined) {
    return undefined;
  }

  if (
    typeof evidenceView !== "string" ||
    !(evidenceView in EVIDENCE_TABS_BY_VIEW)
  ) {
    throw new Error(
      "evidenceView must be timeline, state_diff, network, logs, statistics, or replay.",
    );
  }

  return EVIDENCE_TABS_BY_VIEW[evidenceView as EvidenceView];
};

export const toEvidenceView = (tab: EvidenceTab) =>
  EVIDENCE_VIEWS_BY_TAB[tab];

export const findToolOrThrow = (
  tools: DetectedTool[] | null,
  toolId: string,
) => {
  const tool = tools?.find((candidate) => candidate.id === toolId);

  if (!tool) {
    throw new Error(`No discovered tool has the id "${toolId}".`);
  }

  return tool;
};

export const isVerificationTerminal = (
  snapshot: InspectionSessionSnapshot,
  toolId: string,
  previousAttempt = -1,
) => {
  const record = snapshot.verificationRecords[toolId];
  return Boolean(
    record &&
      record.attempt > previousAttempt &&
      TERMINAL_VERIFICATION_STATUSES.has(record.status),
  );
};
