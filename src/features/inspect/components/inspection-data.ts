export type ToolKey = string;

export type ToolVerificationStatus =
  | "idle"
  | "running"
  | "passed"
  | "failed"
  | "inconclusive"
  | "error";

export type EvidenceTab =
  | "Timeline"
  | "State diff"
  | "Network"
  | "Logs"
  | "Statistics"
  | "Replay";

export type Finding = {
  title: string;
  declared: string;
  observed: string;
  parameter: string;
  value: string;
  severity?: "info" | "warning" | "critical";
};

export type DeterministicFact = {
  id: string;
  statement: string;
};

export type DeterministicHardRuleId =
  | "invocation_error"
  | "output_schema_mismatch"
  | "readonly_mutation"
  | "success_with_failed_request"
  | "promised_mutation_missing"
  | "forbidden_destination"
  | "idempotency_violation"
  | "confirmation_missing";

export type DeterministicHardRuleViolation = {
  id: DeterministicHardRuleId;
  title: string;
  statement: string;
  suggestedRepair: string;
  evidenceIds: string[];
};

export type SemanticRequirementEvaluation = {
  requirement: string;
  status: "satisfied" | "violated" | "uncertain";
  evidenceIds: string[];
  reason: string;
};

export type SemanticEvaluation = {
  verdict: "passed" | "not_pass" | "inconclusive";
  confidence: number;
  summary: string;
  suggestedRepair: string;
  requirements: SemanticRequirementEvaluation[];
  uncertainties: string[];
};

export type SemanticEvaluatorResult = {
  evaluator: "contract_checker" | "evidence_checker";
  model: string;
  status: "completed" | "unavailable" | "failed";
  evaluation?: SemanticEvaluation;
  error?: string;
};

export type RegressionExpectedOutcome =
  | "pass"
  | "deterministic_failure"
  | "semantic_failure"
  | "output_state_contradiction"
  | "trust_boundary_failure"
  | "repeated_call_failure";

export type RegressionManifestCheck = {
  id: "verdict" | "decision_basis" | "evidence_status";
  label: string;
  passed: boolean;
  expected: string;
  actual: string;
};

export type RegressionManifestEvaluation = {
  fixture: {
    id: "agentmart";
    name: "AgentMart";
    version: string;
    matchedOrigin: string;
  };
  manifestVersion: string;
  toolName: string;
  status: "matched" | "mismatched" | "not_covered";
  expectation: {
    outcome: RegressionExpectedOutcome;
    label: string;
    description: string;
    acceptedVerdicts: ContractAnalysisData["verdict"][];
    acceptedDecisionBases: ContractAnalysisData["decisionBasis"][];
    acceptedEvidenceStatuses: ContractAnalysisData["evidenceStatus"][];
  } | null;
  actual: {
    verdict: ContractAnalysisData["verdict"];
    decisionBasis: ContractAnalysisData["decisionBasis"];
    evidenceStatus: ContractAnalysisData["evidenceStatus"];
  };
  checks: RegressionManifestCheck[];
};

export type DetectedTool = {
  id: string;
  name: string;
  description: string;
  result: string;
  frameId?: string;
  inputSchema?: string | Record<string, unknown>;
  outputSchema?: string | Record<string, unknown>;
  annotations?: Record<string, unknown>;
};

export type BrowserPreviewData = {
  url: string;
  siteName: string;
  fixtureLabel: string;
  cartCount: number;
  category: string;
  productName: string;
  productDescription: string;
  price: string;
  availableUnits: number;
  color: string;
  shipping: string;
  orderReference: string;
};

export type TimelineEntry = [string, string, string];
export type StateChange = [string, string, string];

export type NetworkEntry = {
  method: string;
  path: string;
  status: string;
  duration: string;
};

export type EvidenceLogEntry = {
  time: string;
  source:
    | "stagehand"
    | "browser"
    | "browserbase"
    | "runtime"
    | "tooltruth"
    | "ai";
  level: "debug" | "info" | "warning" | "error";
  message: string;
};

export type BrowserbaseSessionStatistics = {
  sessionId: string;
  durationMs: number;
  region: string | null;
  status: string;
  providerStatus: string | null;
  terminationReason: string | null;
  proxyBytes: number | null;
  liveViewAvailable: boolean;
  replayAvailable: boolean | null;
};

export type VerificationStatistics = {
  provider: "local" | "browserbase";
  browserStartupDurationMs: number;
  discoveryDurationMs: number;
  navigationDurationMs: number | null;
  invocationDurationMs: number;
  invocationCount: number;
  analysisDurationMs: number;
  totalDurationMs: number;
  toolCount: number;
  requestCount: number;
  mutationCount: number;
  stateChangeCount: number;
  warningCount: number;
  errorCount: number;
  finalStatus: "completed";
  browserbase: BrowserbaseSessionStatistics | null;
  operationalLogs: EvidenceLogEntry[];
};

export type EvidenceScreenshot = {
  label: string;
  url: string;
  bytes: number;
  hash: string;
};

export type ExecutionEvidenceData = {
  runLabel: string;
  screenshots?: EvidenceScreenshot[];
  repeatedInvocation?: {
    reason: "idempotency";
    firstStatus: "Completed" | "Canceled" | "Error";
    secondStatus: "Completed" | "Canceled" | "Error";
    secondStateChanges: StateChange[];
    secondMutatingRequests: string[];
  };
  timeline: TimelineEntry[];
  stateChanges: StateChange[];
  network: NetworkEntry[];
  logs: EvidenceLogEntry[];
  statistics?: VerificationStatistics;
};

