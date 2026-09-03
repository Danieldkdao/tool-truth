import {
  findToolOrThrow,
  isVerificationTerminal,
  readRequiredToolId,
  throwIfAborted,
  waitForControllerSnapshot,
} from "@/features/inspect/webmcp/tool-helpers";
import { createVerificationResult } from "@/features/inspect/webmcp/results";
import type { GetInspectionSessionController } from "@/features/inspect/webmcp/types";

export const createRunVerificationTool = (
  getController: GetInspectionSessionController,
): WebMCP.ModelContextTool => ({
  name: "run_verification",
  title: "Run one ToolTruth verification",
  description:
    "Runs a behavioral verification for one discovered WebMCP tool in the inspection's retained isolated browser session. This updates the same visible ToolTruth workbench the user is viewing and returns observed evidence and analysis.",
  inputSchema: {
    type: "object",
    properties: {
      toolId: {
        type: "string",
        minLength: 1,
        maxLength: 500,
        description:
          "Exact tool ID from get_inspection_context. Do not substitute the display name.",
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
    throwIfAborted(signal);
    const toolId = readRequiredToolId(input);
    const controller = getController();
    findToolOrThrow(controller.snapshot.tools, toolId);
    const previousAttempt =
      controller.snapshot.verificationRecords[toolId]?.attempt ?? 0;

    if (controller.snapshot.isBusy) {
      throw new Error(
        "Another verification is already running in this inspection session.",
      );
    }

    const started = await controller.startVerification(toolId, signal);

    if (!started) {
      throw new Error("The verification could not be started.");
    }

    const snapshot = await waitForControllerSnapshot(
      getController,
      (candidate) =>
        !candidate.isBusy &&
        isVerificationTerminal(candidate, toolId, previousAttempt),
      signal,
    );

    return createVerificationResult(snapshot, toolId);
  },
});
