"use client";

import type { ReactNode } from "react";

import { WebMCPTools } from "@/components/webmcp-tools";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

import {
  BrowserPreviewLiveView,
  BrowserPreviewLocalPlaceholder,
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
  ExecutionEvidenceSectionEmpty,
  ExecutionEvidenceSection,
  ExecutionEvidenceSectionProgress,
  ExecutionEvidenceSectionSkeleton,
} from "@/features/inspect/components/execution-evidence-section";
import { InspectionErrorState } from "@/features/inspect/components/inspection-error-state";
import { useInspectionSessionController } from "@/features/inspect/hooks/use-inspection-session-controller";
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
  const session = useInspectionSessionController(runId);
  const {
    tools,
    browserSession,
    selectedToolId,
    selectedTool,
    activeEvidenceTab,
    selectedVerification,
    verificationRecords,
    verificationStatuses,
    isBusy,
    isRunningAll,
    toolDiscoveryError,
    runError,
    progress,
  } = session.snapshot;

  if (runError) {
    const isNotFound = runError.code === "not_found";

    return (
      <InspectionErrorState
        title={
          isNotFound
            ? "Inspection not found"
            : "We couldn’t open this inspection"
        }
        description={
          isNotFound
            ? "This inspection does not exist or is no longer available."
            : "The inspection service could not establish a connection."
        }
        reason={runError.message}
        homeLabel="Start a new inspection"
        retryLabel="Retry inspection"
        showRetry={!isNotFound}
      />
    );
  }

  const displayTools =
    tools?.map((tool) => {
      const status = verificationRecords[tool.id]?.status;

      return {
        ...tool,
        result:
          status === "running"
            ? "Running verification…"
            : status === "passed"
              ? "Verification passed"
              : status === "failed"
                ? "Verification failed"
                : status === "error"
                  ? "Verification error"
                  : tool.result,
      };
    }) ?? null;
  const toolsPanel = toolDiscoveryError ? (
    <DetectedToolsSectionError message={toolDiscoveryError} />
  ) : displayTools ? (
    <DetectedToolsSection
      tools={displayTools}
      selectedTool={selectedToolId}
      statuses={verificationStatuses}
      isRunningAll={isRunningAll}
      isBusy={isBusy}
      onSelectTool={(toolId) => session.focusEvidence({ toolId })}
      onRunAllVerifications={() => void session.runAllVerifications()}
    />
  ) : (
    <DetectedToolsSectionProgress progress={progress.tools} />
  );

  const activeBrowserSession =
    selectedVerification?.status === "running"
      ? selectedVerification.browserSession
      : (selectedVerification?.browserSession ?? browserSession);
  const browserPanel = activeBrowserSession ? (
    <BrowserPreviewLiveView
      session={activeBrowserSession}
      toolName={selectedTool?.name}
      fallbackScreenshot={
        selectedVerification?.evidenceData?.screenshots?.[
          selectedVerification.evidenceData.screenshots.length - 1
        ]
      }
    />
  ) : tools ? (
    <BrowserPreviewLocalPlaceholder
      toolName={selectedTool?.name}
      verificationStatus={selectedVerification?.status}
    />
  ) : (
    <BrowserPreviewSectionProgress progress={progress.browser} />
  );

  const evidencePanel =
    selectedVerification?.status === "running" ? (
      <ExecutionEvidenceSectionProgress
        progress={selectedVerification.evidenceProgress}
      />
    ) : selectedVerification?.evidenceData && selectedVerification.probeId ? (
      <ExecutionEvidenceSection
        data={selectedVerification.evidenceData}
        runId={runId}
        probeId={selectedVerification.probeId}
        replayAvailable={selectedVerification.browserSession !== null}
        activeTab={activeEvidenceTab}
        onActiveTabChange={(tab) => session.focusEvidence({ tab })}
      />
    ) : (
      <ExecutionEvidenceSectionEmpty
        error={selectedVerification?.error ?? null}
      />
    );

  const analysisPanel = selectedTool ? (
    <ContractAnalysisSection
      data={selectedVerification?.analysisData ?? null}
      selectedTool={selectedTool}
      isRunning={selectedVerification?.status === "running"}
      isBusy={isBusy}
      error={selectedVerification?.error ?? null}
      onRunVerification={() => void session.startVerification()}
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

  return (
    <>
      <WebMCPTools controller={session} />
      {isDesktop ? (
        <DesktopWorkbenchLayout {...layoutProps} />
      ) : (
        <MobileWorkbenchLayout {...layoutProps} />
      )}
    </>
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
