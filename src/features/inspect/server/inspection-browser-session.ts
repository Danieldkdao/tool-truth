import "server-only";

import { randomUUID } from "node:crypto";

import type { LogLine } from "@browserbasehq/stagehand";

import {
  createBrowserEvidenceObserver,
  type BrowserEvidenceObserver,
} from "@/features/inspect/server/browser-evidence-observer";
import { createInspectionBrowser } from "@/features/inspect/server/stagehand-browser";
import type { InspectionBrowserStartupReporter } from "@/features/inspect/server/stagehand-browser-shared";

type InspectionBrowser = Awaited<
  ReturnType<typeof createInspectionBrowser>
>["browser"];
type InspectionPage = ReturnType<InspectionBrowser["context"]["pages"]>[number];

export type InspectionBrowserSessionContext = {
  browser: InspectionBrowser;
  page: InspectionPage;
  evidenceObserver: BrowserEvidenceObserver;
};

export type BrowserbaseSessionStatus =
  | "creating"
  | "running"
  | "closing"
  | "completed"
  | "failed"
  | "canceled"
  | "timed_out";

export type BrowserbaseSessionTerminationReason =
  | "completed"
  | "failed"
  | "canceled"
  | "timed_out"
  | "run_expired"
  | "replaced"
  | "cleanup_failed";

export type BrowserbaseSessionLifecycle = {
  lifecycleId: string;
  sessionId: string | null;
  status: BrowserbaseSessionStatus;
  createdAt: number;
  expiresAt: number;
  debugUrl: string | null;
  terminationReason: BrowserbaseSessionTerminationReason | null;
  endedAt: number | null;
};

export type BrowserbaseSessionLifecycleReporter = (
  lifecycle: BrowserbaseSessionLifecycle,
) => void;

type InspectionBrowserSessionOperation<T> = (
  context: InspectionBrowserSessionContext,
) => Promise<T>;

export type InspectionBrowserSession = {
  runExclusive: <T>(operation: InspectionBrowserSessionOperation<T>) => Promise<T>;
  subscribeToLogs: (reporter: (line: LogLine) => void) => () => void;
  close: (reason?: BrowserbaseSessionTerminationReason) => Promise<void>;
};

export class InspectionBrowserSessionUnavailableError extends Error {
  constructor() {
    super(
      "The inspection browser connection ended before the verification started.",
    );
    this.name = "InspectionBrowserSessionUnavailableError";
  }
}

const MAX_BUFFERED_STARTUP_LOGS = 100;
const BROWSER_CLOSE_TIMEOUT_MS = 10_000;

