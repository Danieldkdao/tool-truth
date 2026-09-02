import "server-only";

import type { WebMCPTool } from "@browserbasehq/stagehand";

import type { DetectedTool } from "@/features/inspect/components/inspection-data";
import type { SectionProgress } from "@/features/inspect/components/inspection-stream";
import type { InspectionBrowserSession } from "@/features/inspect/server/inspection-browser-session";
import { getInspectionBrowserLabel } from "@/features/inspect/server/stagehand-browser";
import { validateInspectionUrl } from "@/features/inspect/server/validate-inspection-url";

const NAVIGATION_TIMEOUT_MS = 20_000;
const TOOL_SNAPSHOT_TIMEOUT_MS = 3_000;

type DiscoveryProgressReporter = (progress: SectionProgress) => void;

const getToolStatus = (annotations?: Record<string, unknown>) => {
  if (
    annotations?.untrustedContent === true ||
    annotations?.untrustedContentHint === true
  ) {
    return "Returns untrusted content";
  }

  if (annotations?.readOnly === true || annotations?.readOnlyHint === true) {
    return "Declared read-only";
  }

  return "Available";
};

const toDetectedTool = (tool: WebMCPTool): DetectedTool => {
  return {
    id: `${tool.frameId}:${tool.name}`,
    name: tool.name,
    description: tool.description?.trim() || "No description provided",
    result: getToolStatus(tool.annotations),
    frameId: tool.frameId,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
  };
};

export const discoverWebMcpTools = async (
  targetUrl: string,
  reportProgress: DiscoveryProgressReporter,
  browserSession: InspectionBrowserSession,
) => {
  reportProgress({
    value: 24,
    message: `Starting ${getInspectionBrowserLabel().toLowerCase()}`,
  });

  await validateInspectionUrl(targetUrl);

  return browserSession.runExclusive(async ({ page }) => {
    reportProgress({
      value: 52,
      message: "Loading the submitted website",
    });

    await page.goto(targetUrl, {
      waitUntil: "load",
      timeoutMs: NAVIGATION_TIMEOUT_MS,
    });

    await validateInspectionUrl(page.url());

    reportProgress({
      value: 78,
      message: "Reading registered WebMCP tool contracts",
    });

    let tools = await page.listWebMCPTools({
      timeoutMs: TOOL_SNAPSHOT_TIMEOUT_MS,
    });

    if (tools.length === 0) {
      await page.waitForTimeout(750);
      tools = await page.listWebMCPTools({
        timeoutMs: TOOL_SNAPSHOT_TIMEOUT_MS,
      });
    }

    reportProgress({
      value: 94,
      message: `Validating ${tools.length} discovered ${tools.length === 1 ? "tool" : "tools"}`,
    });

    return tools.map(toDetectedTool);
  });
};
