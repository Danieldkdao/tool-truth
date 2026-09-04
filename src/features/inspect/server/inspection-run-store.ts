import "server-only";

import { randomBytes } from "node:crypto";

import type {
  ContractAnalysisData,
  DetectedTool,
  DirectedTestDefinition,
  DirectedTestEvaluation,
  EvidenceScreenshot,
  ExecutionEvidenceData,
} from "@/features/inspect/components/inspection-data";
import type { VerificationStreamEvent } from "@/features/inspect/components/inspection-stream";
import { resolveDirectedLineage } from "@/features/inspect/lib/directed-verification";
import type {
  BrowserbaseSessionLifecycle,
  BrowserbaseSessionLifecycleReporter,
  BrowserbaseSessionTerminationReason,
  InspectionBrowserSession,
} from "@/features/inspect/server/inspection-browser-session";
import type { ValidatedInspectionTarget } from "@/features/inspect/server/validate-inspection-url";

const RUN_TTL_MS = 60 * 60 * 1000;
const MAX_ACTIVE_RUNS = 500;
const MAX_PROBES_PER_RUN = 20;
const MAX_SCREENSHOTS_PER_PROBE = 2;
const MAX_SCREENSHOT_BYTES = 1_000_000;
const MAX_SCREENSHOT_BYTES_PER_RUN = 40_000_000;
const MAX_SCREENSHOT_BYTES_GLOBALLY = 256_000_000;
const PROBE_DISCONNECT_GRACE_MS = 15_000;

export type StoredVerificationEvent = {
  sequence: number;
  event: VerificationStreamEvent;
};

type ProbeSubscriber = (event: StoredVerificationEvent) => void;

export type RetainedInspectionScreenshot = {
  id: string;
  label: string;
  contentType: "image/jpeg";
  body: Uint8Array;
  bytes: number;
  hash: string;
  createdAt: number;
};

export type RetainInspectionScreenshotInput = Pick<
  RetainedInspectionScreenshot,
  "label" | "contentType" | "body" | "hash"
>;

export type InspectionProbe = {
  id: string;
  toolId: string;
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  createdAt: number;
  events: StoredVerificationEvent[];
  nextEventSequence: number;
  subscribers: Set<ProbeSubscriber>;
  directedTest?: DirectedTestDefinition;
  directedEvaluation?: DirectedTestEvaluation;
  verifiedTool?: DetectedTool;
  evidenceData?: ExecutionEvidenceData;
  analysisData?: ContractAnalysisData;
  failureMessage?: string;
  execution?: Promise<void>;
  abortController?: AbortController;
  disconnectExpiration?: NodeJS.Timeout;
  browserSession?: Promise<InspectionBrowserSession>;
  browserbaseLifecycleId?: string;
  screenshots: Map<string, RetainedInspectionScreenshot>;
};

export type InspectionRun = {
  id: string;
  status: "queued";
  targetUrl: string;
  targetHostname: string;
  resolvedAddresses: string[];
  createdAt: number;
  expiresAt: number;
  browserbaseSessions: BrowserbaseSessionLifecycle[];
  discoveryBrowserbaseLifecycleId?: string;
  browserSession?: Promise<InspectionBrowserSession>;
  browserSessionExpiration?: NodeJS.Timeout;
  toolDiscovery?: Promise<DetectedTool[]>;
  probes: Map<string, InspectionProbe>;
};

const globalForInspectionRuns = globalThis as typeof globalThis & {
  toolTruthInspectionRuns?: Map<string, InspectionRun>;
};

const inspectionRuns =
  globalForInspectionRuns.toolTruthInspectionRuns ?? new Map<string, InspectionRun>();

globalForInspectionRuns.toolTruthInspectionRuns = inspectionRuns;

const createBrowserbaseLifecycleReporter = (
  run: InspectionRun,
  probe?: InspectionProbe,
): BrowserbaseSessionLifecycleReporter => {
  return (lifecycle) => {
    if (probe) {
      probe.browserbaseLifecycleId = lifecycle.lifecycleId;
    } else {
      run.discoveryBrowserbaseLifecycleId = lifecycle.lifecycleId;
    }
    run.browserbaseSessions ??= [];
    const index = run.browserbaseSessions.findIndex(
      (session) => session.lifecycleId === lifecycle.lifecycleId,
    );

    if (index === -1) {
      run.browserbaseSessions.push(lifecycle);
      return;
    }

    run.browserbaseSessions[index] = lifecycle;
  };
};

