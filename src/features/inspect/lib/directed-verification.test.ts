import assert from "node:assert/strict";
import test from "node:test";

import type { DirectedAssertion } from "../components/inspection-data.ts";
import {
  type DirectedEvaluationInput,
  evaluateDirectedTest,
  isSafeDirectedOutputPath,
  resolveDirectedLineage,
} from "./directed-verification.ts";

const baseInput = {
  assertions: [] as DirectedAssertion[],
  invocationStatus: "Completed" as const,
  toolOutput: { result: { total: 42 } },
  beforeUrl: "https://example.com/products",
  afterUrl: "https://example.com/products",
  stateChanges: [],
  mutatingRequests: [],
  evidenceComplete: true,
};

test("passes when every directed assertion is satisfied", () => {
  const result = evaluateDirectedTest({
    ...baseInput,
    assertions: [
      { kind: "invocation_status", expected: "completed" },
      { kind: "no_mutating_requests" },
      { kind: "no_observable_state_changes" },
      { kind: "no_persistent_state_changes" },
      { kind: "no_navigation" },
      { kind: "output_field_exists", path: ["result", "total"] },
      {
        kind: "output_field_equals",
        path: ["result", "total"],
        expected: 42,
      },
    ],
  });

  assert.equal(result.verdict, "passed");
  assert.ok(result.checks.every((check) => check.status === "satisfied"));
});

test("a violation takes precedence over incomplete evidence", () => {
  const result = evaluateDirectedTest({
    ...baseInput,
    assertions: [
      { kind: "no_mutating_requests" },
      { kind: "no_observable_state_changes" },
    ],
    mutatingRequests: ["POST /orders · 201"],
    evidenceComplete: false,
  });

  assert.equal(result.verdict, "failed");
  assert.deepEqual(
    result.checks.map((check) => check.status),
    ["violated", "inconclusive"],
  );
});

test("returns inconclusive when absence cannot be established", () => {
  const result = evaluateDirectedTest({
    ...baseInput,
    assertions: [{ kind: "no_mutating_requests" }],
    evidenceComplete: false,
  });

  assert.equal(result.verdict, "inconclusive");
});

test("evaluates navigation and persistent state separately", () => {
  const result = evaluateDirectedTest({
    ...baseInput,
    assertions: [
      { kind: "no_navigation" },
      { kind: "no_persistent_state_changes" },
    ],
    afterUrl: "https://example.com/checkout",
    stateChanges: [["localStorage.cart", "0", "1"]],
  });

  assert.equal(result.verdict, "failed");
  assert.ok(result.checks.every((check) => check.status === "violated"));
});

test("checks repeated invocation status, output, state, and mutations", () => {
  const passed = evaluateDirectedTest({
    ...baseInput,
    assertions: [{ kind: "same_input_is_idempotent" }],
    repeatedInvocation: {
      firstStatus: "Completed",
      secondStatus: "Completed",
      firstOutput: { id: "same" },
      secondOutput: { id: "same" },
      secondStateChanges: [],
      secondMutatingRequests: [],
    },
  });
  const failed = evaluateDirectedTest({
    ...baseInput,
    assertions: [{ kind: "same_input_is_idempotent" }],
    repeatedInvocation: {
      firstStatus: "Completed",
      secondStatus: "Completed",
      firstOutput: { id: "first" },
      secondOutput: { id: "second" },
      secondStateChanges: [],
      secondMutatingRequests: [],
    },
  });

  assert.equal(passed.verdict, "passed");
  assert.equal(failed.verdict, "failed");
});

test("allows an idempotent repeated request to perform the same write", () => {
  const result = evaluateDirectedTest({
    ...baseInput,
    assertions: [{ kind: "same_input_is_idempotent" }],
    repeatedInvocation: {
      firstStatus: "Completed",
      secondStatus: "Completed",
      firstOutput: { id: "order-1", status: "confirmed" },
      secondOutput: { status: "confirmed", id: "order-1" },
      secondStateChanges: [],
      secondMutatingRequests: ["PUT /orders/order-1 · 200"],
    },
  });

  assert.equal(result.verdict, "passed");
});

test("does not treat inherited members as returned output fields", () => {
  const result = evaluateDirectedTest({
    ...baseInput,
    assertions: [{ kind: "output_field_exists", path: ["toString"] }],
    toolOutput: {},
  });

  assert.equal(result.verdict, "failed");
});

test("rejects prototype-related output paths", () => {
  assert.equal(isSafeDirectedOutputPath(["result", "total"]), true);
  assert.equal(isSafeDirectedOutputPath(["__proto__", "polluted"]), false);
  assert.equal(isSafeDirectedOutputPath(["constructor"]), false);
  assert.equal(isSafeDirectedOutputPath([]), false);
});

test("creates a linear round chain and rejects stale or cross-tool parents", () => {
  const first = resolveDirectedLineage([], "preview", "probe-1");
  assert.deepEqual(first, {
    ok: true,
    parentProbeId: null,
    rootProbeId: "probe-1",
    round: 1,
  });

  const probes = [
    {
      id: "probe-1",
      toolId: "preview",
      status: "completed" as const,
      directedTest: { rootProbeId: "probe-1", round: 1 },
    },
    {
      id: "probe-2",
      toolId: "preview",
      status: "completed" as const,
      directedTest: { rootProbeId: "probe-1", round: 2 },
    },
    {
      id: "other-probe",
      toolId: "search",
      status: "completed" as const,
      directedTest: { rootProbeId: "other-probe", round: 1 },
    },
  ];
  assert.deepEqual(resolveDirectedLineage(probes, "preview", "probe-3"), {
    ok: true,
    parentProbeId: "probe-2",
    rootProbeId: "probe-1",
    round: 3,
  });
  assert.equal(
    resolveDirectedLineage(probes, "preview", "probe-3", "probe-1").ok,
    false,
  );
  assert.equal(
    resolveDirectedLineage(probes, "preview", "probe-3", "other-probe").ok,
    false,
  );
});

