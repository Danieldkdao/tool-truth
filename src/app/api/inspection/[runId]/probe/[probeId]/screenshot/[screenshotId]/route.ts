import {
  getInspectionProbe,
  getInspectionProbeScreenshot,
  getInspectionRun,
} from "@/features/inspect/server/inspection-run-store";

type ScreenshotParams = {
  params: Promise<{
    runId: string;
    probeId: string;
    screenshotId: string;
  }>;
};

const responseHeaders = {
  "Cache-Control": "private, no-store",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
};

export const GET = async (_request: Request, { params }: ScreenshotParams) => {
  const { runId, probeId, screenshotId } = await params;
  const run = getInspectionRun(runId);
  const probe = run ? getInspectionProbe(run, probeId) : undefined;
  const screenshot = probe
    ? getInspectionProbeScreenshot(probe, screenshotId)
    : undefined;

  if (!screenshot) {
    return Response.json(
      { error: "This verification screenshot was not found or has expired." },
      { status: 404, headers: responseHeaders },
    );
  }

  const body = Uint8Array.from(screenshot.body).buffer;

  return new Response(body, {
    headers: {
      ...responseHeaders,
      "Content-Length": String(screenshot.bytes),
      "Content-Type": screenshot.contentType,
    },
  });
};