const closeRunBrowserSession = async (
  run: InspectionRun,
  expectedSession?: Promise<InspectionBrowserSession>,
  reason: BrowserbaseSessionTerminationReason = "completed",
) => {
  if (expectedSession && run.browserSession !== expectedSession) return;

  if (run.browserSessionExpiration) {
    clearTimeout(run.browserSessionExpiration);
    run.browserSessionExpiration = undefined;
  }

  const session = run.browserSession;
  run.browserSession = undefined;
  if (session) {
    await session
      .then((browserSession) => browserSession.close(reason))
      .catch(() => undefined);
  }
};

const closeProbeBrowserSession = async (
  probe: InspectionProbe,
  expectedSession?: Promise<InspectionBrowserSession>,
  reason: BrowserbaseSessionTerminationReason = "completed",
) => {
  if (expectedSession && probe.browserSession !== expectedSession) return;

  const session = probe.browserSession;
  probe.browserSession = undefined;
  if (session) {
    await session
      .then((browserSession) => browserSession.close(reason))
      .catch(() => undefined);
  }
};

export const cancelInspectionProbe = (probe: InspectionProbe) => {
  if (probe.disconnectExpiration) {
    clearTimeout(probe.disconnectExpiration);
    probe.disconnectExpiration = undefined;
  }
  probe.abortController?.abort();
};

const deleteInspectionRun = (runId: string, run: InspectionRun) => {
  inspectionRuns.delete(runId);
  for (const probe of run.probes.values()) {
    cancelInspectionProbe(probe);
    void closeProbeBrowserSession(probe, undefined, "run_expired");
  }
  void closeRunBrowserSession(run, undefined, "run_expired");
};

const deleteExpiredRuns = (now = Date.now()) => {
  for (const [runId, run] of inspectionRuns) {
    if (run.expiresAt <= now) {
      deleteInspectionRun(runId, run);
    }
  }
};

const createRunId = () => {
  let runId: string;

  do {
    runId = `run_${randomBytes(24).toString("base64url")}`;
  } while (inspectionRuns.has(runId));

  return runId;
};

export const createInspectionRun = (target: ValidatedInspectionTarget) => {
  const now = Date.now();
  deleteExpiredRuns(now);

  if (inspectionRuns.size >= MAX_ACTIVE_RUNS) {
    throw new Error("The inspection service is currently at capacity.");
  }

  const run: InspectionRun = {
    id: createRunId(),
    status: "queued",
    targetUrl: target.url,
    targetHostname: target.hostname,
    resolvedAddresses: target.resolvedAddresses,
    createdAt: now,
    expiresAt: now + RUN_TTL_MS,
    browserbaseSessions: [],
    probes: new Map(),
  };

  inspectionRuns.set(run.id, run);

  return run;
};

export const getInspectionRun = (runId: string) => {
  const run = inspectionRuns.get(runId);

  if (!run) {
    return undefined;
  }

  if (run.expiresAt <= Date.now()) {
    deleteInspectionRun(runId, run);
    return undefined;
  }

  return run;
};

export const getOrCreateInspectionBrowserSession = (
  run: InspectionRun,
  create: (
    reportLifecycle: BrowserbaseSessionLifecycleReporter,
  ) => Promise<InspectionBrowserSession>,
) => {
  if (!run.browserSession) {
    run.browserSession = create(createBrowserbaseLifecycleReporter(run));
    const expirationDelay = Math.max(0, run.expiresAt - Date.now());
    run.browserSessionExpiration = setTimeout(() => {
      if (inspectionRuns.get(run.id) === run) deleteInspectionRun(run.id, run);
    }, expirationDelay);
    run.browserSessionExpiration.unref?.();
  }

  return run.browserSession;
};

export const disposeInspectionBrowserSession = (
  run: InspectionRun,
  expectedSession?: Promise<InspectionBrowserSession>,
  reason: BrowserbaseSessionTerminationReason = "completed",
) => {
  return closeRunBrowserSession(run, expectedSession, reason);
};

export const getOrCreateInspectionProbeBrowserSession = (
  run: InspectionRun,
  probe: InspectionProbe,
  create: (
    reportLifecycle: BrowserbaseSessionLifecycleReporter,
  ) => Promise<InspectionBrowserSession>,
) => {
  probe.browserSession ??= create(
    createBrowserbaseLifecycleReporter(run, probe),
  );
  return probe.browserSession;
};

