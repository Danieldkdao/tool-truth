import { z } from "zod";

import {
  sanitizeDirectedAssertion,
  sanitizeDirectedTest,
} from "@/features/inspect/lib/directed-redaction";
import {
  sanitizeForExport,
  sanitizeObjectForExport,
} from "@/features/inspect/lib/report-redaction";
import {
  createDirectedInspectionProbe,
  createInspectionProbe,
  DirectedProbeLineageError,
  getInspectionRun,
} from "@/features/inspect/server/inspection-run-store";
import {
  createDirectedInputHash,
  directedVerificationRequestSchema,
  formatZodIssues,
} from "@/features/inspect/server/directed-verification-schema";
import {
  readRequestBodyWithLimit,
  RequestBodyTooLargeError,
} from "@/features/inspect/server/read-request-body";
import { validateDirectedToolInput } from "@/features/inspect/server/tool-schema-validation";
import type { ParamsId } from "@/lib/types";

const MAX_REQUEST_BODY_LENGTH = 32 * 1024;
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

  let bodyText: string;
  try {
    bodyText = await readRequestBodyWithLimit(
      request,
      MAX_REQUEST_BODY_LENGTH,
    );
  } catch (error) {
    if (!(error instanceof RequestBodyTooLargeError)) throw error;
    return jsonResponse(
      {
        status: "validation_error",
        validationIssues: [{ path: "request", message: error.message }],
      },
      413,
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return jsonResponse({ error: "The request body must be valid JSON." }, 400);
  }

  const isRequestObject = Boolean(body) && typeof body === "object";
  const isDirectedRequest =
    isRequestObject &&
    ("request" in (body as object) ||
      "input" in (body as object) ||
      "assertions" in (body as object) ||
      "basedOnProbeId" in (body as object));
  const parsedBody = isDirectedRequest
    ? directedVerificationRequestSchema.safeParse(body)
    : startProbeSchema.safeParse(body);
  if (!parsedBody.success) {
    return jsonResponse(
      isDirectedRequest
        ? {
            status: "validation_error",
            validationIssues: formatZodIssues(parsedBody.error),
          }
        : { error: "Select a valid discovered tool." },
      400,
    );
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

  const selectedTool = tools.find((tool) => tool.id === parsedBody.data.toolId);
  if (!selectedTool) {
    return jsonResponse(
      { error: "The selected tool is not part of this inspection run." },
      404,
    );
  }

  let probe;
  if (isDirectedRequest) {
    const directedRequest = directedVerificationRequestSchema.parse(body);
    const inputHash = createDirectedInputHash(directedRequest.input);
    const validation = validateDirectedToolInput(
      selectedTool,
      directedRequest.input,
    );
    if (!validation.valid) {
      return jsonResponse(
        {
          status: "validation_error",
          test: {
            request: sanitizeForExport(directedRequest.request),
            input: sanitizeObjectForExport(directedRequest.input),
            inputHash,
            assertions: directedRequest.assertions.map(
              sanitizeDirectedAssertion,
            ),
          },
          validationIssues: validation.issues,
        },
        422,
      );
    }

    try {
      probe = createDirectedInspectionProbe(run, selectedTool.id, {
        request: directedRequest.request,
        input: directedRequest.input,
        inputHash,
        assertions: directedRequest.assertions,
        basedOnProbeId: directedRequest.basedOnProbeId,
      });
    } catch (error) {
      if (!(error instanceof DirectedProbeLineageError)) throw error;
      return jsonResponse(
        { status: "error", error: error.message },
        error.status,
      );
    }
  } else {
    probe = createInspectionProbe(run, selectedTool.id);
  }

  return jsonResponse(
    {
      probeId: probe.id,
      directedTest: probe.directedTest
        ? sanitizeDirectedTest(probe.directedTest)
        : undefined,
      eventsUrl: `/api/inspection/${encodeURIComponent(run.id)}/probe/${encodeURIComponent(probe.id)}/events`,
    },
    201,
  );
};
