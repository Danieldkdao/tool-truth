export type ToolKey =
  | "preview_order"
  | "check_inventory"
  | "summarize_reviews"
  | "estimate_shipping";

export type EvidenceTab = "Timeline" | "State diff" | "Network";

export type Finding = {
  title: string;
  declared: string;
  observed: string;
  parameter: string;
  value: string;
};

export const detectedTools = [
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

export const timeline = [
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

export const stateChanges = [
  ["orders", "0 records", "1 record"],
  ["inventory.headphones-01", "14", "13"],
  ["cart.items", "1", "0"],
];
