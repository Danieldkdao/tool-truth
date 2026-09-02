import {
  InspectionWorkbench,
  InspectionWorkbenchSkeleton,
} from "@/features/inspect/components/inspection-workbench";
import { getInspectionRun } from "@/features/inspect/server/inspection-run-store";
import { ParamsId } from "@/lib/types";
import { notFound } from "next/navigation";
import { Suspense } from "react";

type InspectPageProps = ParamsId<"runId">;

const InspectPage = (props: InspectPageProps) => {
  return (
    <Suspense fallback={<InspectPageLoading />}>
      <InspectPageSuspense {...props} />
    </Suspense>
  );
};

const InspectPageLoading = () => {
  return <InspectionWorkbenchSkeleton />;
};

const InspectPageSuspense = async ({ params }: InspectPageProps) => {
  const { runId } = await params;

  if (!getInspectionRun(runId)) {
    notFound();
  }

  return <InspectionWorkbench key={runId} runId={runId} />;
};

export default InspectPage;
