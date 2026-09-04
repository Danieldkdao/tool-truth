import { ArrowRight, Check, CircleHelp, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AnalysisCollapsible } from "@/features/inspect/components/analysis-collapsible";
import type { ToolVerificationRecord } from "@/features/inspect/hooks/use-tool-verification";

type DirectedVerificationPanelProps = {
  record: ToolVerificationRecord;
  rounds: ToolVerificationRecord[];
  onSelectRound: (probeId: string) => void;
};

const titleCase = (value: string) =>
  value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const verdictStyle = (verdict?: string) =>
  verdict === "passed"
    ? "border-emerald-600/25 bg-emerald-600/[0.06] text-emerald-700 dark:text-emerald-400"
    : verdict === "failed" || verdict === "error"
      ? "border-destructive/25 bg-destructive/[0.06] text-destructive"
      : "border-amber-600/25 bg-amber-600/[0.06] text-amber-700 dark:text-amber-400";

const checkStatusStyle = (status: string) =>
  status === "satisfied"
    ? "text-emerald-700 dark:text-emerald-400"
    : status === "violated"
      ? "text-destructive"
      : "text-amber-700 dark:text-amber-400";

const VerdictIcon = ({ verdict }: { verdict?: string }) =>
  verdict === "passed" ? (
    <Check className="size-4" aria-hidden="true" />
  ) : verdict === "failed" || verdict === "error" ? (
    <X className="size-4" aria-hidden="true" />
  ) : (
    <CircleHelp className="size-4" aria-hidden="true" />
  );

const summarizeChanges = (
  record: ToolVerificationRecord,
  rounds: ToolVerificationRecord[],
) => {
  const round = record.directedTest?.round ?? 1;
  if (round <= 1) return "Initial directed test";
  const previous = rounds.find(
    (candidate) => candidate.directedTest?.round === round - 1,
  );
  if (!previous?.directedTest || !record.directedTest) {
    return `Changed since Round ${round - 1}`;
  }
  const inputChanged =
    JSON.stringify(previous.directedTest.input) !==
    JSON.stringify(record.directedTest.input);
  const assertionsChanged =
    JSON.stringify(previous.directedTest.assertions) !==
    JSON.stringify(record.directedTest.assertions);
  if (inputChanged && assertionsChanged) return "Input and assertions changed";
  if (inputChanged) return "Structured input changed";
  if (assertionsChanged) return "Assertions changed";
  return "Request wording changed; executable test is unchanged";
};

export const DirectedVerificationPanel = ({
  record,
  rounds,
  onSelectRound,
}: DirectedVerificationPanelProps) => {
  const test = record.directedTest;
  if (!test) return null;
  const directedVerdict = record.directedEvaluation?.verdict ??
    (record.status === "running" ? "running" : "not_run");
  const contractVerdict = record.analysisData?.verdict ??
    (record.status === "running" ? "pending" : "error");

  return (
    <AnalysisCollapsible
      title={`Directed test · Round ${test.round}`}
      description={summarizeChanges(record, rounds)}
    >
      <div className="flex justify-end">
        <span className="rounded-full border border-border bg-muted/50 px-2.5 py-1 font-mono text-xs text-muted-foreground">
          {test.inputHash.slice(0, 8)}
        </span>
      </div>

      {rounds.length > 1 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {rounds.map((roundRecord, index) => (
            <div key={roundRecord.probeId} className="flex items-center gap-1.5">
              {index > 0 && (
                <ArrowRight className="size-3 text-muted-foreground" aria-hidden="true" />
              )}
              <Button
                type="button"
                size="sm"
                variant={roundRecord.probeId === record.probeId ? "default" : "outline"}
                className="h-8 rounded-full px-3 text-xs"
                onClick={() => onSelectRound(roundRecord.probeId)}
              >
                R{roundRecord.directedTest?.round} {titleCase(roundRecord.directedEvaluation?.verdict ?? roundRecord.status)}
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Relayed request
          </p>
          <p className="mt-1.5 text-sm leading-6">{test.request}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Exact structured input
          </p>
          <pre className="mt-1.5 max-h-40 overflow-auto rounded-md bg-muted/65 p-3 font-mono text-xs leading-5">
            {JSON.stringify(test.input, null, 2)}
          </pre>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        <div className={`rounded-lg border p-3 ${verdictStyle(directedVerdict)}`}>
          <p className="flex items-center gap-2 font-semibold">
            <VerdictIcon verdict={directedVerdict} />
            Your directed test: {titleCase(directedVerdict)}
          </p>
        </div>
        <div className={`rounded-lg border p-3 ${verdictStyle(contractVerdict)}`}>
          <p className="flex items-center gap-2 font-semibold">
            <VerdictIcon verdict={contractVerdict} />
            Declared contract: {titleCase(contractVerdict)}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {(record.directedEvaluation?.checks ?? test.assertions.map((assertion) => ({
          assertion,
          status: "inconclusive" as const,
          explanation: "Waiting for captured evidence.",
          evidenceIds: [],
        }))).map((check, index) => (
          <article key={`${check.assertion.kind}-${index}`} className="rounded-md border border-border p-3">
            <p className="flex items-center justify-between gap-3 text-sm font-medium">
              <span>{titleCase(check.assertion.kind)}</span>
              <span className={checkStatusStyle(check.status)}>
                {titleCase(check.status)}
              </span>
            </p>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              {check.explanation}
            </p>
          </article>
        ))}
      </div>
    </AnalysisCollapsible>
  );
};
