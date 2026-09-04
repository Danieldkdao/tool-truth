import "server-only";

import { createHash } from "node:crypto";

import type {
  ConsoleMessage,
  LogLine,
  WebMCPTool,
  WebMCPToolInvocation,
  WebMCPToolResult,
} from "@browserbasehq/stagehand";

import type {
  BrowserbaseSessionStatistics,
  ContractAnalysisData,
  DetectedTool,
  EvidenceScreenshot,
  EvidenceLogEntry,
  ExecutionEvidenceData,
  NetworkEntry,
  StateChange,
  TimelineEntry,
  VerificationStatistics,
} from "@/features/inspect/components/inspection-data";
import type { VerificationStreamEvent } from "@/features/inspect/components/inspection-stream";
import { evaluateDirectedTest } from "@/features/inspect/lib/directed-verification";
import {
  directedInputRequestsIdempotency,
  resolveVerificationToolInput,
  type VerificationInputSource,
} from "@/features/inspect/lib/verification-input-source";
import {
  evaluateAgentMartRegression,
  getAgentMartRegressionInput,
} from "@/features/inspect/regression/agentmart-regression";
import {
  toolPromisesIdempotency,
  type DeterministicNetworkRequest,
  type RepeatedInvocationEvidence,
} from "@/features/inspect/server/deterministic-hard-rules";
import type {
  ObservedNetworkEntry,
  ObservedRuntimeError,
} from "@/features/inspect/server/browser-evidence-observer";
import {
  analyzeToolVerification,
  generateSafeToolInput,
} from "@/features/inspect/server/verification-analysis";
import type { SemanticBrowserSnapshot } from "@/features/inspect/server/semantic-evaluation";
import type {
  InspectionBrowserSession,
  InspectionBrowserSessionContext,
} from "@/features/inspect/server/inspection-browser-session";
import {
  readStableWebMcpTools,
  toDetectedTool,
} from "@/features/inspect/server/discover-webmcp-tools";
import { getInspectionBrowserLabel } from "@/features/inspect/server/stagehand-browser";
import {
  parseInspectionUrl,
  UnsafeInspectionUrlError,
  validateInspectionHostname,
  validateInspectionUrl,
} from "@/features/inspect/server/validate-inspection-url";

const NAVIGATION_TIMEOUT_MS = 20_000;
const TOOL_INVOCATION_TIMEOUT_MS = 20_000;
const MAX_LOG_ENTRIES = 250;
const MAX_NETWORK_ENTRIES = 100;
const MAX_TEXT_LENGTH = 20_000;
const MAX_DESTINATION_HOSTNAME_CHECKS = 32;
const DESTINATION_CHECK_CONCURRENCY = 8;

