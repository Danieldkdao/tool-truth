"use client";

import { useEffect, useState } from "react";

import {
  BrowserPreviewSection,
  BrowserPreviewSectionProgress,
  BrowserPreviewSectionSkeleton,
} from "@/features/inspect/components/browser-preview-section";
import {
  ContractAnalysisSection,
  ContractAnalysisSectionProgress,
  ContractAnalysisSectionSkeleton,
} from "@/features/inspect/components/contract-analysis-section";
import {
  DetectedToolsSection,
  DetectedToolsSectionProgress,
  DetectedToolsSectionSkeleton,
} from "@/features/inspect/components/detected-tools-section";
import {
  ExecutionEvidenceSection,
  ExecutionEvidenceSectionProgress,
  ExecutionEvidenceSectionSkeleton,
} from "@/features/inspect/components/execution-evidence-section";
import type {
  BrowserPreviewData,
  ContractAnalysisData,
  DetectedTool,
  EvidenceTab,
  ExecutionEvidenceData,
  ToolKey,
} from "@/features/inspect/components/inspection-data";
import type {
  InspectionSection,
  MockInspectionStreamEvent,
  SectionProgress,
} from "@/features/inspect/components/inspection-stream";

const initialProgress: Record<InspectionSection, SectionProgress> = {
  tools: {
    value: 5,
    message: "Waiting for the discovery process to begin",
  },
  browser: {
    value: 5,
    message: "Allocating a clean browser session",
  },
  evidence: {
    value: 5,
    message: "Waiting for the baseline snapshot",
  },
  analysis: {
    value: 5,
    message: "Waiting for observed behavior",
  },
};

type InspectionWorkbenchProps = {
  runId: string;
};

export const InspectionWorkbench = ({ runId }: InspectionWorkbenchProps) => {
  const [selectedTool, setSelectedTool] = useState<ToolKey>("preview_order");
  const [activeTab, setActiveTab] = useState<EvidenceTab>("Timeline");
  const [isRunning, setIsRunning] = useState(false);
  const [tools, setTools] = useState<DetectedTool[] | null>(null);
  const [browserData, setBrowserData] =
    useState<BrowserPreviewData | null>(null);
  const [evidenceData, setEvidenceData] =
    useState<ExecutionEvidenceData | null>(null);
  const [analysisData, setAnalysisData] =
    useState<ContractAnalysisData | null>(null);
  const [progress, setProgress] =
    useState<Record<InspectionSection, SectionProgress>>(initialProgress);

  useEffect(() => {
    const source = new EventSource(
      `/api/inspection/${encodeURIComponent(runId)}/events`,
    );

    const handleInspectionEvent = (message: MessageEvent<string>) => {
      let event: MockInspectionStreamEvent;

      try {
        event = JSON.parse(message.data) as MockInspectionStreamEvent;
      } catch {
        return;
      }

      switch (event.kind) {
        case "section.progress":
          setProgress((current) => ({
            ...current,
            [event.section]: event.progress,
          }));
          break;
        case "tools.ready":
          setTools(event.data);
          break;
        case "browser.ready":
          setBrowserData(event.data);
          break;
        case "evidence.ready":
          setEvidenceData(event.data);
          break;
        case "analysis.ready":
          setAnalysisData(event.data);
          break;
        case "run.completed":
          source.close();
          break;
        case "run.connected":
          break;
      }
    };

    source.addEventListener("inspection", handleInspectionEvent);

    source.onerror = () => {
      setProgress((current) => {
        const next = { ...current };

        for (const section of Object.keys(next) as InspectionSection[]) {
          next[section] = {
            ...next[section],
            message: "The mock stream disconnected and is reconnecting",
          };
        }

        return next;
      });
    };

    return () => {
      source.removeEventListener("inspection", handleInspectionEvent);
      source.close();
    };
  }, [runId]);

  const runMockVerification = () => {
    setIsRunning(true);
    window.setTimeout(() => setIsRunning(false), 1100);
  };

  return (
    <main className="inspect-shell min-h-svh bg-card text-base text-foreground">
      {tools ? (
        <DetectedToolsSection
          tools={tools}
          selectedTool={selectedTool}
          onSelectTool={setSelectedTool}
        />
      ) : (
        <DetectedToolsSectionProgress progress={progress.tools} />
      )}

      <section className="inspect-workspace min-w-0 bg-muted/55">
        {browserData ? (
          <BrowserPreviewSection
            data={browserData}
            selectedTool={selectedTool}
          />
        ) : (
          <BrowserPreviewSectionProgress progress={progress.browser} />
        )}

        {evidenceData ? (
          <ExecutionEvidenceSection
            data={evidenceData}
            activeTab={activeTab}
            onActiveTabChange={setActiveTab}
          />
        ) : (
          <ExecutionEvidenceSectionProgress progress={progress.evidence} />
        )}
      </section>

      {analysisData ? (
        <ContractAnalysisSection
          data={analysisData}
          selectedTool={selectedTool}
          isRunning={isRunning}
          onRunVerification={runMockVerification}
        />
      ) : (
        <ContractAnalysisSectionProgress progress={progress.analysis} />
      )}
    </main>
  );
};

export const InspectionWorkbenchSkeleton = () => {
  return (
    <main className="inspect-shell min-h-svh bg-card text-base text-foreground">
      <DetectedToolsSectionSkeleton />

      <section className="inspect-workspace min-w-0 bg-muted/55">
        <BrowserPreviewSectionSkeleton />
        <ExecutionEvidenceSectionSkeleton />
      </section>

      <ContractAnalysisSectionSkeleton />
    </main>
  );
};
