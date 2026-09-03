import "server-only";

import { Stagehand } from "@browserbasehq/stagehand";

import { serverEnv } from "@/data/env/server";
import {
  createSharedStagehandOptions,
  INSPECTION_VIEWPORT,
  type InspectionBrowserHandle,
  InspectionBrowserStartupError,
  type StagehandLogReporter,
} from "@/features/inspect/server/stagehand-browser-shared";

const BROWSERBASE_SESSION_CREATE_TIMEOUT_MS = 30_000;
const BROWSERBASE_INITIALIZATION_TIMEOUT_MS = 45_000;
const BROWSERBASE_SESSION_TIMEOUT_SECONDS = 5 * 60;
const BROWSERBASE_SESSION_RELEASE_TIMEOUT_MS = 10_000;

const withDeadline = async <T>(
  operation: Promise<T>,
  timeoutMs: number,
  error: InspectionBrowserStartupError,
) => {
  let timeout: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(error), timeoutMs);
    timeout.unref?.();
  });

  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const toBrowserbaseStartupError = (error: unknown) => {
  if (error instanceof InspectionBrowserStartupError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("unauthorized") ||
    normalizedMessage.includes("api key") ||
    normalizedMessage.includes("401")
  ) {
    return new InspectionBrowserStartupError(
      "Browserbase rejected the configured credentials.",
      "Browserbase rejected the configured API key or project ID. Verify both values and try again.",
      { cause: error },
    );
  }

  if (
    normalizedMessage.includes("quota") ||
    normalizedMessage.includes("rate limit") ||
    normalizedMessage.includes("429") ||
    normalizedMessage.includes("concurrent")
  ) {
    return new InspectionBrowserStartupError(
      "Browserbase could not allocate session capacity.",
      "Browserbase could not allocate a session. Check the account quota and concurrent-session limit, then try again.",
      { cause: error },
    );
  }

  if (
    normalizedMessage.includes("timeout") ||
    normalizedMessage.includes("timed out")
  ) {
    return new InspectionBrowserStartupError(
      "Browserbase session creation timed out.",
      "Browserbase did not create a session within 30 seconds. Check Browserbase availability and try again.",
      { cause: error },
    );
  }

  return new InspectionBrowserStartupError(
    "Browserbase browser initialization failed.",
    "Browserbase could not start the inspection browser. Verify the credentials, project, quota, and service availability, then try again.",
    { cause: error },
  );
};

export const createBrowserbaseInspectionBrowser = (
  reportLog: StagehandLogReporter,
  allowedDomains: string[],
): InspectionBrowserHandle => {
  const apiKey = serverEnv.BROWSERBASE_API_KEY;
  const projectId = serverEnv.BROWSERBASE_PROJECT_ID;

  if (!apiKey) {
    throw new InspectionBrowserStartupError(
      "BROWSERBASE_API_KEY is not configured.",
      "Browserbase is selected, but BROWSERBASE_API_KEY is not configured.",
    );
  }

  if (!projectId) {
    throw new InspectionBrowserStartupError(
      "BROWSERBASE_PROJECT_ID is not configured.",
      "Browserbase is selected, but BROWSERBASE_PROJECT_ID is not configured.",
    );
  }

  process.env.BROWSERBASE_SESSION_CREATE_MAX_MS = String(
    BROWSERBASE_SESSION_CREATE_TIMEOUT_MS,
  );

  const browser = new Stagehand({
    ...createSharedStagehandOptions(reportLog),
    env: "BROWSERBASE",
    apiKey,
    projectId,
    keepAlive: false,
    browserbaseSessionCreateParams: {
      timeout: BROWSERBASE_SESSION_TIMEOUT_SECONDS,
      browserSettings: {
        recordSession: false,
        viewport: INSPECTION_VIEWPORT,
      },
      userMetadata: {
        application: "tooltruth",
        purpose: "webmcp-smoke-test",
      },
    },
  });

  return {
    browser,
    provider: "browserbase",
    browserbaseSessionTimeoutMs: BROWSERBASE_SESSION_TIMEOUT_SECONDS * 1_000,
    initialize: async (reportStartup) => {
      reportStartup({
        value: 20,
        message: "Creating and connecting to the Browserbase session",
      });

      const initialization = browser.init();
      try {
        await withDeadline(
          initialization,
          BROWSERBASE_INITIALIZATION_TIMEOUT_MS,
          new InspectionBrowserStartupError(
            "Browserbase browser initialization timed out.",
            "Browserbase did not finish creating and connecting to the browser within 45 seconds.",
          ),
        );
        reportStartup({
          value: 22,
          message: "Installing the Browserbase destination guard",
        });
        await browser.context.setDomainPolicy({ allowedDomains });
        reportStartup({ value: 24, message: "Browserbase browser ready" });
      } catch (error) {
        void initialization
          .then(() => browser.close())
          .catch(() => browser.close().catch(() => undefined));
        void browser.close().catch(() => undefined);
        throw toBrowserbaseStartupError(error);
      }
    },
    closeEnvironment: async () => undefined,
    releaseBrowserbaseSession: async (sessionId) => {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        BROWSERBASE_SESSION_RELEASE_TIMEOUT_MS,
      );
      timeout.unref?.();

      try {
        const response = await fetch(
          `https://api.browserbase.com/v1/sessions/${encodeURIComponent(sessionId)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-BB-API-Key": apiKey,
            },
            body: JSON.stringify({
              projectId,
              status: "REQUEST_RELEASE",
            }),
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          throw new Error(
            `Browserbase session release returned ${response.status}.`,
          );
        }
      } finally {
        clearTimeout(timeout);
      }
    },
  };
};
