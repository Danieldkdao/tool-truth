import { Download, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type {
  ContractAnalysisData,
  ToolKey,
} from "@/features/inspect/components/inspection-data";
import type { SectionProgress } from "@/features/inspect/components/inspection-stream";

type ContractAnalysisSectionProps = {
  data: ContractAnalysisData;
  selectedTool: ToolKey;
  isRunning: boolean;
  onRunVerification: () => void;
};

export const ContractAnalysisSection = ({
  data,
  selectedTool,
  isRunning,
  onRunVerification,
}: ContractAnalysisSectionProps) => {
  const finding = data.findings[selectedTool];

  return (
    <aside className="inspect-analysis border-t border-border bg-card">
      <section className="border-b border-destructive/20 bg-destructive/[0.055] px-6 py-6">
        <p className="text-muted-foreground">Contract analysis</p>
        <h2 className="mt-3 font-sans text-2xl font-semibold leading-8 tracking-tight">
          {finding.title}
        </h2>
        <div className="mt-5 border-l-4 border-destructive bg-card/70 px-4 py-3">
          <p className="font-semibold text-destructive">Verification failed</p>
          <p className="mt-1 leading-7 text-foreground/80">
            {data.unexpectedStateChanges} unexpected state changes were
            observed.
          </p>
        </div>
      </section>

      <section className="space-y-4 px-6 py-6">
        <div className="border-l-4 border-primary bg-primary/[0.055] px-4 py-4">
          <h3 className="font-sans font-semibold text-primary">
            Declared behavior
          </h3>
          <p className="mt-2 leading-7 text-muted-foreground">
            {finding.declared}
          </p>
        </div>

        <div className="border-l-4 border-destructive bg-destructive/[0.055] px-4 py-4">
          <h3 className="font-sans font-semibold text-destructive">
            Observed behavior
          </h3>
          <p className="mt-2 leading-7 text-foreground">{finding.observed}</p>
        </div>
      </section>

      <section className="border-t border-border bg-accent/35 px-6 py-6">
        <div className="flex items-center justify-between gap-4">
          <h3 className="font-sans font-semibold">Probe configuration</h3>
          <p className="text-muted-foreground">{data.sandboxLabel}</p>
        </div>

        <dl className="mt-4 divide-y divide-border border-y border-border">
          <div className="py-3">
            <dt className="text-muted-foreground">Tool</dt>
            <dd className="mt-1 break-all font-mono">{selectedTool}</dd>
          </div>
          <div className="py-3">
            <dt className="text-muted-foreground">{finding.parameter}</dt>
            <dd className="mt-1 break-all font-mono">{finding.value}</dd>
          </div>
          <div className="py-3">
            <dt className="text-muted-foreground">quantity</dt>
            <dd className="mt-1 font-mono">1</dd>
          </div>
        </dl>

        <Button
          size="lg"
          onClick={onRunVerification}
          disabled={isRunning}
          className="mt-5 min-h-12 w-full rounded-lg px-4 text-base font-semibold disabled:cursor-wait"
        >
          <Play className="size-4" fill="currentColor" aria-hidden="true" />
          {isRunning ? "Running verification…" : "Run verification"}
        </Button>
      </section>

      <section className="border-t border-border px-6 py-6">
        <h3 className="font-sans font-semibold">Suggested repair</h3>
        <p className="mt-3 leading-7 text-muted-foreground">
          {data.suggestedRepair}
        </p>
        <Button
          variant="link"
          className="mt-4 min-h-10 px-0 text-base font-semibold"
        >
          Review proposed change
        </Button>
      </section>

      <section className="border-t border-border px-6 py-5">
        <Button
          variant="ghost"
          className="min-h-10 px-0 text-base font-semibold text-muted-foreground hover:bg-transparent hover:text-foreground"
        >
          <Download className="size-4" aria-hidden="true" />
          Export evidence receipt
        </Button>
      </section>
    </aside>
  );
};

type ContractAnalysisSectionProgressProps = {
  progress: SectionProgress;
};

export const ContractAnalysisSectionProgress = ({
  progress,
}: ContractAnalysisSectionProgressProps) => {
  return (
    <aside
      className="inspect-analysis border-t border-border bg-card"
      aria-busy="true"
      aria-label="Analyzing the tool contract"
    >
      <section className="border-b border-primary/20 bg-primary/[0.045] px-6 py-6">
        <div className="flex items-center gap-3">
          <Spinner className="size-5 text-primary" />
          <p className="text-muted-foreground">Contract analysis</p>
        </div>
        <h2 className="mt-3 font-sans text-2xl font-semibold leading-8 tracking-tight">
          Comparing declared and observed behavior
        </h2>
      </section>

      <section className="px-6 py-6">
        <Progress value={progress.value} className="gap-2">
          <ProgressLabel className="text-base leading-6">
            {progress.message}
          </ProgressLabel>
          <ProgressValue className="text-base" />
        </Progress>

        <div className="mt-7 space-y-4">
          <div className="border-l-4 border-primary bg-primary/[0.055] px-4 py-4">
            <p className="font-semibold text-primary">Declared contract</p>
            <p className="mt-2 leading-7 text-muted-foreground">
              Reading the tool description and annotations…
            </p>
          </div>
          <div className="border-l-4 border-border bg-muted/45 px-4 py-4">
            <p className="font-semibold">Observed behavior</p>
            <p className="mt-2 leading-7 text-muted-foreground">
              Waiting for runtime evidence…
            </p>
          </div>
        </div>
      </section>
    </aside>
  );
};

export const ContractAnalysisSectionSkeleton = () => {
  return (
    <aside
      className="inspect-analysis border-t border-border bg-card"
      aria-label="Loading contract analysis"
    >
      <section className="border-b border-border px-6 py-6">
        <Skeleton className="h-5 w-32 rounded-md" />
        <Skeleton className="mt-4 h-8 w-full rounded-lg" />
        <Skeleton className="mt-3 h-8 w-4/5 rounded-lg" />
        <Skeleton className="mt-6 h-20 w-full rounded-lg" />
      </section>

      <section className="space-y-4 px-6 py-6">
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-28 w-full rounded-lg" />
      </section>

      <section className="border-t border-border bg-accent/25 px-6 py-6">
        <Skeleton className="h-6 w-40 rounded-md" />
        <Skeleton className="mt-5 h-36 w-full rounded-lg" />
        <Skeleton className="mt-5 h-12 w-full rounded-lg" />
      </section>
    </aside>
  );
};
