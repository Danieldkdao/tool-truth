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

export type BrowserSessionViewStatus =
  | "creating"
  | "running"
  | "closing"
  | "completed"
  | "failed"
  | "canceled"
  | "timed_out";

export type BrowserSessionView = {
  targetUrl: string;
  status: BrowserSessionViewStatus;
  liveViewUrl: string | null;
  endedAt: number | null;
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
      kind: "browser.session.updated";
      data: BrowserSessionView;
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

export type VerificationStreamEvent =
  | {
      kind: "probe.connected";
      probeId: string;
      toolId: string;
    }
  | {
      kind: "section.progress";
      section: "evidence" | "analysis";
      progress: SectionProgress;
    }
  | {
      kind: "browser.session.updated";
      data: BrowserSessionView;
    }
  | {
      kind: "tool.ready";
      toolId: string;
      data: DetectedTool;
    }
  | {
      kind: "evidence.ready";
      toolId: string;
      data: ExecutionEvidenceData;
    }
  | {
      kind: "analysis.ready";
      toolId: string;
      data: ContractAnalysisData;
    }
  | {
      kind: "probe.failed";
      toolId: string;
      message: string;
    }
  | {
      kind: "probe.completed";
      toolId: string;
    };
