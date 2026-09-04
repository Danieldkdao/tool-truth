import assert from "node:assert/strict";
import test from "node:test";

import {
  createDirectedInputHash,
  directedVerificationRequestSchema,
} from "./directed-verification-schema.ts";

const validRequest = {
  toolId: "preview_order",
  request: "Verify this preview stays read-only.",
  input: {},
  assertions: [{ kind: "no_mutating_requests" }],
};

test("accepts the bounded directed verification contract", () => {
  const parsed = directedVerificationRequestSchema.safeParse(validRequest);
  assert.equal(parsed.success, true);
});

test("rejects oversized request prose and excessive assertions", () => {
  assert.equal(
    directedVerificationRequestSchema.safeParse({
      ...validRequest,
      request: "x".repeat(2_001),
    }).success,
    false,
  );
  assert.equal(
    directedVerificationRequestSchema.safeParse({
      ...validRequest,
      assertions: Array.from({ length: 9 }, () => ({
        kind: "no_mutating_requests",
      })),
    }).success,
    false,
  );
});

test("rejects unsafe output paths and arbitrary assertion kinds", () => {
  assert.equal(
    directedVerificationRequestSchema.safeParse({
      ...validRequest,
      assertions: [
        { kind: "output_field_exists", path: ["__proto__", "polluted"] },
      ],
    }).success,
    false,
  );
  assert.equal(
    directedVerificationRequestSchema.safeParse({
      ...validRequest,
      assertions: [{ kind: "javascript", source: "alert(1)" }],
    }).success,
    false,
  );
  assert.equal(
    directedVerificationRequestSchema.safeParse({
      ...validRequest,
      assertions: [
        { kind: "no_mutating_requests", javascript: "alert(1)" },
      ],
    }).success,
    false,
  );
});

test("hashes equivalent object inputs deterministically", () => {
  assert.equal(
    createDirectedInputHash({ a: 1, b: { c: true } }),
    createDirectedInputHash({ b: { c: true }, a: 1 }),
  );
});
