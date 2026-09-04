import type {
  ContractAnalysisData,
  RegressionManifestCheck,
  RegressionManifestEvaluation,
} from "../components/inspection-data.ts";
import {
  AGENTMART_REGRESSION_MANIFEST,
  type AgentMartRegressionExpectation,
} from "./agentmart-regression-manifest.v1.ts";

type RegressionAnalysis = Pick<
  ContractAnalysisData,
  "verdict" | "decisionBasis" | "evidenceStatus"
>;

const formatAcceptedValues = (values: readonly string[]) => values.join(" or ");

const createCheck = (
  id: RegressionManifestCheck["id"],
  label: string,
  acceptedValues: readonly string[],
  actual: string,
): RegressionManifestCheck => ({
  id,
  label,
  passed: acceptedValues.includes(actual),
  expected: formatAcceptedValues(acceptedValues),
  actual,
});

const identifyAgentMartOrigin = (targetUrl: string) => {
  try {
    const parsed = new URL(targetUrl);
    if (
      parsed.protocol !== "https:" ||
      parsed.username.length > 0 ||
      parsed.password.length > 0
    ) {
      return null;
    }

    return AGENTMART_REGRESSION_MANIFEST.fixture.origins.includes(
      parsed.origin as (typeof AGENTMART_REGRESSION_MANIFEST.fixture.origins)[number],
    )
      ? parsed.origin
      : null;
  } catch {
    return null;
  }
};

export const isAgentMartDemoUrl = (targetUrl: string) =>
  identifyAgentMartOrigin(targetUrl) !== null;

export const evaluateAgentMartRegression = ({
  targetUrl,
  toolName,
  analysis,
}: {
  targetUrl: string;
  toolName: string;
  analysis: RegressionAnalysis;
}): RegressionManifestEvaluation | null => {
  const matchedOrigin = identifyAgentMartOrigin(targetUrl);
  if (!matchedOrigin) return null;

  const expectation = (
    AGENTMART_REGRESSION_MANIFEST.tools as Record<
      string,
      AgentMartRegressionExpectation | undefined
    >
  )[toolName];
  const actual = {
    verdict: analysis.verdict,
    decisionBasis: analysis.decisionBasis,
    evidenceStatus: analysis.evidenceStatus,
  };
  const fixture = {
    id: AGENTMART_REGRESSION_MANIFEST.fixture.id,
    name: AGENTMART_REGRESSION_MANIFEST.fixture.name,
    version: AGENTMART_REGRESSION_MANIFEST.fixture.version,
    matchedOrigin,
  };

  if (!expectation) {
    return {
      fixture,
      manifestVersion: AGENTMART_REGRESSION_MANIFEST.schemaVersion,
      toolName,
      status: "not_covered",
      expectation: null,
      actual,
      checks: [],
    };
  }

  const checks = [
    createCheck(
      "verdict",
      "Final verdict",
      expectation.acceptedVerdicts,
      analysis.verdict,
    ),
    createCheck(
      "decision_basis",
      "Decision basis",
      expectation.acceptedDecisionBases,
      analysis.decisionBasis,
    ),
    createCheck(
      "evidence_status",
      "Evidence completeness",
      expectation.acceptedEvidenceStatuses,
      analysis.evidenceStatus,
    ),
  ];

  return {
    fixture,
    manifestVersion: AGENTMART_REGRESSION_MANIFEST.schemaVersion,
    toolName,
    status: checks.every((check) => check.passed) ? "matched" : "mismatched",
    expectation: {
      outcome: expectation.outcome,
      label: expectation.label,
      description: expectation.description,
      acceptedVerdicts: [...expectation.acceptedVerdicts],
      acceptedDecisionBases: [...expectation.acceptedDecisionBases],
      acceptedEvidenceStatuses: [...expectation.acceptedEvidenceStatuses],
    },
    actual,
    checks,
  };
};
