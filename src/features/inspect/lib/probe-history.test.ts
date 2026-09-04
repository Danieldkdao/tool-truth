import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeHydratedProbeRecords,
  selectHydratableProbes,
} from "./probe-history.ts";

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

test("hydration preserves a probe started after history loading began", () => {
  const runningProbe = {
    probeId: "new-probe",
    toolId: "preview_order",
    attempt: 2,
  };
  const result = mergeHydratedProbeRecords(
    {
      recordsByProbeId: { [runningProbe.probeId]: runningProbe },
      probeOrderByToolId: { preview_order: [runningProbe.probeId] },
      activeProbeIdByToolId: { preview_order: runningProbe.probeId },
    },
    [
      {
        probeId: "old-probe",
        toolId: "preview_order",
        attempt: 0,
      },
      {
        probeId: "new-probe",
        toolId: "preview_order",
        attempt: 0,
      },
    ],
  );

  assert.equal(result.activeProbeIdByToolId.preview_order, "new-probe");
  assert.equal(result.recordsByProbeId["new-probe"]?.attempt, 2);
  assert.deepEqual(result.probeOrderByToolId.preview_order, [
    "new-probe",
    "old-probe",
  ]);
});

test("hydration selects the latest history record when no probe is active", () => {
  const result = mergeHydratedProbeRecords(
    {
      recordsByProbeId: {},
      probeOrderByToolId: {},
      activeProbeIdByToolId: {},
    },
    [
      { probeId: "probe-1", toolId: "preview_order" },
      { probeId: "probe-2", toolId: "preview_order" },
    ],
  );

  assert.equal(result.activeProbeIdByToolId.preview_order, "probe-2");
});
