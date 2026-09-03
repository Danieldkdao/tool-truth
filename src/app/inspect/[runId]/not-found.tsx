import { InspectionErrorState } from "@/features/inspect/components/inspection-error-state";

const InspectionNotFound = () => {
  return (
    <InspectionErrorState
      title="Inspection not found"
      description="This inspection does not exist or is no longer available."
      reason="The link may be incorrect, or the inspection may have expired after one hour."
      homeLabel="Start a new inspection"
      showRetry={false}
    />
  );
};

export default InspectionNotFound;
