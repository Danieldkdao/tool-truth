import { createHash, timingSafeEqual } from "node:crypto";

import { serverEnv } from "@/data/env/server";
import { inspectFormSchema } from "@/features/inspect/actions/schemas";
import { createInspectionRun } from "@/features/inspect/server/inspection-run-store";
import {
  readRequestBodyWithLimit,
  RequestBodyTooLargeError,
} from "@/features/inspect/server/read-request-body";
import {
  UnsafeInspectionUrlError,
  validateInspectionUrl,
} from "@/features/inspect/server/validate-inspection-url";

const MAX_REQUEST_BODY_LENGTH = 4096;

const createPasswordDigest = (value: string) => {
  return createHash("sha256").update(value, "utf8").digest();
};

const hasValidAccessPassword = (candidate: string) => {
  const configuredPassword = serverEnv.TOOLTRUTH_ACCESS_PASSWORD;
  if (!configuredPassword) return false;

  return timingSafeEqual(
    createPasswordDigest(candidate),
    createPasswordDigest(configuredPassword),
  );
};

const jsonResponse = (body: unknown, status: number) => {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
};

export const POST = async (request: Request) => {
  const contentType = request.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    return jsonResponse(
      { error: "Content-Type must be application/json." },
      415,
    );
  }

  let bodyText: string;
  try {
    bodyText = await readRequestBodyWithLimit(
      request,
      MAX_REQUEST_BODY_LENGTH,
    );
  } catch (error) {
    if (!(error instanceof RequestBodyTooLargeError)) throw error;
    return jsonResponse({ error: "The request body is too large." }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return jsonResponse({ error: "The request body must be valid JSON." }, 400);
  }

  const parsedBody = inspectFormSchema.safeParse(body);
  if (!parsedBody.success) {
    const firstIssue = parsedBody.error.issues[0];
    const field = firstIssue?.path[0] === "password" ? "password" : "url";

    return jsonResponse(
      {
        error: firstIssue?.message ?? "Enter a valid URL and password.",
        field,
      },
      400,
    );
  }

  if (!serverEnv.TOOLTRUTH_ACCESS_PASSWORD) {
    return jsonResponse(
      {
        error: "Inspection access is not configured.",
        field: "password",
      },
      503,
    );
  }

  if (!hasValidAccessPassword(parsedBody.data.password)) {
    return jsonResponse(
      {
        error: "The inspection password is incorrect.",
        field: "password",
      },
      401,
    );
  }

  try {
    const target = await validateInspectionUrl(parsedBody.data.url);
    const run = createInspectionRun(target);

    return jsonResponse(
      {
        runId: run.id,
        expiresAt: new Date(run.expiresAt).toISOString(),
      },
      201,
    );
  } catch (error) {
    if (error instanceof UnsafeInspectionUrlError) {
      return jsonResponse({ error: error.message }, 400);
    }

    console.error("Failed to create inspection run", error);
    return jsonResponse(
      { error: "The inspection session could not be started." },
      503,
    );
  }
};
