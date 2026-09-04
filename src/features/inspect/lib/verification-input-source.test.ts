import assert from "node:assert/strict";
import test from "node:test";

import {
  directedInputRequestsIdempotency,
  resolveVerificationToolInput,
} from "./verification-input-source.ts";

const directedTest = {
  request: "Use the exact input",
  input: { query: "unchanged", nested: { count: 2 } },
  inputHash: "hash",
  assertions: [{ kind: "same_input_is_idempotent" as const }],
  parentProbeId: null,
  rootProbeId: "probe-1",
  round: 1,
};

test("returns the exact directed input without calling generated-input logic", async () => {
  let generationCalls = 0;
  const result = await resolveVerificationToolInput(
    { kind: "directed", test: directedTest },
    async () => {
      generationCalls += 1;
      return { replaced: true };
    },
  );

  assert.equal(result, directedTest.input);
  assert.equal(generationCalls, 0);
});

test("generated mode calls the existing input generator", async () => {
  let generationCalls = 0;
  const result = await resolveVerificationToolInput(
    { kind: "generated" },
    async () => {
      generationCalls += 1;
      return { generated: true };
    },
  );

  assert.deepEqual(result, { generated: true });
  assert.equal(generationCalls, 1);
});

test("detects an explicit directed idempotency assertion", () => {
  assert.equal(
    directedInputRequestsIdempotency({ kind: "directed", test: directedTest }),
    true,
  );
});
