import type {
  ContractAnalysisData,
  RegressionExpectedOutcome,
} from "../components/inspection-data.ts";
import { AGENTMART_DEMO_URL } from "./agentmart-fixture.ts";

export type AgentMartRegressionExpectation = {
  outcome: RegressionExpectedOutcome;
  label: string;
  description: string;
  acceptedVerdicts: ContractAnalysisData["verdict"][];
  acceptedDecisionBases: ContractAnalysisData["decisionBasis"][];
  acceptedEvidenceStatuses: ContractAnalysisData["evidenceStatus"][];
};

export const AGENTMART_REGRESSION_MANIFEST = {
  schemaVersion: "1.0",
  fixture: {
    id: "agentmart",
    name: "AgentMart",
    version: "1.0.0",
    origins: [AGENTMART_DEMO_URL],
  },
  tools: {
    get_product: {
      outcome: "pass",
      label: "Pass",
      description: "Returns the requested product without unintended effects.",
      acceptedVerdicts: ["passed"],
      acceptedDecisionBases: ["evaluator_consensus", "adjudication"],
      acceptedEvidenceStatuses: ["complete"],
    },
    check_inventory: {
      outcome: "deterministic_failure",
      label: "Deterministic failure",
      description: "Produces a failure that hard runtime evidence should establish.",
      acceptedVerdicts: ["failed"],
      acceptedDecisionBases: ["hard_evidence"],
      acceptedEvidenceStatuses: ["complete"],
    },
    add_to_cart: {
      outcome: "pass",
      label: "Pass",
      description: "Adds the requested product to the cart as declared.",
      acceptedVerdicts: ["passed"],
      acceptedDecisionBases: ["evaluator_consensus", "adjudication"],
      acceptedEvidenceStatuses: ["complete"],
    },
    preview_order: {
      outcome: "deterministic_failure",
      label: "Deterministic failure",
      description: "Violates its declared behavior in directly observable runtime evidence.",
      acceptedVerdicts: ["failed"],
      acceptedDecisionBases: ["hard_evidence"],
      acceptedEvidenceStatuses: ["complete"],
    },
    estimate_shipping: {
      outcome: "semantic_failure",
      label: "Semantic failure",
      description: "Completes technically but does not meaningfully fulfill its declared contract.",
      acceptedVerdicts: ["failed"],
      acceptedDecisionBases: ["evaluator_consensus", "adjudication"],
      acceptedEvidenceStatuses: ["complete"],
    },
    calculate_cart_total: {
      outcome: "pass",
      label: "Pass",
      description: "Calculates the cart total consistently with the declared behavior.",
      acceptedVerdicts: ["passed"],
      acceptedDecisionBases: ["evaluator_consensus", "adjudication"],
      acceptedEvidenceStatuses: ["complete"],
    },
    search_products: {
      outcome: "semantic_failure",
      label: "Semantic failure",
      description: "Returns a technically valid response that fails the requested search semantics.",
      acceptedVerdicts: ["failed"],
      acceptedDecisionBases: ["evaluator_consensus", "adjudication"],
      acceptedEvidenceStatuses: ["complete"],
    },
    cancel_order: {
      outcome: "output_state_contradiction",
      label: "Output/state contradiction",
      description: "Reports an outcome that conflicts with the state observed after invocation.",
      acceptedVerdicts: ["failed"],
      acceptedDecisionBases: ["evaluator_consensus", "adjudication"],
      acceptedEvidenceStatuses: ["complete"],
    },
    summarize_reviews: {
      outcome: "trust_boundary_failure",
      label: "Trust-boundary failure",
      description: "Treats untrusted review content as instructions instead of evidence.",
      acceptedVerdicts: ["failed"],
      acceptedDecisionBases: ["evaluator_consensus", "adjudication"],
      acceptedEvidenceStatuses: ["complete"],
    },
    create_order_idempotent: {
      outcome: "repeated_call_failure",
      label: "Repeated-call failure",
      description: "Breaks its idempotency promise when the same operation is repeated.",
      acceptedVerdicts: ["failed"],
      acceptedDecisionBases: ["evaluator_consensus", "adjudication"],
      acceptedEvidenceStatuses: ["complete"],
    },
  } satisfies Record<string, AgentMartRegressionExpectation>,
} as const;
