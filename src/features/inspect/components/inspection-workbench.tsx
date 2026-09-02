"use client";

import { type ReactNode, useState } from "react";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

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
  DetectedToolsSectionError,
  DetectedToolsSectionProgress,
  DetectedToolsSectionSkeleton,
} from "@/features/inspect/components/detected-tools-section";
import {
  ExecutionEvidenceSection,
  ExecutionEvidenceSectionProgress,
  ExecutionEvidenceSectionSkeleton,
} from "@/features/inspect/components/execution-evidence-section";
import type { EvidenceTab, ToolKey } from "@/features/inspect/components/inspection-data";
import { useInspectionRunStream } from "@/features/inspect/hooks/use-inspection-run-stream";
import { useMediaQuery } from "@/hooks/use-media-query";

const DESKTOP_WORKBENCH_QUERY = "(min-width: 1024px)";

type WorkbenchLayoutProps = {
  toolsPanel: ReactNode;
  browserPanel: ReactNode;
  evidencePanel: ReactNode;
  analysisPanel: ReactNode;
};

const MobileWorkbenchLayout = ({
  toolsPanel,
  browserPanel,
  evidencePanel,
  analysisPanel,
}: WorkbenchLayoutProps) => {
  return (
    <main className="inspect-shell min-h-svh bg-card text-base text-foreground">
      {toolsPanel}

      <section className="inspect-workspace min-w-0 bg-muted/55">
        {browserPanel}
        {evidencePanel}
      </section>

      {analysisPanel}
    </main>
  );
};

const DesktopWorkbenchLayout = ({
  toolsPanel,
  browserPanel,
  evidencePanel,
  analysisPanel,
}: WorkbenchLayoutProps) => {
  return (
    <main className="h-svh min-h-0 overflow-hidden bg-card text-base text-foreground">
      <ResizablePanelGroup
        id="inspection-workbench-columns"
        orientation="horizontal"
        className="h-full min-h-0"
      >
        <ResizablePanel
          id="detected-tools"
          defaultSize="16rem"
          minSize="13rem"
          maxSize="23rem"
          groupResizeBehavior="preserve-pixel-size"
        >
          <div className="h-full min-h-0 overflow-hidden [&>.inspect-tools-panel]:h-full [&>.inspect-tools-panel]:border-r-0">
            {toolsPanel}
          </div>
        </ResizablePanel>

        <ResizableHandle
          withHandle
          aria-label="Resize detected tools panel"
          className="z-20 transition-colors hover:bg-primary/40 focus-visible:bg-primary/40"
        />

        <ResizablePanel id="inspection-workspace" minSize="26rem">
          <ResizablePanelGroup
            id="inspection-workbench-workspace"
            orientation="vertical"
            className="inspect-resizable-workspace h-full min-h-0 bg-muted/55"
          >
            <ResizablePanel
              id="browser-preview"
              defaultSize="65"
              minSize="18rem"
            >
              <div className="flex h-full min-h-0 flex-col overflow-hidden">
                {browserPanel}
              </div>
            </ResizablePanel>

            <ResizableHandle
              withHandle
              aria-label="Resize browser and execution evidence panels"
              className="z-20 transition-colors hover:bg-primary/40 focus-visible:bg-primary/40"
            />

            <ResizablePanel
              id="execution-evidence"
              defaultSize="35"
              minSize="13rem"
              maxSize="55"
            >
              <div className="h-full min-h-0 overflow-hidden">
                {evidencePanel}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>

        <ResizableHandle
          withHandle
          aria-label="Resize contract analysis panel"
          className="z-20 transition-colors hover:bg-primary/40 focus-visible:bg-primary/40"
        />

        <ResizablePanel
          id="contract-analysis"
          defaultSize="20rem"
          minSize="17rem"
          maxSize="30rem"
          groupResizeBehavior="preserve-pixel-size"
        >
          <div className="h-full min-h-0 overflow-y-auto [&>.inspect-analysis]:min-h-full [&>.inspect-analysis]:border-t-0 [&>.inspect-analysis]:border-l-0">
            {analysisPanel}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </main>
  );
};

type InspectionWorkbenchProps = {
  runId: string;
};

export const InspectionWorkbench = ({ runId }: InspectionWorkbenchProps) => {
  const isDesktop = useMediaQuery(DESKTOP_WORKBENCH_QUERY);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EvidenceTab>("Timeline");
  const [isRunning, setIsRunning] = useState(false);
  const {
    tools,
    browserData,
    evidenceData,
    analysisData,
    toolDiscoveryError,
    progress,
  } = useInspectionRunStream(runId);

  const runMockVerification = () => {
    setIsRunning(true);
    window.setTimeout(() => setIsRunning(false), 1100);
  };

  const activeToolId =
    selectedTool && tools?.some((tool) => tool.id === selectedTool)
      ? selectedTool
      : (tools?.[0]?.id ?? null);

  const selectedMockTool: ToolKey =
    activeToolId === "check_inventory" ||
    activeToolId === "summarize_reviews" ||
    activeToolId === "estimate_shipping"
      ? activeToolId
      : "preview_order";

  const toolsPanel = toolDiscoveryError ? (
    <DetectedToolsSectionError message={toolDiscoveryError} />
  ) : tools ? (
    <DetectedToolsSection
      tools={tools}
      selectedTool={activeToolId}
      onSelectTool={setSelectedTool}
    />
  ) : (
    <DetectedToolsSectionProgress progress={progress.tools} />
  );

  const browserPanel = browserData ? (
    <BrowserPreviewSection
      data={browserData}
      selectedTool={selectedMockTool}
    />
  ) : (
    <BrowserPreviewSectionProgress progress={progress.browser} />
  );

  const evidencePanel = evidenceData ? (
    <ExecutionEvidenceSection
      data={evidenceData}
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
    />
  ) : (
    <ExecutionEvidenceSectionProgress progress={progress.evidence} />
  );

  const analysisPanel = analysisData ? (
    <ContractAnalysisSection
      data={analysisData}
      selectedTool={selectedMockTool}
      isRunning={isRunning}
      onRunVerification={runMockVerification}
    />
  ) : (
    <ContractAnalysisSectionProgress progress={progress.analysis} />
  );

  const layoutProps = {
    toolsPanel,
    browserPanel,
    evidencePanel,
    analysisPanel,
  };

  return isDesktop ? (
    <DesktopWorkbenchLayout {...layoutProps} />
  ) : (
    <MobileWorkbenchLayout {...layoutProps} />
  );
};

export const InspectionWorkbenchSkeleton = () => {
  const layoutProps = {
    toolsPanel: <DetectedToolsSectionSkeleton />,
    browserPanel: <BrowserPreviewSectionSkeleton />,
    evidencePanel: <ExecutionEvidenceSectionSkeleton />,
    analysisPanel: <ContractAnalysisSectionSkeleton />,
  };

  return (
    <>
      <div className="lg:hidden">
        <MobileWorkbenchLayout {...layoutProps} />
      </div>
      <div className="hidden h-svh lg:block">
        <DesktopWorkbenchLayout {...layoutProps} />
      </div>
    </>
  );
};
