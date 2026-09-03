import { createFocusVerificationEvidenceTool } from "@/features/inspect/webmcp/focus-verification-evidence-tool";
import { createGetInspectionContextTool } from "@/features/inspect/webmcp/get-inspection-context-tool";
import { createRunAllVerificationsTool } from "@/features/inspect/webmcp/run-all-verifications-tool";
import { createRunVerificationTool } from "@/features/inspect/webmcp/run-verification-tool";
import type { GetInspectionSessionController } from "@/features/inspect/webmcp/types";

export const createInspectionWebMCPTools = (
  getController: GetInspectionSessionController,
): WebMCP.ModelContextTool[] => [
  createGetInspectionContextTool(getController),
  createRunVerificationTool(getController),
  createRunAllVerificationsTool(getController),
  createFocusVerificationEvidenceTool(getController),
];
