import "server-only";

import type { LogLine } from "@browserbasehq/stagehand";

import { createInspectionBrowser } from "@/features/inspect/server/stagehand-browser";

type InspectionBrowser = ReturnType<typeof createInspectionBrowser>;
type InspectionPage = ReturnType<InspectionBrowser["context"]["pages"]>[number];

export type InspectionBrowserSessionContext = {
  browser: InspectionBrowser;
  page: InspectionPage;
};

type InspectionBrowserSessionOperation<T> = (
  context: InspectionBrowserSessionContext,
) => Promise<T>;

export type InspectionBrowserSession = {
  runExclusive: <T>(operation: InspectionBrowserSessionOperation<T>) => Promise<T>;
  subscribeToLogs: (reporter: (line: LogLine) => void) => () => void;
  close: () => Promise<void>;
};

export const openInspectionBrowserSession = async () => {
  const logReporters = new Set<(line: LogLine) => void>();
  const browser = createInspectionBrowser((line) => {
    for (const reporter of logReporters) reporter(line);
  });

  try {
    await browser.init();
  } catch (error) {
    await browser.close().catch(() => undefined);
    throw error;
  }

  if (!browser.context.pages()[0]) {
    await browser.close().catch(() => undefined);
    throw new Error("The inspection browser did not create a page.");
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

      return await operation({ browser, page });
    } finally {
      releaseOperation();
    }
  };

  const subscribeToLogs = (reporter: (line: LogLine) => void) => {
    logReporters.add(reporter);
    return () => logReporters.delete(reporter);
  };

  const close = async () => {
    if (closed) return;
    closed = true;
    await operationTail.catch(() => undefined);
    logReporters.clear();
    await browser.close().catch(() => undefined);
  };

  return {
    runExclusive,
    subscribeToLogs,
    close,
  } satisfies InspectionBrowserSession;
};
