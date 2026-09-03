"use client";

import Hls from "hls.js";
import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type ReplayPage = {
  pageId: string;
  label: string;
  startTimeMs: number;
  endTimeMs: number;
  playlistUrl: string;
};

type ReplayMetadataState =
  | { status: "loading" }
  | { status: "ready"; pages: ReplayPage[] }
  | { status: "error"; message: string };

type SessionReplayPlayerProps = {
  runId: string;
  probeId: string;
};

const readErrorMessage = async (response: Response) => {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
  } catch {
    // The safe fallback below is used for non-JSON upstream failures.
  }

  return "The Browserbase session replay could not be loaded.";
};

const formatDuration = (startTimeMs: number, endTimeMs: number) => {
  const totalSeconds = Math.max(0, Math.round((endTimeMs - startTimeMs) / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const ReplayVideo = ({ source }: { source: string }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | undefined;
    const handleVideoError = () => {
      setPlaybackError(
        "The replay stream could not be played. Request a fresh playlist and try again.",
      );
    };

    if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) handleVideoError();
      });
      hls.loadSource(source);
      hls.attachMedia(video);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = source;
      video.addEventListener("error", handleVideoError);
    } else {
      queueMicrotask(() => {
        setPlaybackError("This browser does not support HLS session replay.");
      });
    }

    return () => {
      video.removeEventListener("error", handleVideoError);
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [source]);

  return (
    <div className="space-y-3">
      <video
        ref={videoRef}
        controls
        muted
        playsInline
        preload="metadata"
        className="aspect-video w-full rounded-lg border border-border bg-black shadow-sm"
        aria-label="Browserbase session replay"
      />
      {playbackError && (
        <p className="border-l-2 border-destructive pl-3 text-destructive">
          {playbackError}
        </p>
      )}
    </div>
  );
};

const SessionReplayRequest = ({
  runId,
  probeId,
  onRetry,
}: SessionReplayPlayerProps & { onRetry: () => void }) => {
  const [metadata, setMetadata] = useState<ReplayMetadataState>({
    status: "loading",
  });
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const loadReplay = async () => {
      try {
        const response = await fetch(
          `/api/inspection/${encodeURIComponent(runId)}/probe/${encodeURIComponent(probeId)}/replay`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) throw new Error(await readErrorMessage(response));

        const body = (await response.json()) as { pages?: unknown };
        if (!Array.isArray(body.pages) || body.pages.length === 0) {
          throw new Error("The session replay contains no recorded browser tabs.");
        }

        const pages = body.pages as ReplayPage[];
        setMetadata({ status: "ready", pages });
        setSelectedPageId(pages[0]?.pageId ?? null);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMetadata({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "The Browserbase session replay could not be loaded.",
        });
      }
    };

    void loadReplay();
    return () => controller.abort();
  }, [probeId, runId]);

  if (metadata.status === "loading") {
    return (
      <div className="flex min-h-44 items-center justify-center gap-3 text-muted-foreground">
        <Spinner className="size-5 text-primary" />
        <p>Preparing the recorded Browserbase session…</p>
      </div>
    );
  }

  if (metadata.status === "error") {
    return (
      <div className="flex min-h-44 flex-col items-start justify-center gap-4">
        <p className="border-l-2 border-destructive pl-4 leading-7 text-destructive">
          {metadata.message}
        </p>
        <Button type="button" variant="outline" onClick={onRetry}>
          <RefreshCw />
          Retry replay
        </Button>
      </div>
    );
  }

  const selectedPage =
    metadata.pages.find((page) => page.pageId === selectedPageId) ??
    metadata.pages[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">Browserbase session replay</p>
          <p className="mt-1 text-muted-foreground">
            Recorded execution · {formatDuration(selectedPage.startTimeMs, selectedPage.endTimeMs)}
          </p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onRetry}>
          <RefreshCw />
          Refresh
        </Button>
      </div>

      {metadata.pages.length > 1 && (
        <div className="flex flex-wrap gap-2" aria-label="Recorded browser tabs">
          {metadata.pages.map((page) => (
            <Button
              key={page.pageId}
              type="button"
              size="sm"
              variant={page.pageId === selectedPage.pageId ? "default" : "outline"}
              onClick={() => setSelectedPageId(page.pageId)}
            >
              {page.label}
            </Button>
          ))}
        </div>
      )}

      <ReplayVideo key={selectedPage.playlistUrl} source={selectedPage.playlistUrl} />
      <p className="text-sm leading-6 text-muted-foreground">
        ToolTruth retrieves a fresh playlist through its backend. Browserbase credentials are never sent to this browser.
      </p>
    </div>
  );
};

export const SessionReplayPlayer = ({
  runId,
  probeId,
}: SessionReplayPlayerProps) => {
  const [requestAttempt, setRequestAttempt] = useState(0);

  return (
    <SessionReplayRequest
      key={requestAttempt}
      runId={runId}
      probeId={probeId}
      onRetry={() => setRequestAttempt((attempt) => attempt + 1)}
    />
  );
};