export type ContractAnalysisData = {
  findings: Record<string, Finding>;
  verdict: "pending" | "passed" | "failed" | "inconclusive" | "error";
  unexpectedStateChanges: number;
  sandboxLabel: string;
  suggestedRepair: string;
  evidenceStatus: "complete" | "partial" | "unavailable";
  deterministic: {
    hardVerdict: "failed" | "error" | null;
    facts: DeterministicFact[];
    violations: DeterministicHardRuleViolation[];
  };
  evaluators: SemanticEvaluatorResult[];
  adjudication?: SemanticEvaluation;
  consensus:
    | "not_required"
    | "agreement"
    | "disagreement"
    | "insufficient_evaluators";
  decisionBasis:
    | "hard_evidence"
    | "evaluator_consensus"
    | "adjudication"
    | "insufficient_evidence";
  regression?: RegressionManifestEvaluation;
};

export const detectedTools: DetectedTool[] = [
  {
    id: "preview_order" as const,
    name: "preview_order",
    description: "Calculate a checkout preview",
    result: "Violation found",
  },
  {
    id: "check_inventory" as const,
    name: "check_inventory",
    description: "Read current product availability",
    result: "Violation found",
  },
  {
    id: "summarize_reviews" as const,
    name: "summarize_reviews",
    description: "Summarize external customer reviews",
    result: "Needs review",
  },
  {
    id: "estimate_shipping" as const,
    name: "estimate_shipping",
    description: "Estimate delivery date and cost",
    result: "Not tested",
  },
];

export const browserPreview: BrowserPreviewData = {
  url: "https://fixture.tooltruth.dev/products/headphones",
  siteName: "AgentMart",
  fixtureLabel: "Commerce fixture",
  cartCount: 1,
  category: "Audio",
  productName: "Studio wireless headphones",
  productDescription:
    "Balanced sound, adaptive noise cancellation, and a 30-hour battery for focused work.",
  price: "$129.00",
  availableUnits: 14,
  color: "Graphite",
  shipping: "Free",
  orderReference: "#1048",
};

export const findings: Record<ToolKey, Finding> = {
  preview_order: {
    title: "Behavior does not match the contract",
    declared: "Calculates an order preview without changing application state.",
    observed: "Created order #1048, reduced inventory, and cleared the cart.",
    parameter: "productId",
    value: "headphones-01",
  },
  check_inventory: {
    title: "A read-only tool changed inventory",
    declared: "Returns the current inventory count without making changes.",
    observed: "Reduced available inventory from 14 units to 13 units.",
    parameter: "productId",
    value: "headphones-01",
  },
  summarize_reviews: {
    title: "External content needs a trust boundary",
    declared: "Summarizes product reviews from an external source.",
    observed: "Returned external review text without marking it as untrusted.",
    parameter: "productId",
    value: "headphones-01",
  },
  estimate_shipping: {
    title: "This tool has not been verified yet",
    declared: "Estimates shipping cost and arrival date from a postal code.",
    observed: "No runtime behavior has been recorded for this tool.",
    parameter: "postalCode",
    value: "78701",
  },
};

export const timeline: TimelineEntry[] = [
  ["00:00.000", "Baseline captured", "Cart: 1 item · Inventory: 14"],
  ["00:01.142", "Tool invoked", "preview_order(productId, quantity)"],
  ["00:01.864", "Network mutation", "POST /api/orders · 201 Created"],
  [
    "00:02.091",
    "Rendered confirmation",
    "“Order confirmed” appeared in the page",
  ],
  [
    "00:02.308",
    "State comparison",
    "Order added · Inventory −1 · Cart cleared",
  ],
];

export const stateChanges: StateChange[] = [
  ["orders", "0 records", "1 record"],
  ["inventory.headphones-01", "14", "13"],
  ["cart.items", "1", "0"],
];

export const executionEvidence: ExecutionEvidenceData = {
  runLabel: "Probe run TT-2048",
  timeline,
  stateChanges,
  network: [
    {
      method: "POST",
      path: "/api/orders",
      status: "201 Created",
      duration: "164 ms",
    },
  ],
  logs: [
    {
      time: "00:01.142",
      source: "tooltruth",
      level: "info",
      message: "Invoked preview_order in the isolated browser.",
    },
  ],
};

export const contractAnalysis: ContractAnalysisData = {
  findings,
  verdict: "failed",
  unexpectedStateChanges: 3,
  sandboxLabel: "Clean sandbox",
  suggestedRepair:
    "Split the preview and purchase behavior into separate tools, then require approval before placing the order.",
  evidenceStatus: "complete",
  deterministic: {
    hardVerdict: "failed",
    facts: [
      {
        id: "state_1",
        statement: "A declared read-only operation changed persistent state.",
      },
    ],
    violations: [
      {
        id: "readonly_mutation",
        title: "A read-only tool changed observable state",
        statement: "A declared read-only operation changed persistent state.",
        suggestedRepair:
          "Remove the side effect or update the declared contract.",
        evidenceIds: ["contract", "hard_rule_signals"],
      },
    ],
  },
  evaluators: [],
  consensus: "not_required",
  decisionBasis: "hard_evidence",
};
