import assert from "node:assert/strict";
import test from "node:test";

import { normalizeGeneratedToolInput } from "./generated-tool-input.ts";

test("keeps generated strings that match a safe schema pattern", () => {
  const input = normalizeGeneratedToolInput(
    { productId: "product-123" },
    {
      type: "object",
      properties: { productId: { type: "string", pattern: "^product-[0-9]+$" } },
    },
    { productId: "product-1" },
  );

  assert.deepEqual(input, { productId: "product-123" });
});

test("does not execute schema patterns that may backtrack catastrophically", () => {
  const input = normalizeGeneratedToolInput(
    { query: `${"a".repeat(400)}!` },
    {
      type: "object",
      properties: { query: { type: "string", pattern: "^(a+)+$" } },
    },
    { query: "safe fallback" },
  );

  assert.deepEqual(input, { query: "safe fallback" });
});
