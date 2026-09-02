import "server-only";

import { randomBytes } from "node:crypto";

import type { DetectedTool } from "@/features/inspect/components/inspection-data";
import type { VerificationStreamEvent } from "@/features/inspect/components/inspection-stream";
import type { InspectionBrowserSession } from "@/features/inspect/server/inspection-browser-session";
import type { ValidatedInspectionTarget } from "@/features/inspect/server/validate-inspection-url";

const RUN_TTL_MS = 60 * 60 * 1000;
const MAX_ACTIVE_RUNS = 500;
const MAX_PROBES_PER_RUN = 20;

type ProbeSubscriber = (event: VerificationStreamEvent) => void;

export type InspectionProbe = {
  id: string;
  toolId: string;
  status: "queued" | "running" | "completed" | "failed";
  createdAt: number;
  events: VerificationStreamEvent[];
  subscribers: Set<ProbeSubscriber>;
  execution?: Promise<void>;
};

export type InspectionRun = {
  id: string;
  status: "queued";
  targetUrl: string;
  targetHostname: string;
  resolvedAddresses: string[];
  createdAt: number;
  expiresAt: number;
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

const closeRunBrowserSession = (run: InspectionRun) => {
  if (run.browserSessionExpiration) {
    clearTimeout(run.browserSessionExpiration);
    run.browserSessionExpiration = undefined;
  }

  const session = run.browserSession;
  run.browserSession = undefined;
  if (session) {
    void session
      .then((browserSession) => browserSession.close())
      .catch(() => undefined);
  }
};

const deleteInspectionRun = (runId: string, run: InspectionRun) => {
  inspectionRuns.delete(runId);
  closeRunBrowserSession(run);
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
  create: () => Promise<InspectionBrowserSession>,
) => {
  if (!run.browserSession) {
    run.browserSession = create();
    const expirationDelay = Math.max(0, run.expiresAt - Date.now());
    run.browserSessionExpiration = setTimeout(() => {
      if (inspectionRuns.get(run.id) === run) deleteInspectionRun(run.id, run);
    }, expirationDelay);
    run.browserSessionExpiration.unref?.();
  }

  return run.browserSession;
};

export const getInspectionBrowserSession = (run: InspectionRun) => {
  return run.browserSession;
};

export const disposeInspectionBrowserSession = (run: InspectionRun) => {
  closeRunBrowserSession(run);
};

export const getOrCreateToolDiscovery = (
  run: InspectionRun,
  discover: () => Promise<DetectedTool[]>,
) => {
  run.toolDiscovery ??= discover();
  return run.toolDiscovery;
};

export const createInspectionProbe = (run: InspectionRun, toolId: string) => {
  run.probes ??= new Map();

  if (run.probes.size >= MAX_PROBES_PER_RUN) {
    const oldestProbeId = run.probes.keys().next().value as string | undefined;
    if (oldestProbeId) run.probes.delete(oldestProbeId);
  }

  const probe: InspectionProbe = {
    id: `probe_${randomBytes(18).toString("base64url")}`,
    toolId,
    status: "queued",
    createdAt: Date.now(),
    events: [],
    subscribers: new Set(),
  };

  run.probes.set(probe.id, probe);
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
  probe.events.push(event);

  if (event.kind === "probe.completed") probe.status = "completed";
  if (event.kind === "probe.failed") probe.status = "failed";

  for (const subscriber of probe.subscribers) subscriber(event);
};

export const subscribeToInspectionProbe = (
  probe: InspectionProbe,
  subscriber: ProbeSubscriber,
) => {
  probe.subscribers.add(subscriber);
  return () => {
    probe.subscribers.delete(subscriber);
  };
};

export const getOrStartInspectionProbe = (
  probe: InspectionProbe,
  execute: () => Promise<void>,
) => {
  if (!probe.execution) {
    probe.status = "running";
    probe.execution = execute();
  }

  return probe.execution;
};
