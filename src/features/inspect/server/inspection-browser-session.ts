import "server-only";

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

type InspectionBrowserSessionOperation<T> = (
  context: InspectionBrowserSessionContext,
) => Promise<T>;

export type InspectionBrowserSession = {
  runExclusive: <T>(operation: InspectionBrowserSessionOperation<T>) => Promise<T>;
  subscribeToLogs: (reporter: (line: LogLine) => void) => () => void;
  close: () => Promise<void>;
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

export const openInspectionBrowserSession = async (
  targetHostname: string,
  reportStartup: InspectionBrowserStartupReporter,
) => {
  const logReporters = new Set<(line: LogLine) => void>();
  const bufferedLogs: LogLine[] = [];
  const { browser, initialize, closeEnvironment } = await createInspectionBrowser(
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

  try {
    await initialize(reportStartup);
  } catch (error) {
    void browser.close().catch(() => undefined);
    void closeEnvironment().catch(() => undefined);
    throw error;
  }

  const browserbaseSessionId = browser.browserbaseSessionID;
  if (browserbaseSessionId) {
    console.info("ToolTruth Browserbase session opened", {
      sessionId: browserbaseSessionId,
    });
  }

  const browserContext = browser.context;
  const initialPage = browserContext?.pages()[0];
  if (!browserContext || !initialPage) {
    await browser.close().catch(() => undefined);
    await closeEnvironment().catch(() => undefined);
    throw new Error("The inspection browser did not create a page.");
  }

  let evidenceObserver: BrowserEvidenceObserver;
  try {
    evidenceObserver = await createBrowserEvidenceObserver(
      initialPage,
      browserContext,
    );
  } catch (error) {
    await browser.close().catch(() => undefined);
    await closeEnvironment().catch(() => undefined);
    throw error;
  }

  let operationTail: Promise<void> = Promise.resolve();
  let closed = false;

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

  const close = async () => {
    if (closed) return;
    closed = true;
    await operationTail.catch(() => undefined);
    logReporters.clear();
    await evidenceObserver.dispose().catch(() => undefined);
    try {
      await browser.close();
      if (browserbaseSessionId) {
        console.info("ToolTruth Browserbase session released", {
          sessionId: browserbaseSessionId,
        });
      }
    } catch (error) {
      console.error("ToolTruth browser session cleanup failed", {
        sessionId: browserbaseSessionId,
        error,
      });
    }
    await closeEnvironment().catch(() => undefined);
  };

  return {
    runExclusive,
    subscribeToLogs,
    close,
  } satisfies InspectionBrowserSession;
};
