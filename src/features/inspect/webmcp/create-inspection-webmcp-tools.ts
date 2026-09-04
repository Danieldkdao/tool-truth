import { createFocusVerificationEvidenceTool } from "@/features/inspect/webmcp/focus-verification-evidence-tool";
import { createGetEvidenceReceiptTool } from "@/features/inspect/webmcp/get-evidence-receipt-tool";
import { createGetInspectionContextTool } from "@/features/inspect/webmcp/get-inspection-context-tool";
import { createRunAllVerificationsTool } from "@/features/inspect/webmcp/run-all-verifications-tool";
import { createRunDirectedVerificationTool } from "@/features/inspect/webmcp/run-directed-verification-tool";
import { createRunVerificationTool } from "@/features/inspect/webmcp/run-verification-tool";
import type { GetInspectionSessionController } from "@/features/inspect/webmcp/types";

export const createInspectionWebMCPTools = (
  getController: GetInspectionSessionController,
): WebMCP.ModelContextTool[] => [
  createGetInspectionContextTool(getController),
  createGetEvidenceReceiptTool(getController),
  createRunVerificationTool(getController),
  createRunDirectedVerificationTool(getController),
  createRunAllVerificationsTool(getController),
  createFocusVerificationEvidenceTool(getController),
];
