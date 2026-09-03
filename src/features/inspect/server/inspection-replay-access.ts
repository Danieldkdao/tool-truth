import "server-only";

import {
  getInspectionProbe,
  getInspectionProbeBrowserbaseLifecycle,
  getInspectionRun,
} from "@/features/inspect/server/inspection-run-store";

export class InspectionReplayAccessError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "InspectionReplayAccessError";
    this.status = status;
  }
}

export const getFinishedInspectionReplaySession = (
  runId: string,
  probeId: string,
) => {
  const run = getInspectionRun(runId);
  const probe = run ? getInspectionProbe(run, probeId) : undefined;

  if (!run || !probe) {
    throw new InspectionReplayAccessError(
      "This verification probe was not found or has expired.",
      404,
    );
  }

  if (probe.status === "queued" || probe.status === "running") {
    throw new InspectionReplayAccessError(
      "Session replay is available after the verification finishes.",
      409,
    );
  }

  const lifecycle = getInspectionProbeBrowserbaseLifecycle(run, probe);
  if (!lifecycle?.sessionId) {
    throw new InspectionReplayAccessError(
      "This verification did not run in a recorded Browserbase session.",
      404,
    );
  }

  if (
    lifecycle.status === "creating" ||
    lifecycle.status === "running" ||
    lifecycle.status === "closing" ||
    lifecycle.endedAt === null
  ) {
    throw new InspectionReplayAccessError(
      "Session replay is available after Browserbase closes the session.",
      409,
    );
  }

  return lifecycle.sessionId;
};
