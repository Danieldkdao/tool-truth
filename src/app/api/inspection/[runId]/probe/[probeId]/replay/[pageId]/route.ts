import {
  BrowserbaseReplayRequestError,
  getBrowserbaseReplayPlaylist,
} from "@/features/inspect/server/browserbase-session-replay";
import {
  getFinishedInspectionReplaySession,
  InspectionReplayAccessError,
} from "@/features/inspect/server/inspection-replay-access";

type ReplayPlaylistParams = {
  params: Promise<{ runId: string; probeId: string; pageId: string }>;
};

const responseHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

const errorResponse = (error: unknown) => {
  const knownError =
    error instanceof InspectionReplayAccessError ||
    error instanceof BrowserbaseReplayRequestError;
  if (!knownError) {
    console.error("ToolTruth replay playlist retrieval failed", { error });
  }

  return new Response(
    knownError ? error.message : "The replay playlist could not be loaded.",
    {
      status: knownError ? error.status : 500,
      headers: {
        ...responseHeaders,
        "Content-Type": "text/plain; charset=utf-8",
      },
    },
  );
};

export const GET = async (
  _request: Request,
  { params }: ReplayPlaylistParams,
) => {
  const { runId, probeId, pageId } = await params;

  if (!/^[A-Za-z0-9_-]{1,128}$/.test(pageId)) {
    return new Response("The replay page identifier is invalid.", {
      status: 400,
      headers: {
        ...responseHeaders,
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  try {
    const sessionId = getFinishedInspectionReplaySession(runId, probeId);
    const playlist = await getBrowserbaseReplayPlaylist(sessionId, pageId);
    return new Response(playlist, { headers: responseHeaders });
  } catch (error) {
    return errorResponse(error);
  }
};
