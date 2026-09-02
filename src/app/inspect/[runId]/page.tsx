import { InspectionWorkbench } from "@/features/inspect/components/inspection-workbench";
import { ParamsId } from "@/lib/types";
import { Suspense } from "react";

// import { InspectionErrorState } from "@/features/inspect/components/inspection-error-state";

// <InspectionErrorState
//   title="We couldn’t open this inspection"
//   description="This inspection is no longer available, but you can retry the request or start a new session from the homepage."
//   reason="The run may have expired, the target website may be unreachable, or the inspection service may have stopped before the session completed."
//   retryLabel="Retry inspection"
// />

type InspectPageProps = ParamsId<"runId">;

const InspectPage = (props: InspectPageProps) => {
  return (
    <Suspense fallback={<InspectPageLoading />}>
      <InspectPageSuspense {...props} />
    </Suspense>
  );
};

const InspectPageLoading = () => {
  return <div>loading</div>;
};

const InspectPageSuspense = async ({ params }: InspectPageProps) => {
  const { runId } = await params;
  return <InspectionWorkbench />;
};

export default InspectPage;