const SNAPSHOT_EXPRESSION = `(() => {
  const compactText = (element, maxLength = 240) => String(
    element.getAttribute?.("aria-label") || element.textContent || ""
  ).replace(/\\s+/g, " ").trim().slice(0, maxLength);
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
  const toolBindings = Array.from(document.querySelectorAll("form[toolname]")).slice(0, 30).map((form) => ({
    name: String(form.getAttribute("toolname") || "").slice(0, 500),
    description: String(form.getAttribute("tooldescription") || "").slice(0, 1000),
    action: String(form.action || location.href).slice(0, 2000),
    method: String(form.getAttribute("method") || "get").toUpperCase().slice(0, 20),
    autosubmit: form.hasAttribute("toolautosubmit"),
    controls: Array.from(form.elements).slice(0, 20).map((element, index) => ({
      name: String(element.getAttribute?.("name") || element.getAttribute?.("id") || element.tagName?.toLowerCase() + "-" + index).slice(0, 200),
      type: String(element.getAttribute?.("type") || element.tagName?.toLowerCase() || "control").slice(0, 80),
      description: String(element.getAttribute?.("toolparamdescription") || element.getAttribute?.("aria-label") || "").slice(0, 500),
      label: compactText(element),
      required: Boolean(element.required),
    })),
  }));
  const pageSemantics = {
    headings: Array.from(document.querySelectorAll("h1, h2, h3, [role='heading']")).slice(0, 20).map((element) => compactText(element)).filter(Boolean),
    actions: Array.from(document.querySelectorAll("button, a[href], [role='button']")).slice(0, 30).map((element) => compactText(element)).filter(Boolean),
    liveMessages: Array.from(document.querySelectorAll("[aria-live], [role='alert'], [role='status']")).slice(0, 20).map((element) => compactText(element)).filter(Boolean),
  };
  return {
    url: location.href,
    title: document.title,
    bodyText: String(document.body?.innerText ?? "").slice(0, ${MAX_TEXT_LENGTH}),
    localStorage: readStorage(localStorage),
    sessionStorage: readStorage(sessionStorage),
    inputs,
    toolBindings,
    pageSemantics,
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
  toolBindings: Array<{
    name: string;
    description: string;
    action: string;
    method: string;
    autosubmit: boolean;
    controls: Array<{
      name: string;
      type: string;
      description: string;
      label: string;
      required: boolean;
    }>;
  }>;
  pageSemantics: {
    headings: string[];
    actions: string[];
    liveMessages: string[];
  };
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
  screenshot: SafeValue & {
    body: Uint8Array;
    contentType: "image/jpeg";
  };
  network: ObservedNetworkEntry[];
  runtimeErrors: ObservedRuntimeError[];
  networkLimitReached: boolean;
  runtimeErrorLimitReached: boolean;
};

type VerificationReporter = (event: VerificationStreamEvent) => void;

type RunToolVerificationOptions = {
  runId: string;
  probeId: string;
  targetUrl: string;
  selectedTool: DetectedTool;
  inputSource?: VerificationInputSource;
  browserSession: InspectionBrowserSession;
  releaseBrowser: () => Promise<void>;
  signal: AbortSignal;
  report: VerificationReporter;
  retainScreenshot: (screenshot: {
    label: string;
    body: Uint8Array;
    contentType: "image/jpeg";
    hash: string;
  }) => EvidenceScreenshot | undefined;
};

const createAbortError = () => {
  return new DOMException("The verification was cancelled.", "AbortError");
};

const throwIfAborted = (signal: AbortSignal) => {
  if (signal.aborted) throw createAbortError();
};

const waitForInvocationResult = (
  invocation: WebMCPToolInvocation,
  signal: AbortSignal,
) => {
  if (signal.aborted) {
    void invocation.cancel().catch(() => undefined);
    return Promise.reject(createAbortError());
  }

  return new Promise<WebMCPToolResult>((resolve, reject) => {
    let handleAbort: () => void = () => undefined;
    const cleanup = () => signal.removeEventListener("abort", handleAbort);
    handleAbort = () => {
      cleanup();
      void invocation.cancel().catch(() => undefined);
      reject(createAbortError());
    };

    signal.addEventListener("abort", handleAbort, { once: true });
    invocation.result.then(
      (result) => {
        cleanup();
        resolve(result);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
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

const toDeterministicNetworkRequests = (
  entries: ObservedNetworkEntry[],
): DeterministicNetworkRequest[] =>
  entries.map((entry) => ({
    type: entry.type,
    method: entry.method,
    path: safeUrlPath(entry.url),
    status: entry.status,
    error: entry.error ? sanitizeText(entry.error, 300) : null,
  }));

const findForbiddenDestinationRequests = async (
  entries: ObservedNetworkEntry[],
) => {
  const candidates = entries.filter(
    (entry) => entry.status === 0 || entry.status === 403,
  );
  const blockedEntries = new Set<ObservedNetworkEntry>();
  const entriesByHostname = new Map<string, ObservedNetworkEntry[]>();

  for (const entry of candidates) {
    try {
      const { hostname } = parseInspectionUrl(entry.url);
      const hostnameEntries = entriesByHostname.get(hostname) ?? [];
      hostnameEntries.push(entry);
      entriesByHostname.set(hostname, hostnameEntries);
    } catch (error) {
      if (error instanceof UnsafeInspectionUrlError) blockedEntries.add(entry);
    }
  }

  const hostnames = [...entriesByHostname.keys()];
  const checkedHostnames = hostnames.slice(0, MAX_DESTINATION_HOSTNAME_CHECKS);
  for (
    let index = 0;
    index < checkedHostnames.length;
    index += DESTINATION_CHECK_CONCURRENCY
  ) {
    const batch = checkedHostnames.slice(
      index,
      index + DESTINATION_CHECK_CONCURRENCY,
    );
    const results = await Promise.all(
      batch.map(async (hostname) => {
        try {
          await validateInspectionHostname(hostname);
          return { hostname, blocked: false };
        } catch (error) {
          return {
            hostname,
            blocked: error instanceof UnsafeInspectionUrlError,
          };
        }
      }),
    );

    for (const { hostname, blocked } of results) {
      if (!blocked) continue;
      for (const entry of entriesByHostname.get(hostname) ?? []) {
        blockedEntries.add(entry);
      }
    }
  }

  return {
    requests: candidates
      .filter((entry) => blockedEntries.has(entry))
      .map((entry) => `${entry.method} ${safeUrlPath(entry.url)} · blocked`),
    complete: hostnames.length <= MAX_DESTINATION_HOSTNAME_CHECKS,
  };
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
      quality: 55,
      timeout: 8_000,
      type: "jpeg",
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
    screenshot: {
      ...hashValue(screenshot),
      body: Uint8Array.from(screenshot),
      contentType: "image/jpeg",
    },
    network: observedEvidence.network,
    runtimeErrors: observedEvidence.runtimeErrors,
    networkLimitReached: observedEvidence.networkLimitReached,
    runtimeErrorLimitReached: observedEvidence.runtimeErrorLimitReached,
  } satisfies BrowserSnapshot;
};

const toSemanticBrowserSnapshot = (
  snapshot: BrowserSnapshot,
  selectedToolName: string,
): SemanticBrowserSnapshot => {
  const toolBinding = snapshot.toolBindings.find(
    (binding) => binding.name === selectedToolName,
  );
  const sanitizeList = (values: string[], maxItems: number) =>
    values
      .slice(0, maxItems)
      .map((value) => sanitizeText(value, 240))
      .filter(Boolean);

  return {
    url: safeUrlPath(snapshot.url),
    title: sanitizeText(snapshot.title, 200),
    visibleText: snapshot.bodyText,
    dom: snapshot.dom,
    pageSemantics: {
      headings: sanitizeList(snapshot.pageSemantics.headings, 20),
      actions: sanitizeList(snapshot.pageSemantics.actions, 30),
      liveMessages: sanitizeList(snapshot.pageSemantics.liveMessages, 20),
    },
    toolBinding: toolBinding
      ? {
          name: sanitizeText(toolBinding.name, 500),
          description: sanitizeText(toolBinding.description, 1_000),
          action: safeUrlPath(toolBinding.action),
          method: sanitizeText(toolBinding.method, 20),
          autosubmit: toolBinding.autosubmit,
          controls: toolBinding.controls.slice(0, 20).map((control) => ({
            name: sanitizeText(control.name, 200),
            type: sanitizeText(control.type, 80),
            description: sanitizeText(control.description, 500),
            label: sanitizeText(control.label, 240),
            required: control.required,
          })),
        }
      : null,
    localStorage: snapshot.localStorage,
    sessionStorage: snapshot.sessionStorage,
    cookies: snapshot.cookies,
    inputs: snapshot.inputs,
    screenshot: {
      bytes: snapshot.screenshot.bytes,
      hash: snapshot.screenshot.hash,
    },
  };
};

const toBrowserbaseStatistics = (
  lifecycle: ReturnType<InspectionBrowserSession["getStatistics"]>["browserbaseLifecycle"],
): BrowserbaseSessionStatistics | null => {
  if (!lifecycle?.sessionId) return null;

  const durationMs =
    lifecycle.durationMs ??
    Math.max(
      0,
      (lifecycle.endedAt ?? Date.now()) -
        (lifecycle.startedAt ?? lifecycle.createdAt),
    );

  return {
    sessionId: lifecycle.sessionId,
    durationMs,
    region: lifecycle.region,
    status: lifecycle.status,
    providerStatus: lifecycle.providerStatus,
    terminationReason: lifecycle.terminationReason,
    proxyBytes: lifecycle.proxyBytes,
    liveViewAvailable: lifecycle.liveViewAvailable,
    replayAvailable: lifecycle.replayAvailable,
  };
};

export const runToolVerification = async ({
  runId,
  probeId,
  targetUrl,
  selectedTool,
  inputSource = { kind: "generated" },
  browserSession,
  releaseBrowser,
  signal,
  report,
  retainScreenshot,
}: RunToolVerificationOptions) => {
  throwIfAborted(signal);
  const startedAt = Date.now();
  const logs: EvidenceLogEntry[] = [];
  const operationalLogs: EvidenceLogEntry[] = [];
  const timeline: TimelineEntry[] = [];
  let discoveryDurationMs = 0;
  let navigationDurationMs: number | null = null;
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
  const recordOperationalLog = (
    source: EvidenceLogEntry["source"],
    message: string,
    level: EvidenceLogEntry["level"] = "info",
  ) => {
    addLog(operationalLogs, startedAt, { source, level, message });
  };
  const initialSessionStatistics = browserSession.getStatistics();
  recordOperationalLog(
    "tooltruth",
    `${initialSessionStatistics.provider === "browserbase" ? "Browserbase" : "Local browser"} startup completed in ${initialSessionStatistics.startupDurationMs} ms.`,
  );

  report({
    kind: "section.progress",
    section: "evidence",
    progress: {
      value: 10,
      message: "Preparing a disposable verification browser",
    },
  });

  const captured = await browserSession.runExclusive(async ({
    browser: stagehand,
    page,
    evidenceObserver,
  }) => {
    throwIfAborted(signal);
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
      throwIfAborted(signal);
      recordTimeline("Browser session ready", getInspectionBrowserLabel());

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
        progress: { value: 24, message: "Loading the target page" },
      });

      const discoverTools = async () => {
        const discoveryStartedAt = Date.now();
        try {
          return await readStableWebMcpTools(page);
        } finally {
          discoveryDurationMs += Date.now() - discoveryStartedAt;
        }
      };

      let liveTools = await discoverTools();
      throwIfAborted(signal);
      let liveTool = selectLiveTool(liveTools, selectedTool);

      if (!liveTool) {
        const navigationStartedAt = Date.now();
        try {
          await page.goto(targetUrl, {
            waitUntil: "load",
            timeoutMs: NAVIGATION_TIMEOUT_MS,
          });
        } finally {
          navigationDurationMs = Date.now() - navigationStartedAt;
        }
        throwIfAborted(signal);
        await validateInspectionUrl(page.url());
        await evidenceObserver.refresh();
        liveTools = await discoverTools();
        throwIfAborted(signal);
        liveTool = selectLiveTool(liveTools, selectedTool);
      }

      if (!liveTool) {
        throw new Error(
          `The selected tool, ${selectedTool.name}, is no longer registered in this inspection session.`,
        );
      }

      await validateInspectionUrl(page.url());
      recordTimeline("Target ready", safeUrlPath(page.url()));

      const tool = {
        ...toDetectedTool(liveTool),
        id: selectedTool.id,
      };
      report({ kind: "tool.ready", toolId: selectedTool.id, data: tool });
      const toolInput = await resolveVerificationToolInput(
        inputSource,
        () =>
          generateSafeToolInput(
            tool,
            recordAiActivity,
            signal,
            getAgentMartRegressionInput(targetUrl, tool.name),
          ),
      );
      throwIfAborted(signal);
      recordTimeline(
        inputSource.kind === "directed"
          ? "Directed input accepted"
          : "Tool input prepared",
        stringifyCompact(toolInput),
      );

      report({
        kind: "section.progress",
        section: "evidence",
        progress: { value: 42, message: "Capturing the baseline state" },
      });
      const before = await captureSnapshot(stagehand, page, evidenceObserver);
      throwIfAborted(signal);
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
      const invokeTool = async (
        invokedEvent: string,
        completedEvent: string,
      ) => {
        throwIfAborted(signal);
        const invocationStartedAt = Date.now();
        const invocation = await page.invokeWebMCPTool(tool.name, toolInput, {
          frameId: liveTool.frameId,
          timeoutMs: TOOL_INVOCATION_TIMEOUT_MS,
        });
        recordTimeline(
          invokedEvent,
          `${tool.name}(${stringifyCompact(toolInput, 300)})`,
        );

        let invocationResult: WebMCPToolResult;
        try {
          invocationResult = await waitForInvocationResult(invocation, signal);
        } catch (error) {
          throwIfAborted(signal);
          invocationResult = {
            invocationId: invocation.invocationId,
            status: "Error",
            errorText: error instanceof Error ? error.message : String(error),
          };
        }
        const durationMs = Date.now() - invocationStartedAt;
        recordTimeline(
          completedEvent,
          `${invocationResult.status} in ${durationMs} ms · ${stringifyCompact(invocationResult.output ?? invocationResult.errorText, 500)}`,
        );

        return { result: invocationResult, durationMs };
      };

      const firstInvocation = await invokeTool("Tool invoked", "Tool completed");
      await page.waitForTimeout(350);
      throwIfAborted(signal);
      await evidenceObserver.refresh();
      const afterFirstInvocation = await captureSnapshot(
        stagehand,
        page,
        evidenceObserver,
      );
      throwIfAborted(signal);

      let after = afterFirstInvocation;
      let invocationDurationMs = firstInvocation.durationMs;
      let invocationCount = 1;
      let repeatedInvocation: RepeatedInvocationEvidence | undefined;

      const directedIdempotencyRequested =
        directedInputRequestsIdempotency(inputSource);
      if (
        directedIdempotencyRequested ||
        (firstInvocation.result.status === "Completed" &&
          toolPromisesIdempotency(tool))
      ) {
        report({
          kind: "section.progress",
          section: "evidence",
          progress: {
            value: 64,
            message: "Repeating the same input to verify idempotency",
          },
        });
        evidenceObserver.reset();
        const secondInvocation = await invokeTool(
          "Idempotency replay",
          "Repeated call completed",
        );
        invocationCount = 2;
        invocationDurationMs += secondInvocation.durationMs;
        await page.waitForTimeout(350);
        throwIfAborted(signal);
        await evidenceObserver.refresh();
        const afterSecondInvocation = await captureSnapshot(
          stagehand,
          page,
          evidenceObserver,
        );
        throwIfAborted(signal);
        const secondStateChanges = compareSnapshots(
          afterFirstInvocation,
          afterSecondInvocation,
        );
        const secondObservedMutations = afterSecondInvocation.network.filter(
          isObservedMutationRequest,
        );
        repeatedInvocation = {
          firstStatus: firstInvocation.result.status,
          secondStatus: secondInvocation.result.status,
          firstOutput: firstInvocation.result.output,
          secondOutput: secondInvocation.result.output,
          secondStateChanges,
          secondMutatingRequests: secondObservedMutations.map(
            (entry) =>
              `${entry.method} ${safeUrlPath(entry.url)} · ${entry.status}`,
          ),
        };
        after = {
          ...afterSecondInvocation,
          network: [
            ...afterFirstInvocation.network,
            ...afterSecondInvocation.network,
          ],
          runtimeErrors: [
            ...afterFirstInvocation.runtimeErrors,
            ...afterSecondInvocation.runtimeErrors,
          ],
          networkLimitReached:
            afterFirstInvocation.networkLimitReached ||
            afterSecondInvocation.networkLimitReached,
          runtimeErrorLimitReached:
            afterFirstInvocation.runtimeErrorLimitReached ||
            afterSecondInvocation.runtimeErrorLimitReached,
        };
        recordTimeline(
          "Idempotency comparison",
          secondStateChanges.length === 0
            ? "The repeated call caused no additional observable state change"
            : `${secondStateChanges.length} additional observable changes followed the repeated call`,
        );
      }

      const result = firstInvocation.result;
      const stateChanges = compareSnapshots(before, after);
      const network = toNetworkEntries(after.network);
      const observedMutations = after.network.filter(isObservedMutationRequest);
      const destinationInspection =
        await findForbiddenDestinationRequests(after.network);
      const forbiddenDestinationRequests = destinationInspection.requests;
      const evidenceComplete =
        !after.networkLimitReached &&
        !after.runtimeErrorLimitReached &&
        destinationInspection.complete &&
        stateChanges.length < 100 &&
        (repeatedInvocation?.secondStateChanges.length ?? 0) < 100;

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

      const screenshots = [
        retainScreenshot({
          label: "Before tool invocation",
          body: before.screenshot.body,
          contentType: before.screenshot.contentType,
          hash: before.screenshot.hash,
        }),
        retainScreenshot({
          label: "After tool invocation",
          body: after.screenshot.body,
          contentType: after.screenshot.contentType,
          hash: after.screenshot.hash,
        }),
      ].filter((screenshot): screenshot is EvidenceScreenshot =>
        Boolean(screenshot),
      );
      const evidence: ExecutionEvidenceData = {
        runLabel: `Probe ${probeId.slice(0, 12)} · ${tool.name}`,
        screenshots,
        repeatedInvocation: repeatedInvocation
          ? {
              reason: "idempotency",
              firstStatus: repeatedInvocation.firstStatus,
              secondStatus: repeatedInvocation.secondStatus,
              secondStateChanges: repeatedInvocation.secondStateChanges,
              secondMutatingRequests:
                repeatedInvocation.secondMutatingRequests,
            }
          : undefined,
        timeline,
        stateChanges,
        network,
        logs,
      };

      report({ kind: "evidence.ready", toolId: selectedTool.id, data: evidence });
      return {
        after,
        before,
        evidence,
        evidenceComplete,
        forbiddenDestinationRequests,
        invocationDurationMs,
        invocationCount,
        networkRequests: toDeterministicNetworkRequests(after.network),
        observedMutations,
        requestCount: after.network.length,
        repeatedInvocation,
        result,
        stateChanges,
        tool,
        toolCount: liveTools.length,
        toolInput,
      };
    } finally {
      if (page && consoleListener) page.off("console", consoleListener);
      unsubscribeFromLogs();
    }
  });

  await releaseBrowser();
  throwIfAborted(signal);

  const directedEvaluation =
    inputSource.kind === "directed"
      ? evaluateDirectedTest({
          assertions: inputSource.test.assertions,
          invocationStatus: captured.result.status,
          toolOutput: captured.result.output,
          beforeUrl: captured.before.url,
          afterUrl: captured.after.url,
          stateChanges: captured.stateChanges,
          mutatingRequests: captured.observedMutations.map(
            (entry) =>
              `${entry.method} ${safeUrlPath(entry.url)} · ${entry.status}`,
          ),
          evidenceComplete: captured.evidenceComplete,
          repeatedInvocation: captured.repeatedInvocation,
        })
      : undefined;

  const releasedSessionStatistics = browserSession.getStatistics();
  const browserbaseStatistics = toBrowserbaseStatistics(
    releasedSessionStatistics.browserbaseLifecycle,
  );
  if (browserbaseStatistics) {
    recordOperationalLog(
      "browserbase",
      `Session ${browserbaseStatistics.sessionId} ended with status ${browserbaseStatistics.status} after ${browserbaseStatistics.durationMs} ms${browserbaseStatistics.providerStatus ? `; Browserbase reported ${browserbaseStatistics.providerStatus}` : ""}.`,
    );
    recordOperationalLog(
      "browserbase",
      `Region ${browserbaseStatistics.region ?? "unavailable"}; proxy bandwidth ${browserbaseStatistics.proxyBytes === null ? "not applicable or unavailable" : `${browserbaseStatistics.proxyBytes} bytes`}; Live View ${browserbaseStatistics.liveViewAvailable ? "available" : "unavailable"}; replay ${browserbaseStatistics.replayAvailable === null ? "availability unknown" : browserbaseStatistics.replayAvailable ? "available" : "processing or unavailable"}.`,
    );
  }

  report({
    kind: "section.progress",
    section: "analysis",
    progress: {
      value: 68,
      message: "Comparing the contract with observed behavior",
    },
  });

  const mutatingRequests = captured.observedMutations.map(
    (entry) => `${entry.method} ${safeUrlPath(entry.url)} · ${entry.status}`,
  );
  const analysisStartedAt = Date.now();
  const analysis = await analyzeToolVerification(
    {
      tool: captured.tool,
      toolInput: captured.toolInput,
      toolOutput: captured.result.output,
      invocationStatus: captured.result.status,
      invocationError:
        captured.result.errorText ??
        (captured.result.exception
          ? stringifyCompact(captured.result.exception)
          : undefined),
      before: toSemanticBrowserSnapshot(captured.before, captured.tool.name),
      after: toSemanticBrowserSnapshot(captured.after, captured.tool.name),
      screenshots: {
        before: captured.before.screenshot.body,
        after: captured.after.screenshot.body,
      },
      stateChanges: captured.stateChanges,
      network: captured.evidence.network,
      networkRequests: captured.networkRequests,
      mutatingRequests,
      forbiddenDestinationRequests: captured.forbiddenDestinationRequests,
      repeatedInvocation: captured.repeatedInvocation,
      evidenceComplete: captured.evidenceComplete,
      runtimeLogs: logs.filter((entry) => entry.source !== "ai"),
      timeline: captured.evidence.timeline,
      sandboxLabel: getInspectionBrowserLabel(),
    },
    recordAiActivity,
    signal,
  );
  const regression = evaluateAgentMartRegression({
    targetUrl,
    toolName: captured.tool.name,
    analysis,
  });
  const completedAnalysis: ContractAnalysisData = regression
    ? { ...analysis, regression }
    : analysis;
  const analysisDurationMs = Date.now() - analysisStartedAt;
  throwIfAborted(signal);

  if (regression) {
    recordOperationalLog(
      "tooltruth",
      regression.status === "matched"
        ? `AgentMart regression manifest ${regression.manifestVersion} matched ${captured.tool.name}.`
        : regression.status === "mismatched"
          ? `AgentMart regression manifest ${regression.manifestVersion} did not match ${captured.tool.name}.`
          : `AgentMart regression manifest ${regression.manifestVersion} does not cover ${captured.tool.name}.`,
      regression.status === "matched" ? "info" : "warning",
    );
  }

  const totalDurationMs = Date.now() - startedAt;
  recordOperationalLog(
    "tooltruth",
    `Verification measurements completed in ${totalDurationMs} ms with ${captured.invocationCount} invocation${captured.invocationCount === 1 ? "" : "s"}, ${captured.requestCount} requests, and ${captured.observedMutations.length} mutating requests.`,
  );
  const statistics: VerificationStatistics = {
    provider: releasedSessionStatistics.provider,
    browserStartupDurationMs: releasedSessionStatistics.startupDurationMs,
    discoveryDurationMs,
    navigationDurationMs,
    invocationDurationMs: captured.invocationDurationMs,
    invocationCount: captured.invocationCount,
    analysisDurationMs,
    totalDurationMs,
    toolCount: captured.toolCount,
    requestCount: captured.requestCount,
    mutationCount: captured.observedMutations.length,
    stateChangeCount: captured.stateChanges.length,
    warningCount: logs.filter((entry) => entry.level === "warning").length,
    errorCount: logs.filter((entry) => entry.level === "error").length,
    finalStatus: "completed",
    browserbase: browserbaseStatistics,
    operationalLogs,
  };
  captured.evidence.logs = [...logs];
  captured.evidence.statistics = statistics;
  report({
    kind: "evidence.ready",
    toolId: selectedTool.id,
    data: captured.evidence,
  });
  report({
    kind: "analysis.ready",
    toolId: selectedTool.id,
    data: completedAnalysis,
  });
  if (directedEvaluation) {
    report({
      kind: "directed.ready",
      toolId: selectedTool.id,
      data: directedEvaluation,
    });
  }
  report({ kind: "probe.completed", toolId: selectedTool.id });

  console.info("ToolTruth verification completed", {
    runId,
    probeId,
    tool: captured.tool.name,
    verdict: completedAnalysis.verdict,
    durationMs: Date.now() - startedAt,
    stateChangeCount: captured.stateChanges.length,
    requestCount: captured.requestCount,
    logCount: logs.length,
    browserbase: browserbaseStatistics,
  });
};
