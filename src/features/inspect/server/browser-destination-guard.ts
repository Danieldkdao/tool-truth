import "server-only";

import type { Page, Stagehand } from "@browserbasehq/stagehand";

import {
  parseInspectionUrl,
  validateInspectionHostname,
} from "@/features/inspect/server/validate-inspection-url";

type CdpSession = ReturnType<Page["getSessionForFrame"]>;

type RequestPausedEvent = {
  requestId: string;
  request: {
    url: string;
  };
};

type AttachedToTargetEvent = {
  sessionId: string;
  targetInfo: { type: string };
};

type InstalledSession = {
  session: CdpSession;
  requestPaused: (event: RequestPausedEvent) => void;
};

export type BrowserDestinationGuard = {
  refresh: () => Promise<void>;
  dispose: () => Promise<void>;
};

const FETCH_PATTERNS = [
  { urlPattern: "http://*/*", requestStage: "Request" },
  { urlPattern: "https://*/*", requestStage: "Request" },
];

export const createBrowserDestinationGuard = async (
  page: Page,
  context: Stagehand["context"],
): Promise<BrowserDestinationGuard> => {
  const installedSessions = new Map<CdpSession, InstalledSession>();
  const hostnameValidations = new Map<string, Promise<void>>();
  let fatalError: Error | undefined;
  let disposed = false;

  const validateDestination = async (url: string) => {
    const { hostname } = parseInspectionUrl(url);
    let validation = hostnameValidations.get(hostname);

    if (!validation) {
      validation = validateInspectionHostname(hostname)
        .then(() => undefined)
        .finally(() => {
          if (hostnameValidations.get(hostname) === validation) {
            hostnameValidations.delete(hostname);
          }
        });
      hostnameValidations.set(hostname, validation);
    }

    await validation;
  };

  const rememberFatalError = (error: unknown) => {
    if (disposed) return;
    fatalError =
      error instanceof Error
        ? error
        : new Error("The browser destination guard stopped unexpectedly.");
  };

  const continueRequest = async (
    session: CdpSession,
    event: RequestPausedEvent,
  ) => {
    try {
      await validateDestination(event.request.url);
      await session.send("Fetch.continueRequest", {
        requestId: event.requestId,
      });
    } catch {
      await session
        .send("Fetch.failRequest", {
          requestId: event.requestId,
          errorReason: "BlockedByClient",
        })
        .catch(rememberFatalError);
    }
  };

  const installSession = async (session: CdpSession) => {
    if (installedSessions.has(session)) return;

    const requestPaused = (event: RequestPausedEvent) => {
      void continueRequest(session, event).catch(rememberFatalError);
    };

    session.on("Fetch.requestPaused", requestPaused);
    installedSessions.set(session, { session, requestPaused });

    try {
      await session.send("Fetch.enable", { patterns: FETCH_PATTERNS });
    } catch (error) {
      session.off("Fetch.requestPaused", requestPaused);
      installedSessions.delete(session);
      throw error;
    }
  };

  const refresh = async () => {
    if (disposed) return;
    if (fatalError) throw fatalError;

    const sessions = new Set(
      page.listAllFrameIds().map((frameId) => page.getSessionForFrame(frameId)),
    );
    sessions.add(page.getSessionForFrame(page.mainFrameId()));
    await Promise.all([...sessions].map(installSession));

    if (fatalError) throw fatalError;
  };

  const attachedToTarget = (event: AttachedToTargetEvent) => {
    if (event.targetInfo.type !== "iframe" && event.targetInfo.type !== "page") {
      return;
    }

    const session = context.conn.getSession(event.sessionId);
    if (session) void installSession(session).catch(rememberFatalError);
  };

  context.conn.on("Target.attachedToTarget", attachedToTarget);
  const refreshInterval = setInterval(() => {
    void refresh().catch(rememberFatalError);
  }, 100);
  refreshInterval.unref?.();

  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    clearInterval(refreshInterval);
    context.conn.off("Target.attachedToTarget", attachedToTarget);
    hostnameValidations.clear();

    for (const installed of installedSessions.values()) {
      installed.session.off("Fetch.requestPaused", installed.requestPaused);
    }
    installedSessions.clear();
  };

  try {
    await refresh();
  } catch (error) {
    await dispose();
    throw error;
  }

  return { refresh, dispose };
};
