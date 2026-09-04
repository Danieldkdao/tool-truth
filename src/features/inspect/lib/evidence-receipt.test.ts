import assert from "node:assert/strict";
import test from "node:test";

import {
  createEvidenceReceipt,
  createEvidenceReceiptFilename,
  serializeEvidenceReceiptJson,
  type EvidenceReceiptSource,
} from "./evidence-receipt.ts";
import { serializeEvidenceReceiptMarkdown } from "./evidence-receipt-markdown.ts";
import { createEvidenceReceiptResult } from "./evidence-receipt-result.ts";
import { REDACTED_VALUE, redactSensitiveText } from "./report-redaction.ts";

const SECRET_VALUES = [
  "hunter2",
  "owner@example.com",
  "sk-test-secret-value",
  "session-secret-123",
  "signed-live-token",
  "output-schema-secret",
];

const createSource = (): EvidenceReceiptSource => {
  const selectedTool = {
    id: "preview_order",
    name: "preview_order",
    description: "Calculate a checkout preview for owner@example.com",
    result: "Verification failed",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", example: "owner@example.com" },
        password: { type: "string", default: "hunter2" },
        productId: { type: "string", example: "headphones-01" },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        password: { type: "string", default: "output-schema-secret" },
      },
    },
    annotations: {
      readOnlyHint: true,
      apiKey: "sk-test-secret-value",
    },
  };

  return {
    runId: "run-public-123",
    probeId: "probe-public-456",
    attempt: 2,
    status: "failed",
    error: null,
    selectedTool,
    discoveredTools: [selectedTool],
    browserData: {
      url: "https://example.com/orders?product=headphones&token=session-secret-123",
      siteName: "Example Store",
      fixtureLabel: "Commerce fixture",
      cartCount: 1,
      category: "Audio",
      productName: "Headphones",
      productDescription: "Wireless headphones",
      price: "$129.00",
      availableUnits: 14,
      color: "Graphite",
      shipping: "Free",
      orderReference: "#1048",
    },
    browserSession: {
      targetUrl:
        "https://example.com/orders?product=headphones&token=session-secret-123",
      status: "completed",
      liveViewUrl: "https://live.example.com/signed-live-token",
      endedAt: Date.parse("2026-09-03T18:30:00.000Z"),
    },
    evidence: {
      runLabel: "Probe probe-public-456 · preview_order",
      screenshots: [
        {
          label: "After tool invocation",
          url: "/api/screenshot?token=session-secret-123",
          bytes: 2048,
          hash: "abc123",
        },
      ],
      timeline: [
        ["00:00.000", "Input prepared", "password=hunter2"],
        ["00:01.000", "Tool invoked", "preview_order(headphones-01)"],
      ],
      stateChanges: [
        ["customer.email", "owner@example.com", "owner@example.com"],
      ],
      network: [
        {
          method: "POST",
          path: "/api/orders?token=session-secret-123",
          status: "201 Created",
          duration: "164 ms",
        },
      ],
      logs: [
        {
          time: "00:01.000",
          source: "runtime",
          level: "info",
          message:
            "Authorization: Bearer session-secret-123 for owner@example.com",
        },
      ],
      statistics: {
        provider: "browserbase",
        browserStartupDurationMs: 100,
        discoveryDurationMs: 200,
        navigationDurationMs: 300,
        invocationDurationMs: 400,
        invocationCount: 1,
        analysisDurationMs: 500,
        totalDurationMs: 1_500,
        toolCount: 1,
        requestCount: 1,
        mutationCount: 1,
        stateChangeCount: 1,
        warningCount: 0,
        errorCount: 0,
        finalStatus: "completed",
        browserbase: {
          sessionId: "signed-live-token",
          durationMs: 1_500,
          region: "us-west",
          status: "completed",
          providerStatus: "completed",
          terminationReason: null,
          proxyBytes: 200,
          liveViewAvailable: true,
          replayAvailable: true,
        },
        operationalLogs: [],
      },
    },
    analysis: {
      findings: {
        preview_order: {
          title: "Behavior does not match the contract",
          declared: "Calculate a preview without changing state.",
          observed: "An order was created.",
          parameter: "productId",
          value: "headphones-01",
          severity: "critical",
        },
      },
      verdict: "failed",
      unexpectedStateChanges: 1,
      sandboxLabel: "Isolated browser",
      suggestedRepair: "Separate preview and purchase behavior.",
      evidenceStatus: "complete",
      deterministic: {
        hardVerdict: "failed",
        facts: [{ id: "state_1", statement: "Persistent state changed." }],
        violations: [
          {
            id: "readonly_mutation",
            title: "A read-only tool changed observable state",
            statement: "Persistent state changed.",
            suggestedRepair: "Remove the side effect.",
            evidenceIds: ["state_1"],
          },
        ],
      },
      evaluators: [
        {
          evaluator: "contract_checker",
          model: "primary/model",
          status: "completed",
          evaluation: {
            verdict: "not_pass",
            confidence: 0.98,
            summary: "The contract was violated.",
            suggestedRepair: "Separate the two operations.",
            requirements: [
              {
                requirement: "Do not change state.",
                status: "violated",
                evidenceIds: ["state_1"],
                reason: "The order count changed.",
              },
            ],
            uncertainties: [],
          },
        },
      ],
      consensus: "agreement",
      decisionBasis: "evaluator_consensus",
    },
  };
};

