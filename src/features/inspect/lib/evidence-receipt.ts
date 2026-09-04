import type {
  BrowserPreviewData,
  ContractAnalysisData,
  DetectedTool,
  DirectedTestDefinition,
  DirectedTestEvaluation,
  ExecutionEvidenceData,
  ToolVerificationStatus,
} from "@/features/inspect/components/inspection-data";
import type { BrowserSessionView } from "@/features/inspect/components/inspection-stream";
import {
  sanitizeDirectedAssertion,
  sanitizeDirectedEvaluation,
} from "./directed-redaction.ts";
import {
  REDACTED_VALUE,
  sanitizeForExport,
  sanitizeObjectForExport,
  type SafeJsonObject,
  type SafeJsonValue,
} from "./report-redaction.ts";

export type EvidenceReceiptFormat = "json" | "markdown";

export type EvidenceReceiptSource = {
  runId: string;
  probeId: string;
  attempt: number;
  status: ToolVerificationStatus;
  error: string | null;
  selectedTool: DetectedTool;
  discoveredTools: DetectedTool[];
  browserData: BrowserPreviewData | null;
  browserSession: BrowserSessionView | null;
  evidence: ExecutionEvidenceData;
  analysis: ContractAnalysisData;
  directedTest?: DirectedTestDefinition | null;
  directedEvaluation?: DirectedTestEvaluation | null;
};

export type EvidenceReceipt = {
  schemaVersion: "1.1";
  generatedAt: string;
  generator: {
    name: "ToolTruth";
    documentType: "WebMCP evidence receipt";
  };
  privacy: {
    redactionMarker: string;
    policy: string;
    intentionallyExcluded: string[];
  };
  inspection: {
    runId: string;
    probeId: string;
    attempt: number;
    status: ToolVerificationStatus;
    selectedToolId: string;
    discoveredToolCount: number;
  };
  selectedTool: SafeJsonObject;
  discoveredTools: SafeJsonObject[];
  browser: {
    preview: SafeJsonObject | null;
    session: SafeJsonObject | null;
  };
  verification: {
    error: SafeJsonValue;
    analysis: SafeJsonObject;
    evidence: SafeJsonObject;
  };
  collaboration?: {
    request: SafeJsonValue;
    input: SafeJsonObject;
    inputHash: string;
    assertions: SafeJsonValue;
    directedEvaluation: SafeJsonValue;
    parentProbeId: string | null;
    round: number;
  };
};

const createSafeBrowserSession = (
  browserSession: BrowserSessionView | null,
): SafeJsonObject | null => {
  if (!browserSession) return null;

  return sanitizeObjectForExport({
    targetUrl: browserSession.targetUrl,
    status: browserSession.status,
    endedAt: browserSession.endedAt,
    endedAtIso:
      browserSession.endedAt === null
        ? null
        : new Date(browserSession.endedAt).toISOString(),
    liveViewAvailable: Boolean(browserSession.liveViewUrl),
    liveViewUrl: REDACTED_VALUE,
  });
};

const createSafeEvidence = (
  evidence: ExecutionEvidenceData,
): SafeJsonObject => {
  const safeEvidence = sanitizeObjectForExport(evidence);

  if (evidence.screenshots) {
    safeEvidence.screenshots = evidence.screenshots.map((screenshot) =>
      sanitizeObjectForExport({
        label: screenshot.label,
        bytes: screenshot.bytes,
        hash: screenshot.hash,
        sourceUrl: "[OMITTED: transient local evidence URL]",
      }),
    );
  }

  return safeEvidence;
};

export const createEvidenceReceipt = (
  source: EvidenceReceiptSource,
  generatedAt = new Date(),
): EvidenceReceipt => {
  return {
    schemaVersion: "1.1",
    generatedAt: generatedAt.toISOString(),
    generator: {
      name: "ToolTruth",
      documentType: "WebMCP evidence receipt",
    },
    privacy: {
      redactionMarker: REDACTED_VALUE,
      policy:
        "Secrets, credentials, private values, authentication material, and transient access URLs are removed before serialization.",
      intentionallyExcluded: [
        "Passwords, passphrases, and one-time codes",
        "API keys, tokens, cookies, authorization headers, and credentials",
        "Private contact, identity, payment, and account values",
        "Browser live-view URLs and transient screenshot access URLs",
      ],
    },
    inspection: {
      runId: source.runId,
      probeId: source.probeId,
      attempt: source.attempt,
      status: source.status,
      selectedToolId: source.selectedTool.id,
      discoveredToolCount: source.discoveredTools.length,
    },
    selectedTool: sanitizeObjectForExport(source.selectedTool),
    discoveredTools: source.discoveredTools.map((tool) =>
      sanitizeObjectForExport(tool),
    ),
    browser: {
      preview: source.browserData
        ? sanitizeObjectForExport(source.browserData)
        : null,
      session: createSafeBrowserSession(source.browserSession),
    },
    verification: {
      error: sanitizeForExport(source.error),
      analysis: sanitizeObjectForExport(source.analysis),
      evidence: createSafeEvidence(source.evidence),
    },
    collaboration: source.directedTest
      ? {
          request: sanitizeForExport(source.directedTest.request),
          input: sanitizeObjectForExport(source.directedTest.input),
          inputHash: source.directedTest.inputHash,
          assertions: source.directedTest.assertions.map(
            sanitizeDirectedAssertion,
          ),
          directedEvaluation: source.directedEvaluation
            ? sanitizeDirectedEvaluation(source.directedEvaluation)
            : null,
          parentProbeId: source.directedTest.parentProbeId,
          round: source.directedTest.round,
        }
      : undefined,
  };
};

export const serializeEvidenceReceiptJson = (receipt: EvidenceReceipt) =>
  `${JSON.stringify(receipt, null, 2)}\n`;

const slugify = (value: string) => {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return slug || "tool";
};

export const createEvidenceReceiptFilename = (
  receipt: EvidenceReceipt,
  format: EvidenceReceiptFormat,
) => {
  const timestamp = receipt.generatedAt.replace(/[:.]/g, "-");
  const toolName =
    typeof receipt.selectedTool.name === "string"
      ? receipt.selectedTool.name
      : receipt.inspection.selectedToolId;
  const extension = format === "json" ? "json" : "md";

  return `tooltruth-${slugify(toolName)}-${timestamp}.${extension}`;
};
