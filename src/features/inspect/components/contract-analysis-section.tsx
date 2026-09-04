import { BadgeCheck, BadgeX, CircleHelp, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { EvidenceReceiptExportMenu } from "@/features/inspect/components/evidence-receipt-export-menu";
import type {
  ContractAnalysisData,
  DetectedTool,
  Finding,
} from "@/features/inspect/components/inspection-data";
import type { SectionProgress } from "@/features/inspect/components/inspection-stream";
import type { EvidenceReceiptSource } from "@/features/inspect/lib/evidence-receipt";

type ContractAnalysisSectionProps = {
  data: ContractAnalysisData | null;
  selectedTool: DetectedTool;
  isRunning: boolean;
  isBusy: boolean;
  error?: string | null;
  exportSource: EvidenceReceiptSource | null;
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

const formatRegressionValue = (value: string) =>
  value.replaceAll("_", " ");

export const ContractAnalysisSection = ({
  data,
  selectedTool,
  isRunning,
  isBusy,
  error,
  exportSource,
  onRunVerification,
}: ContractAnalysisSectionProps) => {
  const analysisFindings = data ? Object.values(data.findings) : [];
  const recordedFinding =
    data?.findings[selectedTool.id] ??
    (analysisFindings.length === 1 ? analysisFindings[0] : undefined);
  const finding = recordedFinding ?? createPendingFinding(selectedTool);
  const verdict = error
    ? "error"
    : isRunning
      ? "pending"
      : data
        ? data.verdict
        : "pending";
  const hasFailed = verdict === "failed" || verdict === "error";
  const hasPassed = verdict === "passed";
  const isInconclusive = verdict === "inconclusive";
  const isError = verdict === "error";
  const hasRun = Boolean(data || error);

  return (
    <aside className="inspect-analysis border-t border-border bg-card">
      <section
        className={`border-b px-6 py-6 ${
          hasFailed
            ? "border-destructive/20 bg-destructive/[0.055]"
            : hasPassed
              ? "border-emerald-600/20 bg-emerald-600/[0.055]"
              : isInconclusive
                ? "border-amber-600/20 bg-amber-600/[0.055]"
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
                : isInconclusive
                  ? "border-amber-600"
                : "border-primary"
          }`}
        >
          <p
            className={`font-semibold ${
              hasFailed
                ? "text-destructive"
                : hasPassed
                  ? "text-emerald-700 dark:text-emerald-400"
                  : isInconclusive
                    ? "text-amber-700 dark:text-amber-400"
                  : "text-primary"
            }`}
          >
            {error
              ? "Verification error"
              : isRunning
                ? "Collecting runtime evidence"
                : isError
                  ? "Verification error"
                : hasPassed
                  ? "Verification passed"
                  : isInconclusive
                    ? "Verification inconclusive"
                  : verdict === "failed"
                    ? "Verification failed"
                    : "Ready to run"}
          </p>
          <p className="mt-1 leading-7 text-foreground/80">
            {error ??
              (isRunning
                ? "The local browser is invoking the tool and comparing before-and-after state."
                : isError
                  ? "The tool invocation did not complete successfully, so deterministic evidence ended the verification."
                : verdict === "failed"
                  ? data?.decisionBasis === "hard_evidence"
                    ? `${data.deterministic.violations.length} objective contract violation${data.deterministic.violations.length === 1 ? " was" : "s were"} confirmed by deterministic evidence.`
                    : data?.decisionBasis === "adjudication"
                      ? "A conditional adjudicator resolved the evaluator disagreement and found that the observed behavior did not satisfy the declared contract."
                      : "Both semantic evaluators found that the observed behavior did not satisfy the declared contract."
                  : isInconclusive
                    ? data?.decisionBasis === "adjudication"
                      ? "The conditional adjudicator found that the available evidence could not reliably resolve the evaluator disagreement."
                      : data?.consensus === "disagreement"
                        ? "The two semantic evaluators disagreed and adjudication was unavailable, so ToolTruth did not force a verdict."
                      : data?.consensus === "agreement"
                        ? "Both semantic evaluators agreed that the available evidence was insufficient for a reliable verdict."
                        : "Two valid semantic evaluations were not available, so ToolTruth did not force a verdict."
                  : hasPassed
                    ? data?.decisionBasis === "adjudication"
                      ? "A conditional adjudicator resolved the evaluator disagreement and found that the evidence supports the declared behavior."
                      : data?.decisionBasis === "evaluator_consensus"
                      ? "Both semantic evaluators agreed that the evidence supports the declared behavior."
                      : "No behavioral mismatch was observed in this run."
                    : "Run the selected tool in an isolated browser to test its claims.")}
          </p>
        </div>

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
              : hasRun
                ? "Run again"
                : "Run verification"}
        </Button>
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

      {data && (
        <section className="border-t border-border px-6 py-6">
          <h3 className="font-sans font-semibold">Decision basis</h3>
          <p className="mt-2 leading-7 text-muted-foreground">
            {data.decisionBasis === "hard_evidence"
              ? "The deterministic engine found an indisputable result, so AI could explain it but could not override it."
              : data.decisionBasis === "evaluator_consensus"
                ? "No hard violation was found. Two independent semantic evaluations agreed on the final verdict."
                : data.decisionBasis === "adjudication"
                  ? "No hard violation was found. The primary evaluators disagreed, so a conditional third model resolved the disputed claims from the original evidence."
                  : "No hard violation was found, but the semantic evaluation layer could not establish consensus."}
          </p>
          <p className="mt-2 font-medium text-muted-foreground">
            Evidence packet: {data.evidenceStatus}
          </p>

          {data.deterministic.violations.length > 0 && (
            <div className="mt-5 space-y-3">
              <h4 className="font-sans font-semibold">Hard rules triggered</h4>
              {data.deterministic.violations.map((violation) => (
                <article
                  key={violation.id}
                  className="rounded-lg border border-destructive/30 bg-destructive/[0.045] p-4"
                >
                  <p className="font-medium text-destructive">
                    {violation.title}
                  </p>
                  <p className="mt-1 leading-6 text-muted-foreground">
                    {violation.statement}
                  </p>
                  <p className="mt-3 leading-6">
                    <span className="font-medium">Suggested repair:</span>{" "}
                    {violation.suggestedRepair}
                  </p>
                  <p className="mt-2 font-mono text-sm text-muted-foreground">
                    Evidence: {violation.evidenceIds.join(", ")}
                  </p>
                </article>
              ))}
            </div>
          )}

          {data.deterministic.facts.length > 0 && (
            <ul className="mt-4 space-y-2 border-l-2 border-border pl-4 text-muted-foreground">
              {data.deterministic.facts.map((fact) => (
                <li key={fact.id}>{fact.statement}</li>
              ))}
            </ul>
          )}

          {data.regression && (
            <article
              className={`mt-5 rounded-lg border p-4 ${
                data.regression.status === "matched"
                  ? "border-emerald-600/30 bg-emerald-600/[0.055]"
                  : data.regression.status === "mismatched"
                    ? "border-destructive/30 bg-destructive/[0.055]"
                    : "border-amber-600/30 bg-amber-600/[0.055]"
              }`}
            >
              <div className="flex items-start gap-3">
                {data.regression.status === "matched" ? (
                  <BadgeCheck
                    className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                ) : data.regression.status === "mismatched" ? (
                  <BadgeX
                    className="mt-0.5 size-5 shrink-0 text-destructive"
                    aria-hidden="true"
                  />
                ) : (
                  <CircleHelp
                    className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400"
                    aria-hidden="true"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <h4 className="font-sans font-semibold">
                    {data.regression.status === "matched"
                      ? "AgentMart regression check passed"
                      : data.regression.status === "mismatched"
                        ? "AgentMart regression check failed"
                        : "AgentMart tool is not covered"}
                  </h4>
                  <p className="mt-1 leading-6 text-muted-foreground">
                    {data.regression.expectation
                      ? `Expected ${data.regression.expectation.label.toLowerCase()}; observed ${formatRegressionValue(data.regression.actual.verdict)} using ${formatRegressionValue(data.regression.actual.decisionBasis)}.`
                      : "This URL is the AgentMart fixture, but this tool has no expectation in the current manifest."}
                  </p>
                  <p className="mt-2 font-mono text-muted-foreground">
                    Manifest {data.regression.manifestVersion} · Fixture {data.regression.fixture.version}
                  </p>
                </div>
              </div>

              {data.regression.checks.length > 0 && (
                <ul className="mt-4 space-y-2 border-l-2 border-border pl-4">
                  {data.regression.checks.map((check) => (
                    <li key={check.id}>
                      <p className="font-medium">
                        {check.passed ? "Matched" : "Mismatch"}: {check.label}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        Expected {formatRegressionValue(check.expected)} · Actual {formatRegressionValue(check.actual)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          )}

          {data.evaluators.length > 0 && (
            <div className="mt-5 space-y-3">
              {data.evaluators.map((result) => {
                const evaluation = result.evaluation;
                const label =
                  result.evaluator === "contract_checker"
                    ? "Contract checker"
                    : "Evidence checker";

                return (
                  <article
                    key={result.evaluator}
                    className="rounded-lg border border-border bg-muted/35 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-sans font-semibold">{label}</h4>
                      <p className="font-medium text-muted-foreground">
                        {evaluation
                          ? `${evaluation.verdict.replace("_", " ")} · ${Math.round(evaluation.confidence * 100)}% confidence`
                          : result.status}
                      </p>
                    </div>
                    <p className="mt-3 leading-7 text-foreground/85">
                      {evaluation?.summary ?? result.error}
                    </p>
                    {evaluation && (
                      <details className="mt-3">
                        <summary className="cursor-pointer font-medium text-primary">
                          Review requirement evidence
                        </summary>
                        <ul className="mt-3 space-y-3 border-l-2 border-border pl-4">
                          {evaluation.requirements.map((requirement, index) => (
                            <li key={`${requirement.requirement}-${index}`}>
                              <p className="font-medium">
                                {requirement.status}: {requirement.requirement}
                              </p>
                              <p className="mt-1 leading-7 text-muted-foreground">
                                {requirement.reason}
                              </p>
                              <p className="mt-1 break-all font-mono text-muted-foreground">
                                Evidence: {requirement.evidenceIds.join(", ") || "none"}
                              </p>
                            </li>
                          ))}
                        </ul>
                        {evaluation.uncertainties.length > 0 && (
                          <div className="mt-4 border-l-2 border-amber-500/50 pl-4">
                            <p className="font-medium text-amber-700 dark:text-amber-400">
                              Uncertainties
                            </p>
                            <ul className="mt-2 space-y-2 text-muted-foreground">
                              {evaluation.uncertainties.map(
                                (uncertainty, index) => (
                                  <li key={`${uncertainty}-${index}`}>
                                    {uncertainty}
                                  </li>
                                ),
                              )}
                            </ul>
                          </div>
                        )}
                      </details>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {data.adjudication && (
            <article className="mt-5 rounded-lg border border-primary/30 bg-primary/[0.045] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-sans font-semibold">Conditional adjudication</h4>
                <p className="font-medium text-muted-foreground">
                  {data.adjudication.verdict.replace("_", " ")} · {Math.round(data.adjudication.confidence * 100)}% confidence
                </p>
              </div>
              <p className="mt-3 leading-7 text-foreground/85">
                {data.adjudication.summary}
              </p>
              <details className="mt-3">
                <summary className="cursor-pointer font-medium text-primary">
                  Review adjudicated requirement evidence
                </summary>
                <ul className="mt-3 space-y-3 border-l-2 border-border pl-4">
                  {data.adjudication.requirements.map((requirement, index) => (
                    <li key={`${requirement.requirement}-${index}`}>
                      <p className="font-medium">
                        {requirement.status}: {requirement.requirement}
                      </p>
                      <p className="mt-1 leading-7 text-muted-foreground">
                        {requirement.reason}
                      </p>
                      <p className="mt-1 break-all font-mono text-muted-foreground">
                        Evidence: {requirement.evidenceIds.join(", ") || "none"}
                      </p>
                    </li>
                  ))}
                </ul>
                {data.adjudication.uncertainties.length > 0 && (
                  <div className="mt-4 border-l-2 border-amber-500/50 pl-4">
                    <p className="font-medium text-amber-700 dark:text-amber-400">
                      Uncertainties
                    </p>
                    <ul className="mt-2 space-y-2 text-muted-foreground">
                      {data.adjudication.uncertainties.map((uncertainty, index) => (
                        <li key={`${uncertainty}-${index}`}>{uncertainty}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </details>
            </article>
          )}
        </section>
      )}

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

      </section>

      <section className="border-t border-border px-6 py-6">
        <h3 className="font-sans font-semibold">Suggested repair</h3>
        <p className="mt-3 leading-7 text-muted-foreground">
          {data?.suggestedRepair ??
            "A repair recommendation will appear after the observed behavior is compared with the tool contract."}
        </p>
      </section>

      <section className="border-t border-border px-6 py-5">
        <EvidenceReceiptExportMenu source={exportSource} />
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
