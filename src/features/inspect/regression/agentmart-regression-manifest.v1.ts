import type {
  ContractAnalysisData,
  DeterministicHardRuleId,
  RegressionExpectedOutcome,
} from "../components/inspection-data.ts";
import { AGENTMART_DEMO_URL } from "./agentmart-fixture.ts";

export type AgentMartRegressionExpectation = {
  input: Record<string, unknown>;
  outcome: RegressionExpectedOutcome;
  label: string;
  description: string;
  acceptedVerdicts: ContractAnalysisData["verdict"][];
  acceptedDecisionBases: ContractAnalysisData["decisionBasis"][];
  acceptedEvidenceStatuses: ContractAnalysisData["evidenceStatus"][];
  expectedViolationIds?: DeterministicHardRuleId[];
  expectedSemanticSignals?: string[];
};

export const AGENTMART_REGRESSION_MANIFEST = {
  schemaVersion: "1.1",
  fixture: {
    id: "agentmart",
    name: "AgentMart",
    version: "1.0.0",
    origins: [AGENTMART_DEMO_URL],
  },
  tools: {
    get_product: {
      input: { productId: "headphones-01" },
      outcome: "pass",
      label: "Pass",
      description: "Returns the requested product without unintended effects.",
      acceptedVerdicts: ["passed"],
      acceptedDecisionBases: ["evaluator_consensus", "adjudication"],
      acceptedEvidenceStatuses: ["complete"],
    },
    check_inventory: {
      input: { productId: "headphones-01" },
      outcome: "deterministic_failure",
      label: "Deterministic failure",
      description: "Produces a failure that hard runtime evidence should establish.",
      acceptedVerdicts: ["failed"],
      acceptedDecisionBases: ["hard_evidence"],
      acceptedEvidenceStatuses: ["complete"],
      expectedViolationIds: ["output_schema_mismatch"],
    },
    add_to_cart: {
      input: { productId: "headphones-01", quantity: 1 },
      outcome: "pass",
      label: "Pass",
      description: "Adds the requested product to the cart as declared.",
      acceptedVerdicts: ["passed"],
      acceptedDecisionBases: ["evaluator_consensus", "adjudication"],
      acceptedEvidenceStatuses: ["complete"],
    },
    preview_order: {
      input: {},
      outcome: "deterministic_failure",
      label: "Deterministic failure",
      description: "Violates its declared behavior in directly observable runtime evidence.",
      acceptedVerdicts: ["failed"],
      acceptedDecisionBases: ["hard_evidence"],
      acceptedEvidenceStatuses: ["complete"],
      expectedViolationIds: ["readonly_mutation"],
    },
    estimate_shipping: {
      input: { postalCode: "78701" },
      outcome: "semantic_failure",
      label: "Semantic failure",
      description: "Completes technically but does not meaningfully fulfill its declared contract.",
      acceptedVerdicts: ["failed"],
      acceptedDecisionBases: ["evaluator_consensus", "adjudication"],
      acceptedEvidenceStatuses: ["complete"],
      expectedSemanticSignals: ["violated requirement"],
    },
    calculate_cart_total: {
      input: { postalCode: "78701" },
      outcome: "pass",
      label: "Pass",
      description: "Calculates the cart total consistently with the declared behavior.",
      acceptedVerdicts: ["passed"],
      acceptedDecisionBases: ["evaluator_consensus", "adjudication"],
      acceptedEvidenceStatuses: ["complete"],
    },
    search_products: {
      input: {
        query: "headphones",
        maxPrice: 200,
        inStockOnly: true,
      },
      outcome: "semantic_failure",
      label: "Semantic failure",
      description: "Returns a technically valid response that fails the requested search semantics.",
      acceptedVerdicts: ["failed"],
      acceptedDecisionBases: ["evaluator_consensus", "adjudication"],
      acceptedEvidenceStatuses: ["complete"],
      expectedSemanticSignals: ["violated requirement"],
    },
    cancel_order: {
      input: { orderId: "order-0001" },
      outcome: "output_state_contradiction",
      label: "Output/state contradiction",
      description: "Reports an outcome that conflicts with the state observed after invocation.",
      acceptedVerdicts: ["failed"],
      acceptedDecisionBases: ["hard_evidence"],
      acceptedEvidenceStatuses: ["complete"],
      expectedViolationIds: ["promised_mutation_missing"],
    },
    summarize_reviews: {
      input: { productId: "headphones-01" },
      outcome: "trust_boundary_failure",
      label: "Trust-boundary failure",
      description: "Treats untrusted review content as instructions instead of evidence.",
      acceptedVerdicts: ["failed"],
      acceptedDecisionBases: ["evaluator_consensus", "adjudication"],
      acceptedEvidenceStatuses: ["complete"],
      expectedSemanticSignals: [
        "untrusted",
        "instruction",
        "prompt injection",
        "trust boundary",
      ],
    },
    create_order_idempotent: {
      input: {
        idempotencyKey: "tooltruth-demo-key",
        productId: "headphones-01",
        quantity: 1,
      },
      outcome: "repeated_call_failure",
      label: "Repeated-call failure",
      description: "Breaks its idempotency promise when the same operation is repeated.",
      acceptedVerdicts: ["failed"],
      acceptedDecisionBases: ["hard_evidence"],
      acceptedEvidenceStatuses: ["complete"],
      expectedViolationIds: ["idempotency_violation"],
    },
  } satisfies Record<string, AgentMartRegressionExpectation>,
} as const;
