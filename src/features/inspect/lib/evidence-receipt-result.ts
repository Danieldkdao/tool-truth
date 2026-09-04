import {
  createEvidenceReceipt,
  createEvidenceReceiptFilename,
  type EvidenceReceiptFormat,
  type EvidenceReceiptSource,
} from "./evidence-receipt.ts";
import { serializeEvidenceReceiptMarkdown } from "./evidence-receipt-markdown.ts";

export const createEvidenceReceiptResult = (
  source: EvidenceReceiptSource,
  format: EvidenceReceiptFormat,
) => {
  const receipt = createEvidenceReceipt(source);

  return {
    runId: source.runId,
    probeId: source.probeId,
    toolId: source.selectedTool.id,
    toolName: source.selectedTool.name,
    format,
    mediaType: format === "json" ? "application/json" : "text/markdown",
    filename: createEvidenceReceiptFilename(receipt, format),
    content:
      format === "json" ? receipt : serializeEvidenceReceiptMarkdown(receipt),
  };
};
