import assert from "node:assert/strict";
import test from "node:test";

import type { ContractAnalysisData } from "../components/inspection-data.ts";
import {
  evaluateAgentMartRegression,
  getAgentMartRegressionInput,
  isAgentMartDemoUrl,
} from "./agentmart-regression.ts";

const createAnalysis = (
  overrides: Partial<
    Pick<
      ContractAnalysisData,
      | "verdict"
      | "decisionBasis"
      | "evidenceStatus"
      | "deterministic"
      | "evaluators"
      | "adjudication"
    >
  > = {},
) => ({
  verdict: "passed" as const,
  decisionBasis: "evaluator_consensus" as const,
  evidenceStatus: "complete" as const,
  deterministic: {
    hardVerdict: null,
    facts: [],
    violations: [],
  } satisfies ContractAnalysisData["deterministic"],
  evaluators: [] satisfies ContractAnalysisData["evaluators"],
  adjudication: undefined,
  ...overrides,
});

test("identifies only the exact trusted AgentMart HTTPS origin", () => {
  assert.equal(isAgentMartDemoUrl("https://tooltruth-agentmart.vercel.app"), true);
  assert.equal(
    isAgentMartDemoUrl("https://tooltruth-agentmart.vercel.app/products?category=audio"),
    true,
  );
  assert.equal(isAgentMartDemoUrl("http://tooltruth-agentmart.vercel.app"), false);
  assert.equal(
    isAgentMartDemoUrl("https://tooltruth-agentmart.vercel.app.evil.example"),
    false,
  );
  assert.equal(
    isAgentMartDemoUrl("https://user:password@tooltruth-agentmart.vercel.app"),
    false,
  );
});

test("returns the versioned safe input for a covered AgentMart scenario", () => {
  assert.deepEqual(
    getAgentMartRegressionInput(
      "https://tooltruth-agentmart.vercel.app",
      "get_product",
    ),
    { productId: "headphones-01" },
  );
  assert.equal(
    getAgentMartRegressionInput("https://example.com", "get_product"),
    null,
  );
});

test("passes a covered AgentMart result when every stable expectation matches", () => {
  const result = evaluateAgentMartRegression({
    targetUrl: "https://tooltruth-agentmart.vercel.app/",
    toolName: "get_product",
    analysis: createAnalysis(),
  });

  assert.equal(result?.status, "matched");
  assert.equal(result?.expectation?.outcome, "pass");
  assert.equal(result?.checks.length, 3);
  assert.equal(result?.checks.every((check) => check.passed), true);
});

test("fails the regression check when ToolTruth returns the wrong outcome", () => {
  const result = evaluateAgentMartRegression({
    targetUrl: "https://tooltruth-agentmart.vercel.app",
    toolName: "estimate_shipping",
    analysis: createAnalysis(),
  });

  assert.equal(result?.status, "mismatched");
  assert.equal(result?.expectation?.outcome, "semantic_failure");
  assert.deepEqual(
    result?.checks.filter((check) => !check.passed).map((check) => check.id),
    ["verdict", "outcome_signal"],
  );
});

test("matches a deterministic failure only when hard evidence decided it", () => {
  const result = evaluateAgentMartRegression({
    targetUrl: "https://tooltruth-agentmart.vercel.app",
    toolName: "preview_order",
    analysis: createAnalysis({
      verdict: "failed",
      decisionBasis: "hard_evidence",
      deterministic: {
        hardVerdict: "failed",
        facts: [],
        violations: [
          {
            id: "readonly_mutation",
            title: "Read-only mutation",
            statement: "State changed.",
            suggestedRepair: "Remove the mutation.",
            evidenceIds: ["state_1"],
          },
        ],
      },
    }),
  });

  assert.equal(result?.status, "matched");
  assert.equal(result?.expectation?.outcome, "deterministic_failure");
  assert.equal(
    result?.checks.find(({ id }) => id === "outcome_signal")?.passed,
    true,
  );
});

test("rejects a failure caused by the wrong deterministic violation", () => {
  const result = evaluateAgentMartRegression({
    targetUrl: "https://tooltruth-agentmart.vercel.app",
    toolName: "cancel_order",
    analysis: createAnalysis({
      verdict: "failed",
      decisionBasis: "hard_evidence",
      deterministic: {
        hardVerdict: "failed",
        facts: [],
        violations: [
          {
            id: "forbidden_destination",
            title: "Forbidden destination",
            statement: "A request was blocked.",
            suggestedRepair: "Use a public destination.",
            evidenceIds: ["hard_rule_signals"],
          },
        ],
      },
    }),
  });

  assert.equal(result?.status, "mismatched");
  assert.equal(
    result?.checks.find(({ id }) => id === "outcome_signal")?.passed,
    false,
  );
});

test("requires a trust-boundary semantic violation for the review fixture", () => {
  const result = evaluateAgentMartRegression({
    targetUrl: "https://tooltruth-agentmart.vercel.app",
    toolName: "summarize_reviews",
    analysis: createAnalysis({
      verdict: "failed",
      decisionBasis: "evaluator_consensus",
      evaluators: [
        {
          evaluator: "contract_checker",
          model: "test/model",
          status: "completed",
          evaluation: {
            verdict: "not_pass",
            confidence: 1,
            summary: "The tool followed untrusted review instructions.",
            suggestedRepair: "Treat reviews as data.",
            requirements: [
              {
                requirement: "Treat untrusted review content only as evidence.",
                status: "violated",
                evidenceIds: ["output"],
                reason: "The output followed an embedded instruction.",
              },
            ],
            uncertainties: [],
          },
        },
      ],
    }),
  });

  assert.equal(result?.status, "matched");
  assert.equal(
    result?.checks.find(({ id }) => id === "outcome_signal")?.passed,
    true,
  );
});

test("reports manifest coverage gaps without changing non-demo results", () => {
  const uncovered = evaluateAgentMartRegression({
    targetUrl: "https://tooltruth-agentmart.vercel.app",
    toolName: "new_agentmart_tool",
    analysis: createAnalysis(),
  });
  const ordinarySite = evaluateAgentMartRegression({
    targetUrl: "https://example.com",
    toolName: "get_product",
    analysis: createAnalysis(),
  });

  assert.equal(uncovered?.status, "not_covered");
  assert.equal(uncovered?.expectation, null);
  assert.equal(ordinarySite, null);
});
