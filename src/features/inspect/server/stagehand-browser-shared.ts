import "server-only";

import type { LogLine, Stagehand } from "@browserbasehq/stagehand";

export const INSPECTION_VIEWPORT = { width: 1440, height: 900 };

export type StagehandLogReporter = (line: LogLine) => void;

export type InspectionBrowserStartupProgress = {
  value: number;
  message: string;
};

export type InspectionBrowserStartupReporter = (
  progress: InspectionBrowserStartupProgress,
) => void;

export type BrowserbaseSessionMetadata = {
  startedAt: number | null;
  endedAt: number | null;
  expiresAt: number | null;
  status: string | null;
  proxyBytes: number | null;
  region: string | null;
};

export type InspectionBrowserHandle = {
  browser: Stagehand;
  provider: "local" | "browserbase";
  browserbaseSessionTimeoutMs?: number;
  initialize: (reportStartup: InspectionBrowserStartupReporter) => Promise<void>;
  refreshDestinationGuard?: () => Promise<void>;
  closeEnvironment: () => Promise<void>;
  requestBrowserbaseLiveViewUrl?: (sessionId: string) => Promise<string>;
  requestBrowserbaseSessionMetadata?: (
    sessionId: string,
  ) => Promise<BrowserbaseSessionMetadata>;
  requestBrowserbaseReplayAvailability?: (
    sessionId: string,
  ) => Promise<boolean>;
  releaseBrowserbaseSession?: (sessionId: string) => Promise<void>;
};

export class InspectionBrowserStartupError extends Error {
  readonly publicMessage: string;

  constructor(message: string, publicMessage: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "InspectionBrowserStartupError";
    this.publicMessage = publicMessage;
  }
}

export const createSharedStagehandOptions = (
  reportLog: StagehandLogReporter,
) => {
  return {
    disableAPI: true,
    disablePino: true,
    logger: reportLog,
    verbose: 2 as const,
  };
};

export const getInspectionBrowserFailureMessage = (error: unknown) => {
  if (error instanceof InspectionBrowserStartupError) {
    return error.publicMessage;
  }

  return "The website could not be opened in the inspection browser, or its WebMCP tools could not be read.";
};
