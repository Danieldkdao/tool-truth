import { z } from "zod";

import {
  createInspectionProbe,
  getInspectionRun,
} from "@/features/inspect/server/inspection-run-store";
import type { ParamsId } from "@/lib/types";

const MAX_REQUEST_BODY_LENGTH = 4096;
const startProbeSchema = z.object({
  toolId: z.string().min(1).max(500),
});

const jsonResponse = (body: unknown, status: number) => {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
};

export const POST = async (
  request: Request,
  { params }: ParamsId<"runId">,
) => {
  const { runId } = await params;
  const run = getInspectionRun(runId);

  if (!run) {
    return jsonResponse(
      { error: "This inspection run was not found or has expired." },
      404,
    );
  }

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return jsonResponse({ error: "Content-Type must be application/json." }, 415);
  }

  const bodyText = await request.text();
  if (bodyText.length > MAX_REQUEST_BODY_LENGTH) {
    return jsonResponse({ error: "The request body is too large." }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return jsonResponse({ error: "The request body must be valid JSON." }, 400);
  }

  const parsedBody = startProbeSchema.safeParse(body);
  if (!parsedBody.success) {
    return jsonResponse({ error: "Select a valid discovered tool." }, 400);
  }

  if (!run.toolDiscovery) {
    return jsonResponse(
      { error: "Tool discovery has not completed yet." },
      409,
    );
  }

  let tools;
  try {
    tools = await run.toolDiscovery;
  } catch {
    return jsonResponse({ error: "Tool discovery did not complete." }, 409);
  }

  if (!tools.some((tool) => tool.id === parsedBody.data.toolId)) {
    return jsonResponse(
      { error: "The selected tool is not part of this inspection run." },
      404,
    );
  }

  const probe = createInspectionProbe(run, parsedBody.data.toolId);

  return jsonResponse(
    {
      probeId: probe.id,
      eventsUrl: `/api/inspection/${encodeURIComponent(run.id)}/probe/${encodeURIComponent(probe.id)}/events`,
    },
    201,
  );
};
