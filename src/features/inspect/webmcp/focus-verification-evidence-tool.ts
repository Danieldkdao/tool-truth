import {
  findToolOrThrow,
  readEvidenceTab,
  readRequiredToolId,
  toEvidenceView,
  waitForControllerSnapshot,
} from "@/features/inspect/webmcp/tool-helpers";
import type { GetInspectionSessionController } from "@/features/inspect/webmcp/types";

export const createFocusVerificationEvidenceTool = (
  getController: GetInspectionSessionController,
): WebMCP.ModelContextTool => ({
  name: "focus_verification_evidence",
  title: "Focus ToolTruth verification evidence",
  description:
    "Selects a discovered tool and optionally opens one evidence view in the same visible ToolTruth workbench the user is viewing. This only changes ToolTruth's interface selection; it does not run the inspected tool.",
  inputSchema: {
    type: "object",
    properties: {
      toolId: {
        type: "string",
        minLength: 1,
        maxLength: 500,
        description: "Exact tool ID from get_inspection_context.",
      },
      evidenceView: {
        type: "string",
        enum: [
          "timeline",
          "state_diff",
          "network",
          "logs",
          "statistics",
          "replay",
        ],
        description:
          "Optional evidence view to open. Omit it to keep the current view.",
      },
      probeId: {
        type: "string",
        minLength: 1,
        maxLength: 500,
        description:
          "Optional completed probe ID to reopen. Use a directedRounds probeId from get_inspection_context.",
      },
    },
    required: ["toolId"],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: false,
    untrustedContentHint: true,
  },
  execute: async (input, { signal }) => {
    const toolId = readRequiredToolId(input);
    const tab = readEvidenceTab(input);
    const probeId =
      typeof input.probeId === "string" ? input.probeId : undefined;
    const controller = getController();
    const tool = findToolOrThrow(controller.snapshot.tools, toolId);
    const focused = controller.focusEvidence({ toolId, probeId, tab });

    if (!focused) {
      throw new Error("The requested tool could not be focused.");
    }

    const snapshot = await waitForControllerSnapshot(
      getController,
      (candidate) =>
        candidate.selectedToolId === toolId &&
        (probeId === undefined ||
          candidate.selectedVerification?.probeId === probeId) &&
        (tab === undefined || candidate.activeEvidenceTab === tab),
      signal,
    );

    return {
      runId: snapshot.runId,
      selectedToolId: snapshot.selectedToolId,
      selectedToolName: tool.name,
      probeId: snapshot.selectedVerification?.probeId ?? null,
      evidenceView: toEvidenceView(snapshot.activeEvidenceTab),
    };
  },
});
