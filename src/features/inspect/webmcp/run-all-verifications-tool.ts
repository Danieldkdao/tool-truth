import {
  isVerificationTerminal,
  throwIfAborted,
  waitForControllerSnapshot,
} from "@/features/inspect/webmcp/tool-helpers";
import { createBatchVerificationResult } from "@/features/inspect/webmcp/results";
import type { GetInspectionSessionController } from "@/features/inspect/webmcp/types";

export const createRunAllVerificationsTool = (
  getController: GetInspectionSessionController,
): WebMCP.ModelContextTool => ({
  name: "run_all_verifications",
  title: "Run all ToolTruth verifications",
  description:
    "Sequentially verifies every discovered WebMCP tool in the inspection's retained isolated browser session. This updates the same visible ToolTruth workbench the user is viewing and returns a result summary for each tool.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: false,
    untrustedContentHint: true,
  },
  execute: async (_input, { signal }) => {
    throwIfAborted(signal);
    const controller = getController();
    const toolIds = controller.snapshot.tools?.map((tool) => tool.id) ?? [];
    const previousAttempts = Object.fromEntries(
      toolIds.map((toolId) => [
        toolId,
        controller.snapshot.verificationRecords[toolId]?.attempt ?? 0,
      ]),
    );

    if (toolIds.length === 0) {
      throw new Error("This inspection has no discovered tools to verify.");
    }

    if (controller.snapshot.isBusy) {
      throw new Error(
        "Another verification is already running in this inspection session.",
      );
    }

    const started = await controller.runAllVerifications(signal);

    if (!started) {
      throw new Error("The batch verification could not be started.");
    }

    const snapshot = await waitForControllerSnapshot(
      getController,
      (candidate) =>
        !candidate.isBusy &&
        toolIds.every((toolId) =>
          isVerificationTerminal(
            candidate,
            toolId,
            previousAttempts[toolId] ?? 0,
          ),
        ),
      signal,
    );

    return createBatchVerificationResult(snapshot);
  },
});
