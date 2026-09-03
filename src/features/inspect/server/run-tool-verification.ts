import "server-only";

import { createHash } from "node:crypto";

import type {
  ConsoleMessage,
  LogLine,
  WebMCPTool,
  WebMCPToolResult,
} from "@browserbasehq/stagehand";

import type {
  DetectedTool,
  EvidenceLogEntry,
  ExecutionEvidenceData,
  NetworkEntry,
  StateChange,
  TimelineEntry,
} from "@/features/inspect/components/inspection-data";
import type { VerificationStreamEvent } from "@/features/inspect/components/inspection-stream";
import type {
  ObservedNetworkEntry,
  ObservedRuntimeError,
} from "@/features/inspect/server/browser-evidence-observer";
import {
  analyzeToolVerification,
  generateSafeToolInput,
} from "@/features/inspect/server/verification-analysis";
import type {
  InspectionBrowserSession,
  InspectionBrowserSessionContext,
} from "@/features/inspect/server/inspection-browser-session";
import { getInspectionBrowserLabel } from "@/features/inspect/server/stagehand-browser";
import { validateInspectionUrl } from "@/features/inspect/server/validate-inspection-url";

const NAVIGATION_TIMEOUT_MS = 20_000;
const TOOL_DISCOVERY_TIMEOUT_MS = 4_000;
const TOOL_INVOCATION_TIMEOUT_MS = 20_000;
const MAX_LOG_ENTRIES = 250;
const MAX_NETWORK_ENTRIES = 100;
const MAX_TEXT_LENGTH = 20_000;

const SNAPSHOT_EXPRESSION = `(() => {
  const readStorage = (storage) => {
    const result = {};
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key) result[key] = String(storage.getItem(key) ?? "").slice(0, 10000);
    }
    return result;
  };
  const inputs = Array.from(document.querySelectorAll("input, select, textarea")).slice(0, 100).map((element, index) => ({
    key: element.getAttribute("name") || element.getAttribute("id") || element.tagName.toLowerCase() + "-" + index,
    value: "value" in element ? String(element.value ?? "").slice(0, 1000) : "",
    checked: "checked" in element ? Boolean(element.checked) : undefined,
  }));
  return {
    url: location.href,
    title: document.title,
    bodyText: String(document.body?.innerText ?? "").slice(0, ${MAX_TEXT_LENGTH}),
    localStorage: readStorage(localStorage),
    sessionStorage: readStorage(sessionStorage),
    inputs,
    dom: {
      buttons: document.querySelectorAll("button").length,
      forms: document.querySelectorAll("form").length,
      links: document.querySelectorAll("a[href]").length,
      dialogs: document.querySelectorAll('[role="dialog"], dialog[open]').length,
      liveRegions: document.querySelectorAll('[aria-live], [role="alert"], [role="status"]').length,
    },
  };
})()`;

type BrowserSnapshotPayload = {
  url: string;
  title: string;
  bodyText: string;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  inputs: Array<{ key: string; value: string; checked?: boolean }>;
  dom: {
    buttons: number;
    forms: number;
    links: number;
    dialogs: number;
    liveRegions: number;
  };
};

type SafeValue = {
  bytes: number;
  hash: string;
};

type BrowserSnapshot = Omit<
  BrowserSnapshotPayload,
  "localStorage" | "sessionStorage" | "inputs"
> & {
  localStorage: Record<string, SafeValue>;
  sessionStorage: Record<string, SafeValue>;
  inputs: Record<string, SafeValue & { checked?: boolean }>;
  cookies: Record<string, SafeValue>;
  screenshot: SafeValue;
  network: ObservedNetworkEntry[];
  runtimeErrors: ObservedRuntimeError[];
};

type VerificationReporter = (event: VerificationStreamEvent) => void;

type RunToolVerificationOptions = {
  runId: string;
  probeId: string;
  targetUrl: string;
  selectedTool: DetectedTool;
  browserSession: InspectionBrowserSession;
  report: VerificationReporter;
};

const hashValue = (value: string | Buffer): SafeValue => {
  return {
    bytes: Buffer.byteLength(value),
    hash: createHash("sha256").update(value).digest("hex"),
  };
};

const protectRecord = (record: Record<string, string>) => {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, hashValue(value)]),
  );
};

