import assert from "node:assert/strict";
import test from "node:test";

import type { DetectedTool } from "../components/inspection-data.ts";
import { validateDirectedToolInput } from "./tool-schema-validation.ts";

const tool = (inputSchema?: DetectedTool["inputSchema"]): DetectedTool => ({
  id: "search",
  name: "search",
  description: "Search products",
  result: "Detected",
  inputSchema,
});

test("accepts an exact schema-valid directed input", () => {
  const result = validateDirectedToolInput(
    tool({
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    }),
    { query: "headphones" },
  );

  assert.deepEqual(result, { valid: true });
});

test("returns field-level issues for invalid input", () => {
  const result = validateDirectedToolInput(
    tool({
      type: "object",
      properties: { quantity: { type: "integer", minimum: 1 } },
      required: ["quantity"],
      additionalProperties: false,
    }),
    { quantity: 0 },
  );

  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.equal(result.code, "invalid_input");
    assert.match(result.issues[0]?.path ?? "", /quantity/);
  }
});

test("honors additionalProperties restrictions", () => {
  const result = validateDirectedToolInput(
    tool({
      type: "object",
      properties: { query: { type: "string" } },
      additionalProperties: false,
    }),
    { query: "headphones", unexpected: true },
  );

  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.match(result.issues[0]?.message ?? "", /additional properties/);
  }
});

test("allows only empty input when the schema is unavailable", () => {
  assert.deepEqual(validateDirectedToolInput(tool(), {}), { valid: true });

  const result = validateDirectedToolInput(tool("not-json"), { query: "x" });
  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.code, "schema_unavailable");
});

test("supports the 2020-12 JSON Schema dialect", () => {
  const result = validateDirectedToolInput(
    tool({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: { enabled: { type: "boolean" } },
      required: ["enabled"],
    }),
    { enabled: true },
  );

  assert.deepEqual(result, { valid: true });
});
