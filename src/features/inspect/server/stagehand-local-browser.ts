import "server-only";

import { Stagehand } from "@browserbasehq/stagehand";

import { startInspectionNetworkProxy } from "@/features/inspect/server/inspection-network-proxy";
import {
  createSharedStagehandOptions,
  INSPECTION_VIEWPORT,
  type InspectionBrowserHandle,
  type StagehandLogReporter,
} from "@/features/inspect/server/stagehand-browser-shared";

export const createLocalInspectionBrowser = async (
  reportLog: StagehandLogReporter,
): Promise<InspectionBrowserHandle> => {
  const networkProxy = await startInspectionNetworkProxy();

  try {
    const browser = new Stagehand({
      ...createSharedStagehandOptions(reportLog),
      env: "LOCAL",
      localBrowserLaunchOptions: {
        args: [
          "--disable-quic",
          "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
          "--host-resolver-rules=EXCLUDE 127.0.0.1, MAP * ~NOTFOUND",
        ],
        headless: true,
        proxy: {
          server: networkProxy.url,
          bypass: "<-loopback>",
        },
        viewport: INSPECTION_VIEWPORT,
      },
    });

    return {
      browser,
      initialize: async (reportStartup) => {
        reportStartup({ value: 20, message: "Starting the local browser" });
        await browser.init();
        reportStartup({ value: 24, message: "Local browser ready" });
      },
      closeEnvironment: () => networkProxy.close(),
    };
  } catch (error) {
    await networkProxy.close().catch(() => undefined);
    throw error;
  }
};
