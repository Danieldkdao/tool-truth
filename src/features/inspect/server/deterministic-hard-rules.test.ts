import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateDeterministicHardRules,
  type DeterministicHardRuleInput,
} from "./deterministic-hard-rules.ts";

const createInput = (
  overrides: Partial<DeterministicHardRuleInput> = {},
): DeterministicHardRuleInput => ({
  tool: {
    id: "frame:tool",
    name: "example_tool",
    description: "Returns information without modifying application state.",
    result: "Declared read-only",
    annotations: { readOnlyHint: true },
  },
  toolInput: {},
  toolOutput: { productId: "headphones-01" },
  invocationStatus: "Completed",
  stateChanges: [],
  mutatingRequests: [],
  networkRequests: [],
  forbiddenDestinationRequests: [],
  evidenceComplete: true,
  before: {
    url: "https://example.com/products",
    dom: { dialogs: 0 },
  },
  after: {
    url: "https://example.com/products",
    dom: { dialogs: 0 },
  },
  ...overrides,
});

const violationIds = (input: DeterministicHardRuleInput) =>
  evaluateDeterministicHardRules(input).violations.map(({ id }) => id);

test("keeps a clean deterministic result unresolved for semantic evaluation", () => {
  const evaluation = evaluateDeterministicHardRules(createInput());

  assert.equal(evaluation.hardVerdict, null);
  assert.deepEqual(evaluation.violations, []);
});

test("returns an error when the tool invocation did not complete", () => {
  const evaluation = evaluateDeterministicHardRules(
    createInput({ invocationStatus: "Error" }),
  );

  assert.equal(evaluation.hardVerdict, "error");
  assert.deepEqual(violationIds(createInput({ invocationStatus: "Error" })), [
    "invocation_error",
  ]);
});

test("fails output that violates a declared JSON schema", () => {
  const input = createInput({
    tool: {
      ...createInput().tool,
      outputSchema: {
        type: "object",
        required: ["productId", "price"],
        properties: {
          productId: { type: "string" },
          price: { type: "number" },
        },
        additionalProperties: false,
      },
    },
    toolOutput: { productId: "headphones-01" },
  });

  assert.deepEqual(violationIds(input), ["output_schema_mismatch"]);
});

test("accepts output that satisfies the declared JSON schema", () => {
  const input = createInput({
    tool: {
      ...createInput().tool,
      outputSchema: {
        type: "object",
        required: ["productId", "price"],
        properties: {
          productId: { type: "string" },
          price: { type: "number" },
        },
        additionalProperties: false,
      },
    },
    toolOutput: { productId: "headphones-01", price: 129 },
  });

  assert.equal(
    violationIds(input).includes("output_schema_mismatch"),
    false,
  );
});

test("validates output schemas that declare the 2020-12 dialect", () => {
  const input = createInput({
    tool: {
      ...createInput().tool,
      outputSchema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          tags: {
            type: "array",
            prefixItems: [{ type: "string" }],
            items: false,
          },
        },
      },
    },
    toolOutput: { tags: ["valid", "unexpected"] },
  });

  assert.equal(violationIds(input).includes("output_schema_mismatch"), true);
});

test("does not attribute an uncorrelated failed request to the tool", () => {
  const input = createInput({
    tool: {
      ...createInput().tool,
      description: "Returns whether the operation succeeded.",
      annotations: { readOnlyHint: false },
    },
    toolOutput: { success: true },
    networkRequests: [
      {
        type: "fetch",
        method: "POST",
        path: "https://example.com/api/orders",
        status: 500,
        error: null,
      },
    ],
  });

  assert.equal(evaluateDeterministicHardRules(input).hardVerdict, null);
});

test("does not hard-fail a success claim when an application request succeeded", () => {
  const input = createInput({
    toolOutput: { success: true },
    networkRequests: [
      {
        type: "fetch",
        method: "POST",
        path: "https://example.com/api/orders",
        status: 201,
        error: null,
      },
      {
        type: "fetch",
        method: "POST",
        path: "https://example.com/api/telemetry",
        status: 500,
        error: null,
      },
    ],
  });

  assert.equal(evaluateDeterministicHardRules(input).hardVerdict, null);
});

test("fails a successful promised mutation when complete direct evidence shows no effect", () => {
  const input = createInput({
    tool: {
      ...createInput().tool,
      name: "cancel_order",
      description:
        "Cancels the visible order, updates its status in the page, and restores inventory.",
      annotations: { readOnlyHint: false },
    },
    toolOutput: { success: true, status: "canceled" },
  });

  assert.equal(
    violationIds(input).includes("promised_mutation_missing"),
    true,
  );
});

test("does not treat a false read-only hint as a promise to mutate", () => {
  const input = createInput({
    tool: {
      ...createInput().tool,
      description: "Returns the current cart when available.",
      annotations: { readOnlyHint: false },
    },
    toolOutput: { success: true },
  });

  assert.equal(
    violationIds(input).includes("promised_mutation_missing"),
    false,
  );
});

