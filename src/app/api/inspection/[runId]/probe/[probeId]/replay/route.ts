import {
  BrowserbaseReplayRequestError,
  getBrowserbaseReplayPages,
} from "@/features/inspect/server/browserbase-session-replay";
import {
  getFinishedInspectionReplaySession,
  InspectionReplayAccessError,
} from "@/features/inspect/server/inspection-replay-access";

type ReplayParams = {
  params: Promise<{ runId: string; probeId: string }>;
};

const responseHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

const errorResponse = (error: unknown) => {
  if (
    error instanceof InspectionReplayAccessError ||
    error instanceof BrowserbaseReplayRequestError
  ) {
    return Response.json(
      { error: error.message },
      { status: error.status, headers: responseHeaders },
    );
  }

  console.error("ToolTruth replay metadata retrieval failed", { error });
  return Response.json(
    { error: "The session replay could not be loaded." },
    { status: 500, headers: responseHeaders },
  );
};

export const GET = async (_request: Request, { params }: ReplayParams) => {
  const { runId, probeId } = await params;

  try {
    const sessionId = getFinishedInspectionReplaySession(runId, probeId);
    const pages = await getBrowserbaseReplayPages(sessionId);
    const routePrefix = `/api/inspection/${encodeURIComponent(runId)}/probe/${encodeURIComponent(probeId)}/replay`;

    return Response.json(
      {
        pages: pages.map((page, index) => ({
          ...page,
          label: `Recorded tab ${index + 1}`,
          playlistUrl: `${routePrefix}/${encodeURIComponent(page.pageId)}`,
        })),
      },
      { headers: responseHeaders },
    );
  } catch (error) {
    return errorResponse(error);
  }
};
