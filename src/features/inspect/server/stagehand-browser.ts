import "server-only";

import { Stagehand, type LogLine } from "@browserbasehq/stagehand";

import { serverEnv } from "@/data/env/server";

export type StagehandLogReporter = (line: LogLine) => void;

export const createInspectionBrowser = (
  reportLog: StagehandLogReporter,
  networkProxyUrl: string,
) => {
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
        args: [
          "--disable-quic",
          "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
          "--host-resolver-rules=EXCLUDE 127.0.0.1, MAP * ~NOTFOUND",
        ],
        headless: true,
        proxy: {
          server: networkProxyUrl,
          bypass: "<-loopback>",
        },
        viewport: { width: 1440, height: 900 },
      },
    });
  }

  if (!serverEnv.BROWSERBASE_API_KEY) {
    throw new Error(
      "BROWSERBASE_API_KEY is required when STAGEHAND_ENV is browserbase.",
    );
  }

  throw new Error(
    "Browserbase inspection is unavailable because DNS pinning cannot be guaranteed. Use STAGEHAND_ENV=local.",
  );
};

export const getInspectionBrowserLabel = () => {
  return serverEnv.STAGEHAND_ENV === "local"
    ? "Local isolated browser"
    : "Browserbase isolated browser";
};
