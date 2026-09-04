import type { EvidenceReceiptFormat } from "@/features/inspect/lib/evidence-receipt";
import { createEvidenceReceiptResult } from "@/features/inspect/lib/evidence-receipt-result";
import { createEvidenceReceiptSourceFromSnapshot } from "@/features/inspect/lib/evidence-receipt-source";
import type { GetInspectionSessionController } from "@/features/inspect/webmcp/types";

const readFormat = (input: Record<string, unknown>): EvidenceReceiptFormat => {
  if (input.format === "json" || input.format === "markdown") {
    return input.format;
  }

  throw new Error('format must be either "json" or "markdown".');
};

const readOptionalId = (
  input: Record<string, unknown>,
  key: "toolId" | "probeId",
) => {
  const value = input[key];
  if (value === undefined) return undefined;

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} must be a non-empty string when provided.`);
  }
  if (value.length > 500) {
    throw new Error(`${key} must be 500 characters or fewer.`);
  }

  return value;
};

export const createGetEvidenceReceiptTool = (
  getController: GetInspectionSessionController,
): WebMCP.ModelContextTool => ({
  name: "get_evidence_receipt",
  title: "Get a ToolTruth evidence receipt",
  description:
    "Returns the complete redacted evidence receipt for a completed verification as structured JSON or Markdown. By default it uses the active verification; provide a tool ID or probe ID from get_inspection_context to retrieve a specific completed round without rerunning it.",
  inputSchema: {
    type: "object",
    properties: {
      format: {
        type: "string",
        enum: ["json", "markdown"],
        description:
          "Choose json for structured analysis or markdown for a human-readable report.",
      },
      toolId: {
        type: "string",
        minLength: 1,
        maxLength: 500,
        description:
          "Optional exact tool ID from get_inspection_context. Omit it to use the active tool.",
      },
      probeId: {
        type: "string",
        minLength: 1,
        maxLength: 500,
        description:
          "Optional completed probe ID from get_inspection_context. Use this to retrieve an older directed round.",
      },
    },
    required: ["format"],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    untrustedContentHint: true,
  },
  execute: (input) => {
    const format = readFormat(input);
    const toolId = readOptionalId(input, "toolId");
    const probeId = readOptionalId(input, "probeId");
    const source = createEvidenceReceiptSourceFromSnapshot(
      getController().snapshot,
      { toolId, probeId },
    );

    if (!source) {
      throw new Error(
        "A complete verification receipt is unavailable for that selection. Run the verification first, or use a completed toolId or probeId from get_inspection_context.",
      );
    }

    return createEvidenceReceiptResult(source, format);
  },
});
