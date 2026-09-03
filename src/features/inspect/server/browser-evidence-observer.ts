import "server-only";

import type { Page, Stagehand } from "@browserbasehq/stagehand";

const MAX_CAPTURED_NETWORK_ENTRIES = 1_000;
const MAX_RUNTIME_ERRORS = 100;

export type ObservedNetworkEntry = {
  type: string;
  method: string;
  url: string;
  status: number;
  durationMs: number;
  postData?: string;
  error?: string;
};

export type ObservedRuntimeError = {
  type: string;
  message: string;
  source?: string;
};

export type BrowserEvidenceSnapshot = {
  network: ObservedNetworkEntry[];
  runtimeErrors: ObservedRuntimeError[];
};

type CdpSession = ReturnType<Page["getSessionForFrame"]>;

type RequestWillBeSentEvent = {
  requestId: string;
  timestamp: number;
  type?: string;
  request: {
    url: string;
    method: string;
    postData?: string;
  };
  redirectResponse?: { status: number };
};

type ResponseReceivedEvent = {
  requestId: string;
  response: { status: number };
};

type LoadingFinishedEvent = {
  requestId: string;
  timestamp: number;
};

type LoadingFailedEvent = {
  requestId: string;
  timestamp: number;
  errorText: string;
};

type ExceptionThrownEvent = {
  exceptionDetails: {
    text: string;
    url?: string;
    exception?: { description?: string; value?: unknown };
  };
};

type AttachedToTargetEvent = {
  sessionId: string;
  targetInfo: { type: string };
};

type PendingRequest = {
  type: string;
  method: string;
  url: string;
  startedAt: number;
  status: number;
  postData?: string;
};

type InstalledSession = {
  session: CdpSession;
  requestWillBeSent: (event: RequestWillBeSentEvent) => void;
  responseReceived: (event: ResponseReceivedEvent) => void;
  loadingFinished: (event: LoadingFinishedEvent) => void;
  loadingFailed: (event: LoadingFailedEvent) => void;
  exceptionThrown: (event: ExceptionThrownEvent) => void;
};

export type BrowserEvidenceObserver = {
  refresh: () => Promise<void>;
  reset: () => void;
  snapshot: () => BrowserEvidenceSnapshot;
  dispose: () => Promise<void>;
};

const requestKey = (session: CdpSession, requestId: string) => {
  return `${session.id ?? "root"}:${requestId}`;
};

export const createBrowserEvidenceObserver = async (
  page: Page,
  context: Stagehand["context"],
): Promise<BrowserEvidenceObserver> => {
  const installedSessions = new Map<CdpSession, InstalledSession>();
  const pendingRequests = new Map<string, PendingRequest>();
  let network: ObservedNetworkEntry[] = [];
  let runtimeErrors: ObservedRuntimeError[] = [];
  let fatalError: Error | undefined;
  let disposed = false;

  const appendNetwork = (entry: ObservedNetworkEntry) => {
    if (network.length < MAX_CAPTURED_NETWORK_ENTRIES) network.push(entry);
  };

  const finishRequest = (
    session: CdpSession,
    requestId: string,
    finishedAt: number,
    error?: string,
  ) => {
    const key = requestKey(session, requestId);
    const pending = pendingRequests.get(key);
    if (!pending) return;

    pendingRequests.delete(key);
    appendNetwork({
      type: pending.type,
      method: pending.method,
      url: pending.url,
      status: error ? 0 : pending.status,
      durationMs: Math.max(0, (finishedAt - pending.startedAt) * 1_000),
      postData: pending.postData,
      error,
    });
  };

  const rememberFatalError = (error: unknown) => {
    fatalError =
      error instanceof Error
        ? error
        : new Error("Browser evidence capture could not be installed.");
  };

  const installSession = async (session: CdpSession) => {
    if (installedSessions.has(session)) return;

    const requestWillBeSent = (event: RequestWillBeSentEvent) => {
      const key = requestKey(session, event.requestId);
      if (event.redirectResponse) {
        const redirected = pendingRequests.get(key);
        if (redirected) redirected.status = event.redirectResponse.status;
        finishRequest(session, event.requestId, event.timestamp);
      }

      pendingRequests.set(key, {
        type: event.type?.toLowerCase() ?? "other",
        method: event.request.method.toUpperCase(),
        url: event.request.url,
        startedAt: event.timestamp,
        status: 0,
        postData: event.request.postData?.slice(0, 4_000),
      });
    };
    const responseReceived = (event: ResponseReceivedEvent) => {
      const pending = pendingRequests.get(requestKey(session, event.requestId));
      if (pending) pending.status = event.response.status;
    };
    const loadingFinished = (event: LoadingFinishedEvent) => {
      finishRequest(session, event.requestId, event.timestamp);
    };
    const loadingFailed = (event: LoadingFailedEvent) => {
      finishRequest(session, event.requestId, event.timestamp, event.errorText);
    };
    const exceptionThrown = (event: ExceptionThrownEvent) => {
      if (runtimeErrors.length >= MAX_RUNTIME_ERRORS) return;
      const details = event.exceptionDetails;
      runtimeErrors.push({
        type: "exception",
        message:
          details.exception?.description ??
          String(details.exception?.value ?? details.text),
        source: details.url,
      });
    };

    session.on("Network.requestWillBeSent", requestWillBeSent);
    session.on("Network.responseReceived", responseReceived);
    session.on("Network.loadingFinished", loadingFinished);
    session.on("Network.loadingFailed", loadingFailed);
    session.on("Runtime.exceptionThrown", exceptionThrown);
    installedSessions.set(session, {
      session,
      requestWillBeSent,
      responseReceived,
      loadingFinished,
      loadingFailed,
      exceptionThrown,
    });

    try {
      await Promise.all([
        session.send("Network.enable"),
        session.send("Runtime.enable"),
      ]);
    } catch (error) {
      session.off("Network.requestWillBeSent", requestWillBeSent);
      session.off("Network.responseReceived", responseReceived);
      session.off("Network.loadingFinished", loadingFinished);
      session.off("Network.loadingFailed", loadingFailed);
      session.off("Runtime.exceptionThrown", exceptionThrown);
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

  const reset = () => {
    network = [];
    runtimeErrors = [];
    pendingRequests.clear();
  };

  const snapshot = () => {
    if (fatalError) throw fatalError;
    return {
      network: network.map((entry) => ({ ...entry })),
      runtimeErrors: runtimeErrors.map((entry) => ({ ...entry })),
    };
  };

  const dispose = async () => {
    disposed = true;
    clearInterval(refreshInterval);
    context.conn.off("Target.attachedToTarget", attachedToTarget);
    for (const installed of installedSessions.values()) {
      installed.session.off("Network.requestWillBeSent", installed.requestWillBeSent);
      installed.session.off("Network.responseReceived", installed.responseReceived);
      installed.session.off("Network.loadingFinished", installed.loadingFinished);
      installed.session.off("Network.loadingFailed", installed.loadingFailed);
      installed.session.off("Runtime.exceptionThrown", installed.exceptionThrown);
    }
    installedSessions.clear();
    pendingRequests.clear();
  };

  await refresh();
  return { refresh, reset, snapshot, dispose };
};