test("does not infer a missing mutation from incomplete evidence", () => {
  const input = createInput({
    tool: {
      ...createInput().tool,
      name: "cancel_order",
      description:
        "Cancels the visible order, updates its status in the page, and restores inventory.",
      annotations: { readOnlyHint: false },
    },
    toolOutput: { success: true },
    evidenceComplete: false,
  });

  assert.equal(
    violationIds(input).includes("promised_mutation_missing"),
    false,
  );
});

test("fails a request that attempted to contact a forbidden destination", () => {
  const input = createInput({
    forbiddenDestinationRequests: [
      "POST http://169.254.169.254/latest/meta-data · blocked",
    ],
  });

  assert.equal(violationIds(input).includes("forbidden_destination"), true);
});

test("fails a repeated idempotent call that causes a second observable effect", () => {
  const input = createInput({
    tool: {
      ...createInput().tool,
      name: "create_order_idempotent",
      description:
        "Creates an order. Repeating the call with the same idempotency key must return the original order without creating another order or reducing inventory again.",
      annotations: { readOnlyHint: false },
    },
    repeatedInvocation: {
      firstStatus: "Completed",
      secondStatus: "Completed",
      firstOutput: { success: true, orderId: "order-1" },
      secondOutput: { success: true, orderId: "order-2" },
      secondStateChanges: [
        [
          "localStorage.agentmart-fixture-v1",
          "120 B · abcdef12",
          "180 B · 12345678",
        ],
      ],
      secondMutatingRequests: ["POST https://example.com/api/orders · 201"],
    },
  });

  assert.equal(violationIds(input).includes("idempotency_violation"), true);
});

test("accepts a repeated idempotent call with no second observable effect", () => {
  const input = createInput({
    tool: {
      ...createInput().tool,
      name: "create_order_idempotent",
      description: "Idempotent order creation for the same idempotency key.",
      annotations: { readOnlyHint: false },
    },
    repeatedInvocation: {
      firstStatus: "Completed",
      secondStatus: "Completed",
      firstOutput: { success: true, orderId: "order-1" },
      secondOutput: { success: true, orderId: "order-1" },
      secondStateChanges: [],
      secondMutatingRequests: ["POST https://example.com/api/orders · 200"],
    },
  });

  assert.equal(violationIds(input).includes("idempotency_violation"), false);
});

test("fails a repeated idempotent call that does not return the original result", () => {
  const input = createInput({
    tool: {
      ...createInput().tool,
      name: "create_order_idempotent",
      description:
        "Creates an order idempotently and returns the original order when repeated.",
      annotations: { idempotentHint: true, readOnlyHint: false },
    },
    repeatedInvocation: {
      firstStatus: "Completed",
      secondStatus: "Error",
      firstOutput: { orderId: "order-1" },
      secondOutput: undefined,
      secondStateChanges: [],
      secondMutatingRequests: [],
    },
  });

  assert.equal(violationIds(input).includes("idempotency_violation"), true);
});

test("fails a consequential success when a promised confirmation never occurred", () => {
  const input = createInput({
    tool: {
      ...createInput().tool,
      description: "Deletes the order only after explicit user confirmation.",
      annotations: { readOnlyHint: false, requiresConfirmation: true },
      inputSchema: {
        type: "object",
        properties: { confirmed: { type: "boolean" } },
      },
    },
    toolInput: { confirmed: false },
    toolOutput: { success: true },
    mutatingRequests: ["DELETE https://example.com/api/orders/order-1 · 204"],
  });

  assert.equal(violationIds(input).includes("confirmation_missing"), true);
});

test("honors a nested schema-defined confirmation signal", () => {
  const input = createInput({
    tool: {
      ...createInput().tool,
      description: "Deletes the order only after explicit user confirmation.",
      annotations: { readOnlyHint: false, requiresConfirmation: true },
      inputSchema: {
        type: "object",
        properties: {
          approval: {
            type: "object",
            properties: {
              approvalGranted: {
                type: "boolean",
              },
            },
          },
        },
      },
    },
    toolInput: { approval: { approvalGranted: true } },
    toolOutput: { success: true },
    mutatingRequests: ["DELETE https://example.com/api/orders/order-1 · 204"],
  });

  assert.equal(violationIds(input).includes("confirmation_missing"), false);
});

test("leaves confirmation semantics unresolved when the schema identifies no signal", () => {
  const input = createInput({
    tool: {
      ...createInput().tool,
      description: "Deletes the order only after explicit user confirmation.",
      annotations: { readOnlyHint: false, requiresConfirmation: true },
      inputSchema: {
        type: "object",
        properties: { actionMode: { type: "string" } },
      },
    },
    toolInput: { actionMode: "approved" },
    toolOutput: { success: true },
    mutatingRequests: ["DELETE https://example.com/api/orders/order-1 · 204"],
  });

  assert.equal(violationIds(input).includes("confirmation_missing"), false);
});
