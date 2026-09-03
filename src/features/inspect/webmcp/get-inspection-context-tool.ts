import { createInspectionContextResult } from "@/features/inspect/webmcp/results";
import type { GetInspectionSessionController } from "@/features/inspect/webmcp/types";

export const createGetInspectionContextTool = (
  getController: GetInspectionSessionController,
): WebMCP.ModelContextTool => ({
  name: "get_inspection_context",
  title: "Get ToolTruth inspection context",
  description:
    "Reads the current ToolTruth workbench session, including discovered tools, selection, progress, and verification summaries. Use this before taking action so tool IDs come from the live page.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    untrustedContentHint: true,
  },
  execute: () => createInspectionContextResult(getController().snapshot),
});
