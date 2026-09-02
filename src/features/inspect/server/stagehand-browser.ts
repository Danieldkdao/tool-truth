import "server-only";

import { Stagehand, type LogLine } from "@browserbasehq/stagehand";

import { serverEnv } from "@/data/env/server";

export type StagehandLogReporter = (line: LogLine) => void;

export const createInspectionBrowser = (reportLog: StagehandLogReporter) => {
  const sharedOptions = {
    disableAPI: true,
    disablePino: true,
    logger: reportLog,
    verbose: 2 as const,
  };

  if (serverEnv.STAGEHAND_ENV === "local") {
    return new Stagehand({
      ...sharedOptions,
      env: "LOCAL",
      localBrowserLaunchOptions: {
        headless: true,
        viewport: { width: 1440, height: 900 },
      },
    });
  }

  return new Stagehand({
    ...sharedOptions,
    env: "BROWSERBASE",
    apiKey: serverEnv.BROWSERBASE_API_KEY,
    browserbaseSessionCreateParams: {
      browserSettings: {
        blockAds: true,
        recordSession: true,
        viewport: { width: 1440, height: 900 },
      },
    },
  });
};

export const getInspectionBrowserLabel = () => {
  return serverEnv.STAGEHAND_ENV === "local"
    ? "Local isolated browser"
    : "Browserbase isolated browser";
};