export const getInspectionDiscoveryBrowserbaseLifecycle = (
  run: InspectionRun,
) => {
  if (!run.discoveryBrowserbaseLifecycleId) return undefined;

  return run.browserbaseSessions.find(
    (session) =>
      session.lifecycleId === run.discoveryBrowserbaseLifecycleId,
  );
};

export const getInspectionProbeBrowserbaseLifecycle = (
  run: InspectionRun,
  probe: InspectionProbe,
) => {
  if (!probe.browserbaseLifecycleId) return undefined;

  return run.browserbaseSessions.find(
    (session) => session.lifecycleId === probe.browserbaseLifecycleId,
  );
};

const getRetainedScreenshotBytes = (run?: InspectionRun) => {
  const runs = run ? [run] : inspectionRuns.values();
  let bytes = 0;

  for (const candidateRun of runs) {
    for (const probe of candidateRun.probes.values()) {
      probe.screenshots ??= new Map();
      for (const screenshot of probe.screenshots.values()) {
        bytes += screenshot.bytes;
      }
    }
  }

  return bytes;
};

const removeOldestScreenshot = (run?: InspectionRun) => {
  const runs = run ? [run] : inspectionRuns.values();
  let oldest:
    | { probe: InspectionProbe; screenshot: RetainedInspectionScreenshot }
    | undefined;

  for (const candidateRun of runs) {
    for (const probe of candidateRun.probes.values()) {
      probe.screenshots ??= new Map();
      for (const screenshot of probe.screenshots.values()) {
        if (!oldest || screenshot.createdAt < oldest.screenshot.createdAt) {
          oldest = { probe, screenshot };
        }
      }
    }
  }

  if (!oldest) return false;
  oldest.probe.screenshots.delete(oldest.screenshot.id);
  return true;
};

export const retainInspectionProbeScreenshot = (
  run: InspectionRun,
  probe: InspectionProbe,
  input: RetainInspectionScreenshotInput,
): EvidenceScreenshot | undefined => {
  const bytes = input.body.byteLength;
  if (bytes === 0 || bytes > MAX_SCREENSHOT_BYTES) return undefined;

  probe.screenshots ??= new Map();
  while (probe.screenshots.size >= MAX_SCREENSHOTS_PER_PROBE) {
    const oldestScreenshotId = probe.screenshots.keys().next().value as
      | string
      | undefined;
    if (!oldestScreenshotId) break;
    probe.screenshots.delete(oldestScreenshotId);
  }

  while (
    getRetainedScreenshotBytes(run) + bytes > MAX_SCREENSHOT_BYTES_PER_RUN
  ) {
    if (!removeOldestScreenshot(run)) return undefined;
  }

  while (
    getRetainedScreenshotBytes() + bytes > MAX_SCREENSHOT_BYTES_GLOBALLY
  ) {
    if (!removeOldestScreenshot()) return undefined;
  }

  const id = `screenshot_${randomBytes(18).toString("base64url")}`;
  const screenshot: RetainedInspectionScreenshot = {
    id,
    label: input.label,
    contentType: input.contentType,
    body: Uint8Array.from(input.body),
    bytes,
    hash: input.hash,
    createdAt: Date.now(),
  };
  probe.screenshots.set(id, screenshot);

  return {
    label: screenshot.label,
    url: `/api/inspection/${encodeURIComponent(run.id)}/probe/${encodeURIComponent(probe.id)}/screenshot/${encodeURIComponent(id)}`,
    bytes: screenshot.bytes,
    hash: screenshot.hash,
  };
};

export const getInspectionProbeScreenshot = (
  probe: InspectionProbe,
  screenshotId: string,
) => {
  probe.screenshots ??= new Map();
  return probe.screenshots.get(screenshotId);
};

export const disposeInspectionProbeBrowserSession = (
  probe: InspectionProbe,
  expectedSession?: Promise<InspectionBrowserSession>,
  reason: BrowserbaseSessionTerminationReason = "completed",
) => {
  return closeProbeBrowserSession(probe, expectedSession, reason);
};

export const getOrCreateToolDiscovery = (
  run: InspectionRun,
  discover: () => Promise<DetectedTool[]>,
) => {
  run.toolDiscovery ??= discover();
  return run.toolDiscovery;
};

const createProbeId = (run: InspectionRun) => {
  let probeId: string;
  do {
    probeId = `probe_${randomBytes(18).toString("base64url")}`;
  } while (run.probes.has(probeId));
  return probeId;
};

