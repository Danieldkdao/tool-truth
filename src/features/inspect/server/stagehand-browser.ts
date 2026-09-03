import "server-only";

import { serverEnv } from "@/data/env/server";
import {
  InspectionBrowserStartupError,
  type InspectionBrowserHandle,
  type InspectionBrowserStartupReporter,
  type StagehandLogReporter,
} from "@/features/inspect/server/stagehand-browser-shared";

export type {
  StagehandLogReporter,
} from "@/features/inspect/server/stagehand-browser-shared";
export {
  getInspectionBrowserFailureMessage,
} from "@/features/inspect/server/stagehand-browser-shared";

const ADAPTER_LOAD_TIMEOUT_MS = 15_000;

const loadAdapter = async <T>(adapter: Promise<T>, name: string) => {
  let timeout: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(
        new InspectionBrowserStartupError(
          `${name} loading timed out.`,
          `${name} could not be loaded within 15 seconds. Restart the development server and try again.`,
        ),
      );
    }, ADAPTER_LOAD_TIMEOUT_MS);
    timeout.unref?.();
  });

  try {
    return await Promise.race([adapter, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

export const createInspectionBrowser = async (
  reportLog: StagehandLogReporter,
  reportStartup: InspectionBrowserStartupReporter,
): Promise<InspectionBrowserHandle> => {
  if (serverEnv.STAGEHAND_ENV === "local") {
    reportStartup({ value: 16, message: "Loading the local browser adapter" });
    const { createLocalInspectionBrowser } = await loadAdapter(
      import("@/features/inspect/server/stagehand-local-browser"),
      "The local browser adapter",
    );
    return createLocalInspectionBrowser(reportLog);
  }

  reportStartup({ value: 16, message: "Loading the Browserbase adapter" });
  const { createBrowserbaseInspectionBrowser } = await loadAdapter(
    import("@/features/inspect/server/stagehand-browserbase-browser"),
    "The Browserbase adapter",
  );
  return createBrowserbaseInspectionBrowser(reportLog);
};

export const getInspectionBrowserLabel = () => {
  return serverEnv.STAGEHAND_ENV === "local"
    ? "Local isolated browser"
    : "Browserbase isolated browser";
};

export const shouldCloseInspectionBrowserAfterProbe = () => {
  return serverEnv.STAGEHAND_ENV === "browserbase";
};
