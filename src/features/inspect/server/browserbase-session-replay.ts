import "server-only";

import { serverEnv } from "@/data/env/server";

const BROWSERBASE_API_ORIGIN = "https://api.browserbase.com";
const BROWSERBASE_REPLAY_TIMEOUT_MS = 10_000;

type BrowserbaseReplayMetadataPayload = {
  pages?: unknown;
};

export type BrowserbaseReplayPage = {
  pageId: string;
  startTimeMs: number;
  endTimeMs: number;
};

export class BrowserbaseReplayRequestError extends Error {
  readonly status: number;

  constructor(message: string, status = 502, options?: ErrorOptions) {
    super(message, options);
    this.name = "BrowserbaseReplayRequestError";
    this.status = status;
  }
}

const requestBrowserbaseReplay = async (path: string, accept: string) => {
  const apiKey = serverEnv.BROWSERBASE_API_KEY;
  if (!apiKey) {
    throw new BrowserbaseReplayRequestError(
      "Browserbase replay is not configured.",
      503,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    BROWSERBASE_REPLAY_TIMEOUT_MS,
  );
  timeout.unref?.();

  try {
    const response = await fetch(`${BROWSERBASE_API_ORIGIN}${path}`, {
      headers: {
        Accept: accept,
        "X-BB-API-Key": apiKey,
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      const status =
        response.status === 404
          ? 404
          : response.status === 429
            ? 429
            : response.status >= 500
              ? 502
              : 500;
      throw new BrowserbaseReplayRequestError(
        response.status === 404
          ? "The session replay is still processing or is unavailable."
          : response.status === 429
            ? "Browserbase replay is temporarily rate limited."
            : "Browserbase could not return the session replay.",
        status,
      );
    }

    return response;
  } catch (error) {
    if (error instanceof BrowserbaseReplayRequestError) throw error;

    throw new BrowserbaseReplayRequestError(
      error instanceof DOMException && error.name === "AbortError"
        ? "Browserbase replay retrieval timed out."
        : "Browserbase replay could not be reached.",
      502,
      { cause: error },
    );
  } finally {
    clearTimeout(timeout);
  }
};

const toReplayPage = (value: unknown): BrowserbaseReplayPage | null => {
  if (!value || typeof value !== "object") return null;

  const page = value as Record<string, unknown>;
  const pageId =
    typeof page.pageId === "string" || typeof page.pageId === "number"
      ? String(page.pageId)
      : "";
  const startTimeMs = Number(page.startTimeMs);
  const endTimeMs = Number(page.endTimeMs);

  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(pageId) ||
    !Number.isFinite(startTimeMs) ||
    !Number.isFinite(endTimeMs) ||
    startTimeMs < 0 ||
    endTimeMs < startTimeMs
  ) {
    return null;
  }

  return { pageId, startTimeMs, endTimeMs };
};

export const getBrowserbaseReplayPages = async (sessionId: string) => {
  const response = await requestBrowserbaseReplay(
    `/v1/sessions/${encodeURIComponent(sessionId)}/replays`,
    "application/json",
  );
  const payload = (await response.json()) as BrowserbaseReplayMetadataPayload;
  const pages = Array.isArray(payload.pages)
    ? payload.pages
        .map(toReplayPage)
        .filter((page): page is BrowserbaseReplayPage => page !== null)
    : [];

  if (pages.length === 0) {
    throw new BrowserbaseReplayRequestError(
      "The session replay is still processing or contains no recorded tabs.",
      404,
    );
  }

  return pages;
};

export const getBrowserbaseReplayPlaylist = async (
  sessionId: string,
  pageId: string,
) => {
  const response = await requestBrowserbaseReplay(
    `/v1/sessions/${encodeURIComponent(sessionId)}/replays/${encodeURIComponent(pageId)}`,
    "application/vnd.apple.mpegurl, application/x-mpegURL, text/plain",
  );
  const playlist = await response.text();

  if (!playlist.trimStart().startsWith("#EXTM3U")) {
    throw new BrowserbaseReplayRequestError(
      "Browserbase returned an invalid replay playlist.",
    );
  }

  return playlist;
};