export const createInspectionProbe = (
  run: InspectionRun,
  toolId: string,
  probeId = createProbeId(run),
) => {
  run.probes ??= new Map();

  if (run.probes.size >= MAX_PROBES_PER_RUN) {
    const oldestProbeId = run.probes.keys().next().value as string | undefined;
    if (oldestProbeId) {
      const oldestProbe = run.probes.get(oldestProbeId);
      if (oldestProbe) {
        cancelInspectionProbe(oldestProbe);
        void closeProbeBrowserSession(oldestProbe, undefined, "replaced");
      }
      run.probes.delete(oldestProbeId);
    }
  }

  const probe: InspectionProbe = {
    id: probeId,
    toolId,
    status: "queued",
    createdAt: Date.now(),
    events: [],
    nextEventSequence: 1,
    subscribers: new Set(),
    screenshots: new Map(),
  };

  run.probes.set(probe.id, probe);
  return probe;
};

export class DirectedProbeLineageError extends Error {
  readonly status = 409;
}

export type DirectedProbeDraft = Omit<
  DirectedTestDefinition,
  "parentProbeId" | "rootProbeId" | "round"
> & {
  basedOnProbeId?: string;
};

export const createDirectedInspectionProbe = (
  run: InspectionRun,
  toolId: string,
  draft: DirectedProbeDraft,
) => {
  const probeId = createProbeId(run);
  const lineage = resolveDirectedLineage(
    [...run.probes.values()],
    toolId,
    probeId,
    draft.basedOnProbeId,
  );
  if (!lineage.ok) {
    throw new DirectedProbeLineageError(lineage.message);
  }
  const probe = createInspectionProbe(run, toolId, probeId);
  probe.directedTest = {
    request: draft.request,
    input: draft.input,
    inputHash: draft.inputHash,
    assertions: draft.assertions,
    parentProbeId: lineage.parentProbeId,
    rootProbeId: lineage.rootProbeId,
    round: lineage.round,
  };
  return probe;
};

export const getInspectionProbe = (run: InspectionRun, probeId: string) => {
  run.probes ??= new Map();
  return run.probes.get(probeId);
};

export const publishInspectionProbeEvent = (
  probe: InspectionProbe,
  event: VerificationStreamEvent,
) => {
  const storedEvent = {
    sequence: probe.nextEventSequence,
    event,
  } satisfies StoredVerificationEvent;
  probe.nextEventSequence += 1;
  probe.events.push(storedEvent);

  if (event.kind === "tool.ready") probe.verifiedTool = event.data;
  if (event.kind === "evidence.ready") probe.evidenceData = event.data;
  if (event.kind === "analysis.ready") probe.analysisData = event.data;
  if (event.kind === "directed.ready") probe.directedEvaluation = event.data;
  if (event.kind === "probe.completed") probe.status = "completed";
  if (event.kind === "probe.failed") {
    probe.status = "failed";
    probe.failureMessage = event.message;
  }
  if (event.kind === "probe.canceled") {
    probe.status = "canceled";
    probe.failureMessage = event.message;
  }

  for (const subscriber of probe.subscribers) subscriber(storedEvent);
  return storedEvent;
};

export const subscribeToInspectionProbe = (
  probe: InspectionProbe,
  subscriber: ProbeSubscriber,
) => {
  if (probe.disconnectExpiration) {
    clearTimeout(probe.disconnectExpiration);
    probe.disconnectExpiration = undefined;
  }
  probe.subscribers.add(subscriber);
  return () => {
    probe.subscribers.delete(subscriber);
    if (
      probe.subscribers.size === 0 &&
      probe.status === "running" &&
      !probe.disconnectExpiration
    ) {
      probe.disconnectExpiration = setTimeout(() => {
        probe.disconnectExpiration = undefined;
        if (probe.subscribers.size === 0 && probe.status === "running") {
          cancelInspectionProbe(probe);
        }
      }, PROBE_DISCONNECT_GRACE_MS);
      probe.disconnectExpiration.unref?.();
    }
  };
};

export const getOrStartInspectionProbe = (
  probe: InspectionProbe,
  execute: (signal: AbortSignal) => Promise<void>,
) => {
  if (!probe.execution) {
    probe.status = "running";
    const abortController = new AbortController();
    probe.abortController = abortController;
    probe.execution = execute(abortController.signal).finally(() => {
      if (probe.abortController === abortController) {
        probe.abortController = undefined;
      }
    });
  }

  return probe.execution;
};
