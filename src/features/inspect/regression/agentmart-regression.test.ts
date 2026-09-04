import assert from "node:assert/strict";
import test from "node:test";

import type { ContractAnalysisData } from "../components/inspection-data.ts";
import {
  evaluateAgentMartRegression,
  isAgentMartDemoUrl,
} from "./agentmart-regression.ts";

const createAnalysis = (
  overrides: Partial<
    Pick<ContractAnalysisData, "verdict" | "decisionBasis" | "evidenceStatus">
  > = {},
) => ({
  verdict: "passed" as const,
  decisionBasis: "evaluator_consensus" as const,
  evidenceStatus: "complete" as const,
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
    ["verdict"],
  );
});

test("matches a deterministic failure only when hard evidence decided it", () => {
  const result = evaluateAgentMartRegression({
    targetUrl: "https://tooltruth-agentmart.vercel.app",
    toolName: "preview_order",
    analysis: createAnalysis({
      verdict: "failed",
      decisionBasis: "hard_evidence",
    }),
  });

  assert.equal(result?.status, "matched");
  assert.equal(result?.expectation?.outcome, "deterministic_failure");
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
