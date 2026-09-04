import type {
  DirectedAssertion,
  DirectedTestDefinition,
  DirectedTestEvaluation,
  JsonValue,
} from "../components/inspection-data.ts";
import {
  isSensitiveDataFieldName,
  REDACTED_VALUE,
  sanitizeForExport,
  sanitizeObjectForExport,
} from "./report-redaction.ts";

export const sanitizeDirectedAssertion = (
  assertion: DirectedAssertion,
): DirectedAssertion => {
  const sanitized = sanitizeForExport(assertion) as DirectedAssertion;
  if (
    assertion.kind === "output_field_equals" &&
    assertion.path.some(isSensitiveDataFieldName)
  ) {
    return {
      kind: "output_field_equals",
      path: assertion.path,
      expected: REDACTED_VALUE as JsonValue,
    };
  }
  return sanitized;
};

export const sanitizeDirectedTest = (
  test: DirectedTestDefinition,
): DirectedTestDefinition => ({
  ...test,
  request: sanitizeForExport(test.request) as string,
  input: sanitizeObjectForExport(test.input) as Record<string, JsonValue>,
  assertions: test.assertions.map(sanitizeDirectedAssertion),
});

export const sanitizeDirectedEvaluation = (
  evaluation: DirectedTestEvaluation,
): DirectedTestEvaluation => ({
  verdict: evaluation.verdict,
  checks: evaluation.checks.map((check) => ({
    assertion: sanitizeDirectedAssertion(check.assertion),
    status: check.status,
    explanation: sanitizeForExport(check.explanation) as string,
    evidenceIds: check.evidenceIds.map(
      (evidenceId) => sanitizeForExport(evidenceId) as string,
    ),
  })),
});