test("retries from the latest completed round after a failed or canceled round", () => {
  const probes = [
    {
      id: "probe-1",
      toolId: "preview",
      status: "completed" as const,
      directedTest: { rootProbeId: "probe-1", round: 1 },
    },
    {
      id: "probe-2",
      toolId: "preview",
      status: "failed" as const,
      directedTest: { rootProbeId: "probe-1", round: 2 },
    },
    {
      id: "probe-3",
      toolId: "preview",
      status: "canceled" as const,
      directedTest: { rootProbeId: "probe-1", round: 2 },
    },
  ];

  assert.deepEqual(
    resolveDirectedLineage(probes, "preview", "probe-4", "probe-1"),
    {
      ok: true,
      parentProbeId: "probe-1",
      rootProbeId: "probe-1",
      round: 2,
    },
  );
  assert.deepEqual(resolveDirectedLineage(probes, "preview", "probe-4"), {
    ok: true,
    parentProbeId: "probe-1",
    rootProbeId: "probe-1",
    round: 2,
  });
});

test("still blocks a new directed round while one is active", () => {
  const result = resolveDirectedLineage(
    [
      {
        id: "probe-1",
        toolId: "preview",
        status: "running",
        directedTest: { rootProbeId: "probe-1", round: 1 },
      },
    ],
    "preview",
    "probe-2",
  );

  assert.equal(result.ok, false);
});

test("each assertion kind produces its deterministic terminal states", () => {
  const statusOf = (input: Parameters<typeof evaluateDirectedTest>[0]) =>
    evaluateDirectedTest(input).checks[0]?.status;

  assert.deepEqual(
    [
      statusOf({
        ...baseInput,
        assertions: [{ kind: "invocation_status", expected: "completed" }],
      }),
      statusOf({
        ...baseInput,
        assertions: [{ kind: "invocation_status", expected: "error" }],
      }),
      statusOf({
        ...baseInput,
        assertions: [{ kind: "invocation_status", expected: "completed" }],
        invocationStatus: "Canceled",
      }),
    ],
    ["satisfied", "violated", "inconclusive"],
  );

  for (const kind of [
    "no_mutating_requests",
    "no_observable_state_changes",
    "no_persistent_state_changes",
    "no_navigation",
  ] as const) {
    const violated = {
      ...baseInput,
      assertions: [{ kind }],
      mutatingRequests:
        kind === "no_mutating_requests" ? ["POST /orders · 201"] : [],
      stateChanges:
        kind === "no_observable_state_changes"
          ? ([["dom.dialogs", "0", "1"]] as DirectedEvaluationInput["stateChanges"])
          : kind === "no_persistent_state_changes"
            ? ([["cookies.cart", "0", "1"]] as DirectedEvaluationInput["stateChanges"])
            : [],
      afterUrl:
        kind === "no_navigation"
          ? "https://example.com/checkout"
          : baseInput.afterUrl,
    };
    assert.equal(statusOf({ ...baseInput, assertions: [{ kind }] }), "satisfied");
    assert.equal(statusOf(violated), "violated");
    assert.equal(
      statusOf({
        ...baseInput,
        assertions: [{ kind }],
        evidenceComplete: false,
      }),
      "inconclusive",
    );
  }

  assert.deepEqual(
    [
      statusOf({
        ...baseInput,
        assertions: [{ kind: "same_input_is_idempotent" }],
        repeatedInvocation: {
          firstStatus: "Completed",
          secondStatus: "Completed",
          firstOutput: { ok: true },
          secondOutput: { ok: true },
          secondStateChanges: [],
          secondMutatingRequests: [],
        },
      }),
      statusOf({
        ...baseInput,
        assertions: [{ kind: "same_input_is_idempotent" }],
        repeatedInvocation: {
          firstStatus: "Completed",
          secondStatus: "Error",
          firstOutput: { ok: true },
          secondOutput: undefined,
          secondStateChanges: [],
          secondMutatingRequests: [],
        },
      }),
      statusOf({
        ...baseInput,
        assertions: [{ kind: "same_input_is_idempotent" }],
      }),
    ],
    ["satisfied", "violated", "inconclusive"],
  );

  for (const assertion of [
    { kind: "output_field_exists" as const, path: ["result", "total"] },
    {
      kind: "output_field_equals" as const,
      path: ["result", "total"],
      expected: 42,
    },
  ]) {
    assert.equal(statusOf({ ...baseInput, assertions: [assertion] }), "satisfied");
    assert.equal(
      statusOf({
        ...baseInput,
        assertions: [assertion],
        toolOutput: { result: {} },
      }),
      "violated",
    );
    assert.equal(
      statusOf({
        ...baseInput,
        assertions: [assertion],
        invocationStatus: "Error",
      }),
      "inconclusive",
    );
  }
});
