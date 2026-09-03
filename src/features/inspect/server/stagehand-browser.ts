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

const normalizeHostname = (hostname: string) => {
  return hostname.trim().replace(/\.$/, "").toLowerCase();
};

const getBrowserbaseAllowedDomains = (targetHostname: string) => {
  const allowedDomains = [
    ...new Set(
      serverEnv.BROWSERBASE_ALLOWED_DOMAINS?.split(",")
        .map(normalizeHostname)
        .filter(Boolean) ?? [],
    ),
  ];
  const normalizedTargetHostname = normalizeHostname(targetHostname);

  if (
    allowedDomains.length === 0 ||
    !allowedDomains.includes(normalizedTargetHostname)
  ) {
    throw new InspectionBrowserStartupError(
      `Browserbase rejected unapproved target ${normalizedTargetHostname}.`,
      "Browserbase inspections are limited to server-approved smoke-test domains. Add this host to BROWSERBASE_ALLOWED_DOMAINS or use the local browser.",
    );
  }

  return allowedDomains;
};

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
  targetHostname: string,
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
  const allowedDomains = getBrowserbaseAllowedDomains(targetHostname);
  const { createBrowserbaseInspectionBrowser } = await loadAdapter(
    import("@/features/inspect/server/stagehand-browserbase-browser"),
    "The Browserbase adapter",
  );
  return createBrowserbaseInspectionBrowser(reportLog, allowedDomains);
};

export const getInspectionBrowserLabel = () => {
  return serverEnv.STAGEHAND_ENV === "local"
    ? "Local isolated browser"
    : "Browserbase isolated browser";
};
