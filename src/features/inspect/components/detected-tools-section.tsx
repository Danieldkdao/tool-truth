import {
  AlertCircle,
  CheckCircle2,
  Circle,
  ListChecks,
  SearchX,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type {
  DetectedTool,
  ToolVerificationStatus,
} from "@/features/inspect/components/inspection-data";
import type { SectionProgress } from "@/features/inspect/components/inspection-stream";

type DetectedToolsSectionProps = {
  tools: DetectedTool[];
  selectedTool: string | null;
  statuses: Record<string, ToolVerificationStatus | undefined>;
  isRunningAll: boolean;
  isBusy: boolean;
  onSelectTool: (tool: string) => void;
  onRunAllVerifications: () => void;
};

export const DetectedToolsSection = ({
  tools,
  selectedTool,
  statuses,
  isRunningAll,
  isBusy,
  onSelectTool,
  onRunAllVerifications,
}: DetectedToolsSectionProps) => {
  return (
    <aside className="inspect-tools-panel border-b border-border bg-background/70">
      <header className="shrink-0 border-b border-border/60 px-3 pb-3 pt-4 lg:pt-5">
        <div className="flex items-center justify-between px-3 pb-3">
          <h1 className="font-sans font-semibold">Detected tools</h1>
          <p className="text-muted-foreground">{tools.length} found</p>
        </div>

        <div className="px-3 lg:px-0">
          <Button
            variant="outline"
            onClick={onRunAllVerifications}
            disabled={tools.length === 0 || isBusy}
            className="h-9 w-full rounded-lg font-semibold disabled:cursor-wait"
          >
            {isRunningAll ? (
              <Spinner className="size-4 text-primary" />
            ) : (
              <ListChecks className="size-4" aria-hidden="true" />
            )}
            {isRunningAll ? "Running all…" : "Run all verifications"}
          </Button>
        </div>
      </header>

      <nav
        aria-label="Detected WebMCP tools"
        className="scrollbar-none scroll-fade-x flex snap-x snap-mandatory gap-2 overflow-x-auto px-6 py-3 lg:min-h-0 lg:flex-1 lg:snap-none lg:block lg:space-y-1 lg:overflow-x-hidden lg:overflow-y-auto lg:scroll-fade"
      >
        {tools.length === 0 && (
          <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-border px-5 py-8 text-center">
            <SearchX
              className="size-6 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="mt-4 font-semibold">No WebMCP tools found</p>
            <p className="mt-2 leading-6 text-muted-foreground">
              The page loaded successfully, but it did not register any tools.
            </p>
          </div>
        )}
        {tools.map((tool) => {
          const selected = selectedTool === tool.id;
          const status = statuses[tool.id] ?? "idle";

          return (
            <Button
              key={tool.id}
              variant="ghost"
              onClick={() => onSelectTool(tool.id)}
              aria-pressed={selected}
              className={`relative h-auto w-[12.5rem] shrink-0 snap-start flex-col items-start justify-start whitespace-normal rounded-lg border-b-2 border-l-0 px-3 py-3 text-left text-base lg:w-full lg:border-b-0 lg:border-l-2 ${
                selected
                  ? "bg-accent/75 hover:bg-accent/90"
                  : "border-transparent hover:bg-muted"
              }`}
            >
              <span className="absolute right-3 top-3">
                {status === "running" ? (
                  <Spinner
                    className="size-4 text-primary"
                    aria-label={`${tool.name} verification is running`}
                  />
                ) : status === "passed" ? (
                  <CheckCircle2
                    className="size-4 text-emerald-600 dark:text-emerald-400"
                    aria-label={`${tool.name} verification passed`}
                  />
                ) : status === "inconclusive" || status === "canceled" ? (
                  <AlertCircle
                    className="size-4 text-amber-600 dark:text-amber-400"
                    aria-label={`${tool.name} verification was ${status}`}
                  />
                ) : status === "failed" || status === "error" ? (
                  <XCircle
                    className="size-4 text-destructive"
                    aria-label={`${tool.name} verification failed`}
                  />
                ) : (
                  <Circle
                    className="size-4 text-muted-foreground/50"
                    aria-label={`${tool.name} has not been verified`}
                  />
                )}
              </span>
              <span className="w-full min-w-0 [overflow-wrap:anywhere]">
                <span className="block pr-7 font-mono font-medium leading-6">
                  {tool.name}
                </span>
                <span className="mt-1 hidden leading-6 text-muted-foreground lg:block">
                  {tool.description}
                </span>
                <span
                  className={`mt-1 block font-medium lg:mt-2 ${
                    status === "passed"
                      ? "text-emerald-700 dark:text-emerald-400"
                      : status === "inconclusive" || status === "canceled"
                        ? "text-amber-700 dark:text-amber-400"
                        : status === "failed" || status === "error"
                          ? "text-destructive"
                          : status === "running"
                            ? "text-primary"
                            : "text-muted-foreground"
                  }`}
                >
                  {tool.result}
                </span>
              </span>
            </Button>
          );
        })}
      </nav>

      <section className="inspect-safety hidden border-t border-border px-6 py-5 leading-7 text-muted-foreground">
        This disposable session is isolated from your normal browser data.
      </section>
    </aside>
  );
};

type DetectedToolsSectionErrorProps = {
  message: string;
};

export const DetectedToolsSectionError = ({
  message,
}: DetectedToolsSectionErrorProps) => {
  return (
    <aside
      className="inspect-tools-panel border-b border-border bg-background/70"
      role="status"
    >
      <section className="inspect-tools-scroll scrollbar-none scroll-fade px-6 py-5">
        <div className="flex items-center gap-3">
          <AlertCircle className="size-5 text-destructive" aria-hidden="true" />
          <h1 className="font-sans font-semibold">Tool discovery failed</h1>
        </div>
        <p className="mt-4 border-l-2 border-destructive/40 pl-4 leading-7 text-muted-foreground">
          {message}
        </p>
      </section>
    </aside>
  );
};

type DetectedToolsSectionProgressProps = {
  progress: SectionProgress;
};

export const DetectedToolsSectionProgress = ({
  progress,
}: DetectedToolsSectionProgressProps) => {
  return (
    <aside
      className="inspect-tools-panel border-b border-border bg-background/70"
      aria-busy="true"
      aria-label="Detecting WebMCP tools"
    >
      <section className="inspect-tools-scroll scrollbar-none scroll-fade px-6 py-5">
        <div className="flex items-center gap-3">
          <Spinner className="size-5 text-primary" />
          <div>
            <h1 className="font-sans font-semibold">Detecting tools</h1>
            <p className="mt-1 text-muted-foreground">Inspecting the page</p>
          </div>
        </div>

        <Progress value={progress.value} className="mt-7 gap-2">
          <ProgressLabel className="text-base leading-6">
            {progress.message}
          </ProgressLabel>
          <ProgressValue className="text-base" />
        </Progress>

        <div className="mt-7 space-y-4 border-l-2 border-primary/25 pl-4 text-muted-foreground">
          <p>Opening the discovery channel</p>
          <p>Reading registered tool contracts</p>
          <p>Validating tool metadata</p>
        </div>
      </section>

      <section className="inspect-safety hidden border-t border-border px-6 py-5 leading-7 text-muted-foreground">
        This disposable session is isolated from your normal browser data.
      </section>
    </aside>
  );
};

export const DetectedToolsSectionSkeleton = () => {
  return (
    <aside
      className="inspect-tools-panel border-b border-border bg-background/70"
      aria-label="Loading detected tools"
    >
      <section className="inspect-tools-scroll scrollbar-none scroll-fade px-6 py-5">
        <div className="flex items-center justify-between gap-4 pb-4">
          <Skeleton className="h-6 w-32 rounded-lg" />
          <Skeleton className="h-5 w-14 rounded-lg" />
        </div>

        <div className="scrollbar-none flex gap-2 overflow-hidden pb-2 lg:block lg:space-y-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="w-[12.5rem] shrink-0 rounded-lg border border-border/60 p-3 lg:w-full"
            >
              <Skeleton className="h-5 w-32 rounded-md" />
              <Skeleton className="mt-3 hidden h-5 w-full rounded-md lg:block" />
              <Skeleton className="mt-3 h-5 w-24 rounded-md" />
            </div>
          ))}
        </div>
      </section>

      <section className="inspect-safety hidden border-t border-border px-6 py-5">
        <Skeleton className="h-12 w-full rounded-lg" />
      </section>
    </aside>
  );
};
