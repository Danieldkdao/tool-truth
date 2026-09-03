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
  DetectedTool,
  Finding,
} from "@/features/inspect/components/inspection-data";
import type { SectionProgress } from "@/features/inspect/components/inspection-stream";

type ContractAnalysisSectionProps = {
  data: ContractAnalysisData | null;
  selectedTool: DetectedTool;
  isRunning: boolean;
  isBusy: boolean;
  error?: string | null;
  onRunVerification: () => void;
};

const getFirstSchemaParameter = (tool: DetectedTool) => {
  let schema = tool.inputSchema;
  if (typeof schema === "string") {
    try {
      schema = JSON.parse(schema) as Record<string, unknown>;
    } catch {
      return "input";
    }
  }

  if (!schema || typeof schema.properties !== "object" || !schema.properties) {
    return "input";
  }

  return Object.keys(schema.properties)[0] ?? "input";
};

const createPendingFinding = (tool: DetectedTool): Finding => {
  return {
    title: `Ready to verify ${tool.name}`,
    declared: tool.description || "No tool description was provided.",
    observed: "No runtime behavior has been recorded for this tool yet.",
    parameter: getFirstSchemaParameter(tool),
    value: "Generated safely from the input schema",
    severity: "info",
  };
};

export const ContractAnalysisSection = ({
  data,
  selectedTool,
  isRunning,
  isBusy,
  error,
  onRunVerification,
}: ContractAnalysisSectionProps) => {
  const recordedFinding = data?.findings[selectedTool.id];
  const finding = recordedFinding ?? createPendingFinding(selectedTool);
  const verdict = error
    ? "error"
    : isRunning
      ? "pending"
      : recordedFinding
        ? data?.verdict
        : "pending";
  const hasFailed = verdict === "failed" || verdict === "error";
  const hasPassed = verdict === "passed";
  const hasSuggestedRepair =
    verdict === "failed" && Boolean(data?.suggestedRepair.trim());
  const canExportEvidenceReceipt =
    verdict === "failed" && Boolean(recordedFinding);

  return (
    <aside className="inspect-analysis border-t border-border bg-card">
      <section
        className={`border-b px-6 py-6 ${
          hasFailed
            ? "border-destructive/20 bg-destructive/[0.055]"
            : hasPassed
              ? "border-emerald-600/20 bg-emerald-600/[0.055]"
              : "border-primary/20 bg-primary/[0.045]"
        }`}
      >
        <p className="text-muted-foreground">Contract analysis</p>
        <h2 className="mt-3 font-sans text-2xl font-semibold leading-8 tracking-tight">
          {isRunning ? "Verification is running" : finding.title}
        </h2>
        <div
          className={`mt-5 border-l-4 bg-card/70 px-4 py-3 ${
            hasFailed
              ? "border-destructive"
              : hasPassed
                ? "border-emerald-600"
                : "border-primary"
          }`}
        >
          <p
            className={`font-semibold ${
              hasFailed
                ? "text-destructive"
                : hasPassed
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-primary"
            }`}
          >
            {error
              ? "Verification error"
              : isRunning
                ? "Collecting runtime evidence"
                : hasPassed
                  ? "Verification passed"
                  : verdict === "failed"
                    ? "Verification failed"
                    : "Ready to run"}
          </p>
          <p className="mt-1 leading-7 text-foreground/80">
            {error ??
              (isRunning
                ? "The local browser is invoking the tool and comparing before-and-after state."
                : verdict === "failed"
                  ? `${data?.unexpectedStateChanges ?? 0} unexpected changes were observed.`
                  : hasPassed
                    ? "No behavioral mismatch was observed in this run."
                    : "Run the selected tool in an isolated browser to test its claims.")}
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

        <div
          className={`border-l-4 px-4 py-4 ${
            hasFailed
              ? "border-destructive bg-destructive/[0.055]"
              : "border-border bg-muted/45"
          }`}
        >
          <h3
            className={`font-sans font-semibold ${hasFailed ? "text-destructive" : "text-foreground"}`}
          >
            Observed behavior
          </h3>
          <p className="mt-2 leading-7 text-foreground">{finding.observed}</p>
        </div>
      </section>

      <section className="border-t border-border bg-accent/35 px-6 py-6">
        <div className="flex items-center justify-between gap-4">
          <h3 className="font-sans font-semibold">Probe configuration</h3>
          <p className="text-muted-foreground">
            {data?.sandboxLabel ?? "Disposable browser"}
          </p>
        </div>

        <dl className="mt-4 divide-y divide-border border-y border-border">
          <div className="py-3">
            <dt className="text-muted-foreground">Tool</dt>
            <dd className="mt-1 break-all font-mono">{selectedTool.name}</dd>
          </div>
          <div className="py-3">
            <dt className="text-muted-foreground">{finding.parameter}</dt>
            <dd className="mt-1 break-all font-mono">{finding.value}</dd>
          </div>
        </dl>

        <Button
          size="lg"
          onClick={onRunVerification}
          disabled={isBusy}
          className="mt-5 min-h-12 w-full rounded-lg px-4 text-base font-semibold disabled:cursor-wait"
        >
          {isBusy ? (
            <Spinner className="size-4" />
          ) : (
            <Play className="size-4" fill="currentColor" aria-hidden="true" />
          )}
          {isRunning
            ? "Running verification…"
            : isBusy
              ? "Verification in progress…"
              : "Run verification"}
        </Button>
      </section>

      <section className="border-t border-border px-6 py-6">
        <h3 className="font-sans font-semibold">Suggested repair</h3>
        <p className="mt-3 leading-7 text-muted-foreground">
          {data?.suggestedRepair ??
            "A repair recommendation will appear after the observed behavior is compared with the tool contract."}
        </p>
        <Button
          variant="link"
          disabled={!hasSuggestedRepair}
          className="mt-4 min-h-10 px-0 text-base font-semibold disabled:text-muted-foreground disabled:no-underline"
        >
          Review proposed change
        </Button>
      </section>

      <section className="border-t border-border px-6 py-5">
        <Button
          variant="ghost"
          disabled={!canExportEvidenceReceipt}
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
