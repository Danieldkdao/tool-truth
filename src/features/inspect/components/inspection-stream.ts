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

export type InspectionStreamEvent =
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
      kind: "tool.discovered";
      data: DetectedTool;
    }
  | {
      kind: "tools.ready";
      data: DetectedTool[];
    }
  | {
      kind: "tools.failed";
      message: string;
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
