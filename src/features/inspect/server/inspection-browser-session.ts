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

const MAX_BUFFERED_STARTUP_LOGS = 100;

export const openInspectionBrowserSession = async (
  reportStartup: InspectionBrowserStartupReporter,
) => {
  const logReporters = new Set<(line: LogLine) => void>();
  const bufferedLogs: LogLine[] = [];
  const { browser, initialize, closeEnvironment } = await createInspectionBrowser(
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

  if (!browser.context.pages()[0]) {
    await browser.close().catch(() => undefined);
    await closeEnvironment().catch(() => undefined);
    throw new Error("The inspection browser did not create a page.");
  }

  const initialPage = browser.context.pages()[0];
  let evidenceObserver: BrowserEvidenceObserver;
  try {
    evidenceObserver = await createBrowserEvidenceObserver(
      initialPage,
      browser.context,
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
        throw new Error("The inspection browser session is no longer available.");
      }

      const page = browser.context.pages()[0];
      if (!page) {
        throw new Error("The inspection browser session no longer has a page.");
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
    await browser.close().catch(() => undefined);
    await closeEnvironment().catch(() => undefined);
  };

  return {
    runExclusive,
    subscribeToLogs,
    close,
  } satisfies InspectionBrowserSession;
};
