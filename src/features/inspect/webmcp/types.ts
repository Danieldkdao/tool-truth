import type { InspectionSessionController } from "@/features/inspect/hooks/use-inspection-session-controller";

export type GetInspectionSessionController = () => InspectionSessionController;

export type EvidenceView =
  | "timeline"
  | "state_diff"
  | "network"
  | "logs"
  | "statistics"
  | "replay";
