import assert from "node:assert/strict";
import test from "node:test";

import { selectHydratableProbes } from "./probe-history.ts";

test("restores completed web-app and directed verification records", () => {
  const probes = [
    {
      id: "automatic-probe",
      toolId: "preview_order",
      status: "completed" as const,
      createdAt: 1,
      analysisData: { verdict: "failed" },
    },
    {
      id: "directed-probe",
      toolId: "preview_order",
      status: "completed" as const,
      createdAt: 2,
      directedTest: {
        round: 1,
        parentProbeId: null,
        request: "Stay read-only",
        inputHash: "hash",
      },
      directedEvaluation: { verdict: "failed" },
      analysisData: { verdict: "failed" },
    },
  ];

  assert.deepEqual(
    selectHydratableProbes(probes).map((probe) => probe.id),
    ["automatic-probe", "directed-probe"],
  );
});
