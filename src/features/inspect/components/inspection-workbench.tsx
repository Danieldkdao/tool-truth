"use client";

import { useState } from "react";

import { BrowserPreviewSection } from "@/features/inspect/components/browser-preview-section";
import { ContractAnalysisSection } from "@/features/inspect/components/contract-analysis-section";
import { DetectedToolsSection } from "@/features/inspect/components/detected-tools-section";
import { ExecutionEvidenceSection } from "@/features/inspect/components/execution-evidence-section";
import {
  findings,
  type EvidenceTab,
  type ToolKey,
} from "@/features/inspect/components/inspection-data";

export function InspectionWorkbench() {
  const [selectedTool, setSelectedTool] = useState<ToolKey>("preview_order");
  const [activeTab, setActiveTab] = useState<EvidenceTab>("Timeline");
  const [isRunning, setIsRunning] = useState(false);

  const finding = findings[selectedTool];

  function runMockVerification() {
    setIsRunning(true);
    window.setTimeout(() => setIsRunning(false), 1100);
  }

  return (
    <main className="inspect-shell min-h-svh bg-card text-base text-foreground">
      <DetectedToolsSection
        selectedTool={selectedTool}
        onSelectTool={setSelectedTool}
      />

      <section className="inspect-workspace min-w-0 bg-muted/55">
        <BrowserPreviewSection selectedTool={selectedTool} />
        <ExecutionEvidenceSection
          activeTab={activeTab}
          onActiveTabChange={setActiveTab}
        />
      </section>

      <ContractAnalysisSection
        selectedTool={selectedTool}
        finding={finding}
        isRunning={isRunning}
        onRunVerification={runMockVerification}
      />
    </main>
  );
}