test("creates complete JSON and Markdown receipts without private values", () => {
  const receipt = createEvidenceReceipt(
    createSource(),
    new Date("2026-09-03T18:45:00.000Z"),
  );
  const json = serializeEvidenceReceiptJson(receipt);
  const markdown = serializeEvidenceReceiptMarkdown(receipt);

  for (const secret of SECRET_VALUES) {
    assert.doesNotMatch(json, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(
      markdown,
      new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }

  assert.equal(
    receipt.selectedTool.inputSchema &&
      typeof receipt.selectedTool.inputSchema === "object" &&
      !Array.isArray(receipt.selectedTool.inputSchema)
      ? JSON.stringify(receipt.selectedTool.inputSchema).includes(
          `"example":"${REDACTED_VALUE}"`,
        )
      : false,
    true,
  );
  assert.equal(
    receipt.selectedTool.outputSchema &&
      typeof receipt.selectedTool.outputSchema === "object" &&
      !Array.isArray(receipt.selectedTool.outputSchema)
      ? JSON.stringify(receipt.selectedTool.outputSchema).includes(
          `"default":"${REDACTED_VALUE}"`,
        )
      : false,
    true,
  );
  assert.equal(
    receipt.browser.preview?.url,
    "https://example.com/orders?product=%5BREDACTED%5D&token=%5BREDACTED%5D",
  );
  assert.match(json, /"timeline": \[/);
  assert.match(json, /"stateChanges": \[/);
  assert.match(json, /"evaluators": \[/);
  assert.match(json, /\[REDACTED\]/);
  assert.ok(json.endsWith("\n"));

  assert.match(markdown, /^# ToolTruth WebMCP Evidence Receipt/m);
  assert.match(markdown, /^## Findings$/m);
  assert.match(markdown, /^### Timeline$/m);
  assert.match(markdown, /^### Network activity$/m);
  assert.match(markdown, /^## Verification statistics$/m);
  assert.match(markdown, /^## Appendix: complete sanitized receipt$/m);
  assert.match(markdown, /\| Requirement \| Status \| Evidence IDs \| Reason \|/);
});

test("creates filesystem-safe, format-specific filenames", () => {
  const receipt = createEvidenceReceipt(
    createSource(),
    new Date("2026-09-03T18:45:00.000Z"),
  );

  assert.equal(
    createEvidenceReceiptFilename(receipt, "json"),
    "tooltruth-preview-order-2026-09-03T18-45-00-000Z.json",
  );
  assert.equal(
    createEvidenceReceiptFilename(receipt, "markdown"),
    "tooltruth-preview-order-2026-09-03T18-45-00-000Z.md",
  );
});

test("returns the complete receipt in the WebMCP-selected format", () => {
  const jsonResult = createEvidenceReceiptResult(createSource(), "json");
  const markdownResult = createEvidenceReceiptResult(
    createSource(),
    "markdown",
  );

  assert.equal(jsonResult.format, "json");
  assert.equal(jsonResult.mediaType, "application/json");
  assert.equal(typeof jsonResult.content, "object");
  assert.equal(
    typeof jsonResult.content === "object"
      ? jsonResult.content.schemaVersion
      : null,
    "1.1",
  );

  assert.equal(markdownResult.format, "markdown");
  assert.equal(markdownResult.mediaType, "text/markdown");
  assert.equal(typeof markdownResult.content, "string");
  assert.match(
    String(markdownResult.content),
    /^# ToolTruth WebMCP Evidence Receipt/m,
  );
  assert.match(
    String(markdownResult.content),
    /^## Appendix: complete sanitized receipt$/m,
  );
});

test("adds redacted collaboration data only for directed probes", () => {
  const automaticReceipt = createEvidenceReceipt(createSource());
  assert.equal(automaticReceipt.schemaVersion, "1.1");
  assert.equal(automaticReceipt.collaboration, undefined);

  const source = createSource();
  source.directedTest = {
    request: "Check owner@example.com without mutation",
    input: { email: "owner@example.com", productId: "headphones-01" },
    inputHash: "input-hash",
    assertions: [
      { kind: "no_mutating_requests" },
      {
        kind: "output_field_equals",
        path: ["password"],
        expected: "hunter2",
      },
    ],
    parentProbeId: null,
    rootProbeId: "probe-public-456",
    round: 1,
  };
  source.directedEvaluation = {
    verdict: "failed",
    checks: [
      {
        assertion: { kind: "no_mutating_requests" },
        status: "violated",
        explanation: "A mutation was observed for owner@example.com.",
        evidenceIds: ["network"],
      },
    ],
  };

  const directedReceipt = createEvidenceReceipt(source);
  const serialized = serializeEvidenceReceiptJson(directedReceipt);
  assert.equal(directedReceipt.collaboration?.round, 1);
  assert.match(serialized, /"collaboration"/);
  assert.doesNotMatch(serialized, /owner@example\.com/);
  assert.match(serialized, /\[REDACTED\]/);
});

test("keeps ordinary text unchanged while redacting credentials", () => {
  assert.equal(redactSensitiveText("No observable state changes"), "No observable state changes");
  assert.equal(
    redactSensitiveText("Authorization: Bearer session-secret-123"),
    "Authorization: [REDACTED]",
  );
});
