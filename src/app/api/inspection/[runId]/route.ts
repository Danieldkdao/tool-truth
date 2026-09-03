import { getInspectionRun } from "@/features/inspect/server/inspection-run-store";
import type { ParamsId } from "@/lib/types";

const RUN_NOT_FOUND_MESSAGE =
  "This inspection run was not found or has expired.";

export const GET = async (
  _request: Request,
  { params }: ParamsId<"runId">,
) => {
  const { runId } = await params;
  const run = getInspectionRun(runId);

  if (!run) {
    return Response.json(
      {
        status: "not_found",
        error: RUN_NOT_FOUND_MESSAGE,
      },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    {
      status: "available",
      runId: run.id,
      expiresAt: new Date(run.expiresAt).toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
};