const sanitizeText = (value: string, maxLength = 1_000) => {
  const redacted = value
    .replace(/(authorization|cookie|token|api[_-]?key|password|secret)(["'=:\s]+)([^\s,;"'}]+)/gi, "$1$2[REDACTED]")
    .replace(/bearer\s+[a-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]");

  return redacted.length > maxLength
    ? `${redacted.slice(0, maxLength - 1)}…`
    : redacted;
};

const safeUrlPath = (value: string) => {
  try {
    const url = new URL(value);
    const queryKeys = [...new Set(url.searchParams.keys())];
    const redactedQuery =
      queryKeys.length > 0
        ? `?${queryKeys.map((key) => `${key}=[redacted]`).join("&")}`
        : "";
    return `${url.origin}${url.pathname}${redactedQuery}`;
  } catch {
    return sanitizeText(value, 300);
  }
};

const formatElapsed = (startedAt: number, timestamp = Date.now()) => {
  const elapsed = Math.max(0, timestamp - startedAt);
  const minutes = Math.floor(elapsed / 60_000);
  const seconds = Math.floor((elapsed % 60_000) / 1_000);
  const milliseconds = elapsed % 1_000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
};

const stringifyCompact = (value: unknown, maxLength = 800) => {
  let serialized: string;
  try {
    serialized = JSON.stringify(value) ?? String(value);
  } catch {
    serialized = String(value);
  }
  return sanitizeText(serialized, maxLength);
};

const toDetectedTool = (tool: WebMCPTool): DetectedTool => {
  const annotations = tool.annotations ?? {};
  const result =
    annotations.untrustedContent === true ||
    annotations.untrustedContentHint === true
      ? "Returns untrusted content"
      : annotations.readOnly === true || annotations.readOnlyHint === true
        ? "Declared read-only"
        : "Available";

  return {
    id: `${tool.frameId}:${tool.name}`,
    name: tool.name,
    description: tool.description?.trim() || "No description provided",
    result,
    frameId: tool.frameId,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
  };
};

const addLog = (
  logs: EvidenceLogEntry[],
  startedAt: number,
  entry: Omit<EvidenceLogEntry, "time">,
) => {
  if (logs.length >= MAX_LOG_ENTRIES) {
    return;
  }

  logs.push({
    ...entry,
    time: formatElapsed(startedAt),
    message: sanitizeText(entry.message),
  });
};

const stagehandLogLevel = (
  level: LogLine["level"],
): EvidenceLogEntry["level"] => {
  if (level === 0) return "warning";
  if (level === 2) return "debug";
  return "info";
};

const snapshotMapChanges = (
  path: string,
  before: Record<string, SafeValue>,
  after: Record<string, SafeValue>,
) => {
  const changes: StateChange[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of keys) {
    const beforeValue = before[key];
    const afterValue = after[key];
    if (beforeValue?.hash === afterValue?.hash) {
      continue;
    }

    changes.push([
      `${path}.${key}`,
      beforeValue ? `${beforeValue.bytes} B · ${beforeValue.hash.slice(0, 8)}` : "Not present",
      afterValue ? `${afterValue.bytes} B · ${afterValue.hash.slice(0, 8)}` : "Removed",
    ]);
  }

  return changes;
};

const snapshotFormChanges = (
  before: BrowserSnapshot["inputs"],
  after: BrowserSnapshot["inputs"],
) => {
  const changes: StateChange[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of keys) {
    const beforeValue = before[key];
    const afterValue = after[key];
    if (
      beforeValue?.hash === afterValue?.hash &&
      beforeValue?.checked === afterValue?.checked
    ) {
      continue;
    }

    const describe = (value: (SafeValue & { checked?: boolean }) | undefined) => {
      if (!value) return "Not present";
      const checked =
        value.checked === undefined
          ? ""
          : value.checked
            ? " · checked"
            : " · not checked";
      return `${value.bytes} B · ${value.hash.slice(0, 8)}${checked}`;
    };

    changes.push([
      `form.${key}`,
      describe(beforeValue),
      afterValue ? describe(afterValue) : "Removed",
    ]);
  }

  return changes;
};

const compareSnapshots = (before: BrowserSnapshot, after: BrowserSnapshot) => {
  const changes: StateChange[] = [];

  if (before.url !== after.url) changes.push(["page.url", safeUrlPath(before.url), safeUrlPath(after.url)]);
  if (before.title !== after.title) changes.push(["page.title", sanitizeText(before.title, 120), sanitizeText(after.title, 120)]);
  if (hashValue(before.bodyText).hash !== hashValue(after.bodyText).hash) {
    changes.push([
      "page.visibleText",
      `${before.bodyText.length} chars · ${hashValue(before.bodyText).hash.slice(0, 8)}`,
      `${after.bodyText.length} chars · ${hashValue(after.bodyText).hash.slice(0, 8)}`,
    ]);
  }
  if (before.screenshot.hash !== after.screenshot.hash) {
    changes.push(["page.renderedPixels", before.screenshot.hash.slice(0, 8), after.screenshot.hash.slice(0, 8)]);
  }

  for (const key of Object.keys(before.dom) as Array<keyof BrowserSnapshot["dom"]>) {
    if (before.dom[key] !== after.dom[key]) {
      changes.push([`dom.${key}`, String(before.dom[key]), String(after.dom[key])]);
    }
  }

  changes.push(...snapshotMapChanges("localStorage", before.localStorage, after.localStorage));
  changes.push(...snapshotMapChanges("sessionStorage", before.sessionStorage, after.sessionStorage));
  changes.push(...snapshotMapChanges("cookies", before.cookies, after.cookies));
  changes.push(...snapshotFormChanges(before.inputs, after.inputs));

  return changes.slice(0, 100);
};

const isSuccessfulRequest = (entry: ObservedNetworkEntry) => {
  return entry.status >= 200 && entry.status < 400;
};

const isGraphQlReadRequest = (entry: ObservedNetworkEntry) => {
  if (!entry.postData) return false;

  try {
    const parsed = JSON.parse(entry.postData) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return false;
    }
    const query = (parsed as Record<string, unknown>).query;
    return (
      typeof query === "string" &&
      /^(?:\s*query\b|\s*\{)/i.test(query) &&
      !/^\s*mutation\b/i.test(query)
    );
  } catch {
    return false;
  }
};

const isObservedMutationRequest = (entry: ObservedNetworkEntry) => {
  if (!isSuccessfulRequest(entry)) return false;

  if (/^(PUT|PATCH|DELETE)$/i.test(entry.method)) return true;
  if (entry.method.toUpperCase() !== "POST" || isGraphQlReadRequest(entry)) {
    return false;
  }

  if (entry.status === 201 || entry.status === 202 || entry.status === 204) {
    return true;
  }

  const semanticEvidence = `${entry.url} ${entry.postData ?? ""}`;
  return /\b(add|book|cancel|charge|checkout|create|delete|modify|mutation|order|place|purchase|remove|reserve|save|send|submit|update|write)\b/i.test(
    semanticEvidence,
  );
};

const selectLiveTool = (
  tools: WebMCPTool[],
  selectedTool: DetectedTool,
) => {
  const exactMatch = tools.find(
    (tool) =>
      tool.name === selectedTool.name && tool.frameId === selectedTool.frameId,
  );
  if (exactMatch) return exactMatch;

  const sameNameMatches = tools.filter(
    (tool) => tool.name === selectedTool.name,
  );
  return sameNameMatches.length === 1 ? sameNameMatches[0] : undefined;
};

const retainNetworkEvidence = (entries: ObservedNetworkEntry[]) => {
  if (entries.length <= MAX_NETWORK_ENTRIES) return entries;

  const mutationCandidates = entries.filter(isObservedMutationRequest);
  const retained = new Set(
    mutationCandidates.slice(-MAX_NETWORK_ENTRIES),
  );

  for (const entry of entries) {
    if (retained.size >= MAX_NETWORK_ENTRIES) break;
    retained.add(entry);
  }

  return entries.filter((entry) => retained.has(entry));
};

const toNetworkEntries = (entries: ObservedNetworkEntry[]): NetworkEntry[] => {
  return retainNetworkEvidence(entries).map((entry) => ({
    method: entry.method,
    path: safeUrlPath(entry.url),
    status: entry.status === 0 ? "Failed" : String(entry.status),
    duration: `${Math.round(entry.durationMs)} ms`,
  }));
};

const captureSnapshot = async (
  stagehand: InspectionBrowserSessionContext["browser"],
  page: InspectionBrowserSessionContext["page"],
  evidenceObserver: InspectionBrowserSessionContext["evidenceObserver"],
) => {
  const [payload, cookies, screenshot] = await Promise.all([
    page.evaluate<BrowserSnapshotPayload>(SNAPSHOT_EXPRESSION),
    stagehand.context.cookies(page.url()),
    page.screenshot({
      animations: "disabled",
      caret: "hide",
      fullPage: false,
      timeout: 8_000,
      type: "png",
    }),
  ]);

  const observedEvidence = evidenceObserver.snapshot();

  return {
    ...payload,
    bodyText: sanitizeText(payload.bodyText, MAX_TEXT_LENGTH),
    localStorage: protectRecord(payload.localStorage),
    sessionStorage: protectRecord(payload.sessionStorage),
    inputs: Object.fromEntries(
      payload.inputs.map((input) => [
        input.key,
        { ...hashValue(input.value), checked: input.checked },
      ]),
    ),
    cookies: Object.fromEntries(
      cookies.map((cookie) => [
        `${cookie.domain}${cookie.path}:${cookie.name}`,
        hashValue(cookie.value),
      ]),
    ),
    screenshot: hashValue(screenshot),
    network: observedEvidence.network,
    runtimeErrors: observedEvidence.runtimeErrors,
  } satisfies BrowserSnapshot;
};

export const runToolVerification = async ({
  runId,
  probeId,
  targetUrl,
  selectedTool,
  browserSession,
  report,
}: RunToolVerificationOptions) => {
  const startedAt = Date.now();
  const logs: EvidenceLogEntry[] = [];
  const timeline: TimelineEntry[] = [];
  const recordTimeline = (event: string, detail: string) => {
    timeline.push([formatElapsed(startedAt), event, sanitizeText(detail, 800)]);
  };
  const recordAiActivity = (message: string) => {
    addLog(logs, startedAt, {
      source: "ai",
      level: message.includes("failed") ? "warning" : "info",
      message,
    });
  };

  report({
    kind: "section.progress",
    section: "evidence",
    progress: { value: 10, message: "Resuming the discovery browser session" },
  });

  return browserSession.runExclusive(async ({
    browser: stagehand,
    page,
    evidenceObserver,
  }) => {
    const unsubscribeFromLogs = browserSession.subscribeToLogs((line) => {
      addLog(logs, startedAt, {
        source: "stagehand",
        level: stagehandLogLevel(line.level),
        message: [line.category, line.message].filter(Boolean).join(": "),
      });
    });
    let consoleListener: ((message: ConsoleMessage) => void) | undefined;

    try {
      await validateInspectionUrl(targetUrl);
      recordTimeline("Browser session reused", getInspectionBrowserLabel());

      consoleListener = (message) => {
        const type = message.type();
        addLog(logs, startedAt, {
          source: "browser",
          level:
            type === "error" || type === "assert"
              ? "error"
              : type === "warning"
                ? "warning"
                : type === "debug"
                  ? "debug"
                  : "info",
          message: message.text(),
        });
      };
      page.on("console", consoleListener);

      report({
        kind: "section.progress",
        section: "evidence",
        progress: { value: 24, message: "Preparing the retained page" },
      });

      let liveTools = await page.listWebMCPTools({
        timeoutMs: TOOL_DISCOVERY_TIMEOUT_MS,
      });
      let liveTool = selectLiveTool(liveTools, selectedTool);

      if (!liveTool) {
        await page.goto(targetUrl, {
          waitUntil: "load",
          timeoutMs: NAVIGATION_TIMEOUT_MS,
        });
        await validateInspectionUrl(page.url());
        await evidenceObserver.refresh();
        liveTools = await page.listWebMCPTools({
          timeoutMs: TOOL_DISCOVERY_TIMEOUT_MS,
        });
        liveTool = selectLiveTool(liveTools, selectedTool);
      }

      if (!liveTool) {
        throw new Error(
          `The selected tool, ${selectedTool.name}, is no longer registered in this inspection session.`,
        );
      }

      await validateInspectionUrl(page.url());
      recordTimeline("Target ready", safeUrlPath(page.url()));

      const tool = toDetectedTool(liveTool);
      const toolInput = await generateSafeToolInput(tool, recordAiActivity);
      recordTimeline("Tool input prepared", stringifyCompact(toolInput));

      report({
        kind: "section.progress",
        section: "evidence",
        progress: { value: 42, message: "Capturing the baseline state" },
      });
      const before = await captureSnapshot(stagehand, page, evidenceObserver);
      evidenceObserver.reset();
      recordTimeline(
        "Baseline captured",
        `${before.bodyText.length} visible characters · ${Object.keys(before.localStorage).length} local storage keys`,
      );

      report({
        kind: "section.progress",
        section: "evidence",
        progress: { value: 58, message: `Invoking ${tool.name}` },
      });
      const invocationStartedAt = Date.now();
      const invocation = await page.invokeWebMCPTool(tool.name, toolInput, {
        frameId: liveTool.frameId,
        timeoutMs: TOOL_INVOCATION_TIMEOUT_MS,
      });
      recordTimeline(
        "Tool invoked",
        `${tool.name}(${stringifyCompact(toolInput, 300)})`,
      );

      let result: WebMCPToolResult;
      try {
        result = await invocation.result;
      } catch (error) {
        result = {
          invocationId: invocation.invocationId,
          status: "Error",
          errorText: error instanceof Error ? error.message : String(error),
        };
      }
      recordTimeline(
        "Tool completed",
        `${result.status} in ${Date.now() - invocationStartedAt} ms · ${stringifyCompact(result.output ?? result.errorText, 500)}`,
      );

      await page.waitForTimeout(350);
      await evidenceObserver.refresh();
      const after = await captureSnapshot(stagehand, page, evidenceObserver);
      const stateChanges = compareSnapshots(before, after);
      const network = toNetworkEntries(after.network);
      const observedMutations = after.network.filter(isObservedMutationRequest);

      for (const runtimeError of after.runtimeErrors) {
        addLog(logs, startedAt, {
          source: "runtime",
          level: "error",
          message: `${runtimeError.type}: ${runtimeError.message}${runtimeError.source ? ` (${runtimeError.source})` : ""}`,
        });
      }
      for (const entry of network.slice(0, 20)) {
        recordTimeline(
          observedMutations.some(
            (candidate) =>
              candidate.method === entry.method &&
              safeUrlPath(candidate.url) === entry.path &&
              String(candidate.status) === entry.status,
          )
            ? "Network mutation"
            : "Network request",
          `${entry.method} ${entry.path} · ${entry.status}`,
        );
      }
      recordTimeline(
        "State comparison",
        stateChanges.length === 0
          ? "No observable state differences"
          : `${stateChanges.length} observable changes`,
      );

      const evidence: ExecutionEvidenceData = {
        runLabel: `Probe ${probeId.slice(0, 12)} · ${tool.name}`,
        timeline,
        stateChanges,
        network,
        logs,
      };

      report({ kind: "evidence.ready", toolId: selectedTool.id, data: evidence });
      report({
        kind: "section.progress",
        section: "analysis",
        progress: {
          value: 68,
          message: "Comparing the contract with observed behavior",
        },
      });

      const mutatingRequests = observedMutations.map(
        (entry) =>
          `${entry.method} ${safeUrlPath(entry.url)} · ${entry.status}`,
      );
      const analysis = await analyzeToolVerification(
        {
          tool,
          toolInput,
          toolOutput: result.output,
          invocationStatus: result.status,
          invocationError:
            result.errorText ??
            (result.exception ? stringifyCompact(result.exception) : undefined),
          stateChanges,
          mutatingRequests,
          consoleErrors: logs
            .filter((entry) => entry.level === "error")
            .map((entry) => entry.message),
          sandboxLabel: getInspectionBrowserLabel(),
        },
        recordAiActivity,
      );

      evidence.logs = [...logs];
      report({ kind: "evidence.ready", toolId: selectedTool.id, data: evidence });
      report({ kind: "analysis.ready", toolId: selectedTool.id, data: analysis });
      report({ kind: "probe.completed", toolId: selectedTool.id });

      console.info("ToolTruth verification completed", {
        runId,
        probeId,
        tool: tool.name,
        verdict: analysis.verdict,
        durationMs: Date.now() - startedAt,
        stateChangeCount: stateChanges.length,
        requestCount: after.network.length,
        logCount: logs.length,
      });
    } finally {
      if (page && consoleListener) page.off("console", consoleListener);
      unsubscribeFromLogs();
    }
  });
};
