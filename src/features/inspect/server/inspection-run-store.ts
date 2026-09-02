import "server-only";

import { randomBytes } from "node:crypto";

import type { DetectedTool } from "@/features/inspect/components/inspection-data";
import type { ValidatedInspectionTarget } from "@/features/inspect/server/validate-inspection-url";

const RUN_TTL_MS = 60 * 60 * 1000;
const MAX_ACTIVE_RUNS = 500;

export type InspectionRun = {
  id: string;
  status: "queued";
  targetUrl: string;
  targetHostname: string;
  resolvedAddresses: string[];
  createdAt: number;
  expiresAt: number;
  toolDiscovery?: Promise<DetectedTool[]>;
};

const globalForInspectionRuns = globalThis as typeof globalThis & {
  toolTruthInspectionRuns?: Map<string, InspectionRun>;
};

const inspectionRuns =
  globalForInspectionRuns.toolTruthInspectionRuns ?? new Map<string, InspectionRun>();

globalForInspectionRuns.toolTruthInspectionRuns = inspectionRuns;

const deleteExpiredRuns = (now = Date.now()) => {
  for (const [runId, run] of inspectionRuns) {
    if (run.expiresAt <= now) {
      inspectionRuns.delete(runId);
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
    inspectionRuns.delete(runId);
    return undefined;
  }

  return run;
};

export const getOrCreateToolDiscovery = (
  run: InspectionRun,
  discover: () => Promise<DetectedTool[]>,
) => {
  run.toolDiscovery ??= discover();
  return run.toolDiscovery;
};
