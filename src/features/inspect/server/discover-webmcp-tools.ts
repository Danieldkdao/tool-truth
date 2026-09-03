import "server-only";

import type { WebMCPTool } from "@browserbasehq/stagehand";

import type { DetectedTool } from "@/features/inspect/components/inspection-data";
import type { SectionProgress } from "@/features/inspect/components/inspection-stream";
import type {
  InspectionBrowserSession,
  InspectionBrowserSessionContext,
} from "@/features/inspect/server/inspection-browser-session";
import { getInspectionBrowserLabel } from "@/features/inspect/server/stagehand-browser";
import { validateInspectionUrl } from "@/features/inspect/server/validate-inspection-url";

const NAVIGATION_TIMEOUT_MS = 20_000;
const TOOL_SNAPSHOT_TIMEOUT_MS = 3_000;
const TOOL_REGISTRATION_SETTLE_TIMEOUT_MS = 2_000;
const TOOL_REGISTRATION_POLL_INTERVAL_MS = 250;
const REQUIRED_STABLE_TOOL_SNAPSHOTS = 2;

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

const getToolSetSignature = (tools: WebMCPTool[]) =>
  tools
    .map((tool) => `${tool.frameId}:${tool.name}`)
    .sort()
    .join("\n");

export const readStableWebMcpTools = async (
  page: InspectionBrowserSessionContext["page"],
) => {
  let tools = await page.listWebMCPTools({
    timeoutMs: TOOL_SNAPSHOT_TIMEOUT_MS,
  });
  let signature = getToolSetSignature(tools);
  let stableSnapshots = 0;
  const deadline = Date.now() + TOOL_REGISTRATION_SETTLE_TIMEOUT_MS;

  while (
    Date.now() < deadline &&
    stableSnapshots < REQUIRED_STABLE_TOOL_SNAPSHOTS
  ) {
    await page.waitForTimeout(TOOL_REGISTRATION_POLL_INTERVAL_MS);
    const latestTools = await page.listWebMCPTools({
      timeoutMs: TOOL_SNAPSHOT_TIMEOUT_MS,
    });
    const latestSignature = getToolSetSignature(latestTools);

    stableSnapshots = latestSignature === signature ? stableSnapshots + 1 : 0;
    tools = latestTools;
    signature = latestSignature;
  }

  return tools;
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

  return browserSession.runExclusive(async ({ page, evidenceObserver }) => {
    reportProgress({
      value: 52,
      message: "Loading the submitted website",
    });

    await page.goto(targetUrl, {
      waitUntil: "load",
      timeoutMs: NAVIGATION_TIMEOUT_MS,
    });

    await validateInspectionUrl(page.url());
    await evidenceObserver.refresh();

    reportProgress({
      value: 78,
      message: "Reading registered WebMCP tool contracts",
    });

    const tools = await readStableWebMcpTools(page);

    reportProgress({
      value: 94,
      message: `Validating ${tools.length} discovered ${tools.length === 1 ? "tool" : "tools"}`,
    });

    return tools.map(toDetectedTool);
  });
};
