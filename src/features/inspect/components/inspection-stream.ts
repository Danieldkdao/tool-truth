import type {
  BrowserPreviewData,
  ContractAnalysisData,
  DetectedTool,
  ExecutionEvidenceData,
} from "@/features/inspect/components/inspection-data";

export type InspectionSection =
  | "tools"
  | "browser"
  | "evidence"
  | "analysis";

export type SectionProgress = {
  value: number;
  message: string;
};

export type MockInspectionStreamEvent =
  | {
      kind: "run.connected";
      runId: string;
    }
  | {
      kind: "section.progress";
      section: InspectionSection;
      progress: SectionProgress;
    }
  | {
      kind: "tools.ready";
      data: DetectedTool[];
    }
  | {
      kind: "browser.ready";
      data: BrowserPreviewData;
    }
  | {
      kind: "evidence.ready";
      data: ExecutionEvidenceData;
    }
  | {
      kind: "analysis.ready";
      data: ContractAnalysisData;
    }
  | {
      kind: "run.completed";
    };