export const openInspectionBrowserSession = async (
  targetHostname: string,
  reportStartup: InspectionBrowserStartupReporter,
  reportBrowserbaseLifecycle?: BrowserbaseSessionLifecycleReporter,
) => {
  const logReporters = new Set<(line: LogLine) => void>();
  const bufferedLogs: LogLine[] = [];
  const {
    browser,
    provider,
    browserbaseSessionTimeoutMs,
    initialize,
    closeEnvironment,
    releaseBrowserbaseSession,
  } = await createInspectionBrowser(
    targetHostname,
    (line) => {
      if (logReporters.size === 0) {
        if (bufferedLogs.length >= MAX_BUFFERED_STARTUP_LOGS) {
          bufferedLogs.shift();
        }
        bufferedLogs.push(line);
        return;
      }

      for (const reporter of logReporters) reporter(line);
    },
    reportStartup,
  );

  let browserbaseLifecycle: BrowserbaseSessionLifecycle | undefined;
  if (provider === "browserbase") {
    const createdAt = Date.now();
    browserbaseLifecycle = {
      lifecycleId: `browserbase_${randomUUID()}`,
      sessionId: null,
      status: "creating",
      createdAt,
      expiresAt: createdAt + (browserbaseSessionTimeoutMs ?? 0),
      debugUrl: null,
      terminationReason: null,
      endedAt: null,
    };
    reportBrowserbaseLifecycle?.({ ...browserbaseLifecycle });
  }

  const updateBrowserbaseLifecycle = (
    update: Partial<BrowserbaseSessionLifecycle>,
  ) => {
    if (!browserbaseLifecycle) return;
    browserbaseLifecycle = { ...browserbaseLifecycle, ...update };
    reportBrowserbaseLifecycle?.({ ...browserbaseLifecycle });
  };

  const closeBrowser = async () => {
    let timeout: NodeJS.Timeout | undefined;
    const closeDeadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(
        () => reject(new Error("Browser cleanup timed out.")),
        BROWSER_CLOSE_TIMEOUT_MS,
      );
      timeout.unref?.();
    });

    try {
      await Promise.race([browser.close(), closeDeadline]);
    } catch (error) {
      const sessionId = browser.browserbaseSessionID;
      if (!sessionId || !releaseBrowserbaseSession) throw error;
      await releaseBrowserbaseSession(sessionId);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };

  const cleanUpStartupFailure = async () => {
    const results = await Promise.allSettled([
      closeBrowser(),
      closeEnvironment(),
    ]);
    return results.some((result) => result.status === "rejected");
  };

  try {
    await initialize(reportStartup);
  } catch (error) {
    const isTimeout =
      error instanceof Error && /timed?\s*out|timeout/i.test(error.message);
    const cleanupFailed = await cleanUpStartupFailure();
    updateBrowserbaseLifecycle({
      status: cleanupFailed ? "failed" : isTimeout ? "timed_out" : "failed",
      terminationReason: cleanupFailed
        ? "cleanup_failed"
        : isTimeout
          ? "timed_out"
          : "failed",
      endedAt: Date.now(),
    });
    throw error;
  }

  const browserbaseSessionId = browser.browserbaseSessionID;
  if (provider === "browserbase" && !browserbaseSessionId) {
    const cleanupFailed = await cleanUpStartupFailure();
    updateBrowserbaseLifecycle({
      status: "failed",
      terminationReason: cleanupFailed ? "cleanup_failed" : "failed",
      endedAt: Date.now(),
    });
    throw new Error("Browserbase did not return a session ID.");
  }

  if (browserbaseSessionId) {
    updateBrowserbaseLifecycle({
      sessionId: browserbaseSessionId,
      status: "running",
      debugUrl: browser.browserbaseDebugURL ?? null,
    });
    console.info("ToolTruth Browserbase session opened", {
      sessionId: browserbaseSessionId,
    });
  }

  const browserContext = browser.context;
  const initialPage = browserContext?.pages()[0];
  if (!browserContext || !initialPage) {
    const cleanupFailed = await cleanUpStartupFailure();
    updateBrowserbaseLifecycle({
      status: "failed",
      terminationReason: cleanupFailed ? "cleanup_failed" : "failed",
      endedAt: Date.now(),
    });
    throw new Error("The inspection browser did not create a page.");
  }

  let evidenceObserver: BrowserEvidenceObserver;
  try {
    evidenceObserver = await createBrowserEvidenceObserver(
      initialPage,
      browserContext,
    );
  } catch (error) {
    const cleanupFailed = await cleanUpStartupFailure();
    updateBrowserbaseLifecycle({
      status: "failed",
      terminationReason: cleanupFailed ? "cleanup_failed" : "failed",
      endedAt: Date.now(),
    });
    throw error;
  }

  let operationTail: Promise<void> = Promise.resolve();
  let closed = false;
  let closePromise: Promise<void> | undefined;
  let browserbaseExpiration: NodeJS.Timeout | undefined;

  const runExclusive = async <T>(
    operation: InspectionBrowserSessionOperation<T>,
  ) => {
    const previousOperation = operationTail;
    let releaseOperation: () => void = () => undefined;
    operationTail = new Promise<void>((resolve) => {
      releaseOperation = resolve;
    });

    await previousOperation;
    try {
      if (closed) {
        throw new InspectionBrowserSessionUnavailableError();
      }

      const context = browser.context;
      if (!context) {
        throw new InspectionBrowserSessionUnavailableError();
      }

      const page = context.pages()[0];
      if (!page) {
        throw new InspectionBrowserSessionUnavailableError();
      }

      await evidenceObserver.refresh();
      return await operation({ browser, page, evidenceObserver });
    } finally {
      releaseOperation();
    }
  };

  const subscribeToLogs = (reporter: (line: LogLine) => void) => {
    logReporters.add(reporter);
    for (const line of bufferedLogs.splice(0)) reporter(line);
    return () => logReporters.delete(reporter);
  };

  const close = (reason: BrowserbaseSessionTerminationReason = "completed") => {
    if (closePromise) return closePromise;
    closed = true;
    if (browserbaseExpiration) {
      clearTimeout(browserbaseExpiration);
      browserbaseExpiration = undefined;
    }

    updateBrowserbaseLifecycle({ status: "closing" });
    closePromise = (async () => {
      await operationTail.catch(() => undefined);
      logReporters.clear();
      await evidenceObserver.dispose().catch(() => undefined);

      let cleanupFailed = false;
      try {
        await closeBrowser();
      } catch (error) {
        cleanupFailed = true;
        console.error("ToolTruth browser session cleanup failed", {
          sessionId: browserbaseSessionId,
          error,
        });
      }

      try {
        await closeEnvironment();
      } catch (error) {
        cleanupFailed = true;
        console.error("ToolTruth browser environment cleanup failed", {
          sessionId: browserbaseSessionId,
          error,
        });
      }

      const status: BrowserbaseSessionStatus = cleanupFailed
        ? "failed"
        : reason === "run_expired" || reason === "timed_out"
          ? "timed_out"
          : reason === "canceled" || reason === "replaced"
            ? "canceled"
            : reason === "failed"
              ? "failed"
              : "completed";
      updateBrowserbaseLifecycle({
        status,
        terminationReason: cleanupFailed ? "cleanup_failed" : reason,
        endedAt: Date.now(),
      });

      if (browserbaseSessionId && !cleanupFailed) {
        console.info("ToolTruth Browserbase session released", {
          sessionId: browserbaseSessionId,
          reason,
        });
      }
    })();

    return closePromise;
  };

  if (browserbaseLifecycle) {
    const expirationDelay = Math.max(
      0,
      browserbaseLifecycle.expiresAt - Date.now(),
    );
    browserbaseExpiration = setTimeout(() => {
      void close("timed_out");
    }, expirationDelay);
    browserbaseExpiration.unref?.();
  }

  return {
    runExclusive,
    subscribeToLogs,
    close,
  } satisfies InspectionBrowserSession;
};
