export type ToolKey = string;

export type ToolVerificationStatus =
  | "idle"
  | "running"
  | "passed"
  | "failed"
  | "error";

export type EvidenceTab = "Timeline" | "State diff" | "Network" | "Logs";

export type Finding = {
  title: string;
  declared: string;
  observed: string;
  parameter: string;
  value: string;
  severity?: "info" | "warning" | "critical";
};

export type DetectedTool = {
  id: string;
  name: string;
  description: string;
  result: string;
  frameId?: string;
  inputSchema?: string | Record<string, unknown>;
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
  source: "stagehand" | "browser" | "runtime" | "tooltruth" | "ai";
  level: "debug" | "info" | "warning" | "error";
  message: string;
};

export type EvidenceScreenshot = {
  label: string;
  dataUrl: string;
};

export type ExecutionEvidenceData = {
  runLabel: string;
  screenshots?: EvidenceScreenshot[];
  timeline: TimelineEntry[];
  stateChanges: StateChange[];
  network: NetworkEntry[];
  logs: EvidenceLogEntry[];
};

export type ContractAnalysisData = {
  findings: Record<string, Finding>;
  verdict: "pending" | "passed" | "failed" | "error";
  unexpectedStateChanges: number;
  sandboxLabel: string;
  suggestedRepair: string;
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
};
