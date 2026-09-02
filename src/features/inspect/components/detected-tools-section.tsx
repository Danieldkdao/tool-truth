import { Button } from "@/components/ui/button";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  type DetectedTool,
  type ToolKey,
} from "@/features/inspect/components/inspection-data";
import type { SectionProgress } from "@/features/inspect/components/inspection-stream";

type DetectedToolsSectionProps = {
  tools: DetectedTool[];
  selectedTool: ToolKey;
  onSelectTool: (tool: ToolKey) => void;
};

export const DetectedToolsSection = ({
  tools,
  selectedTool,
  onSelectTool,
}: DetectedToolsSectionProps) => {
  return (
    <aside className="inspect-tools-panel border-b border-border bg-background/70">
      <section className="inspect-tools-scroll px-3 py-4 lg:py-5">
        <div className="flex items-center justify-between px-3 pb-3">
          <h1 className="font-sans font-semibold">Detected tools</h1>
          <p className="text-muted-foreground">{tools.length} found</p>
        </div>

        <nav
          aria-label="Detected WebMCP tools"
          className="scrollbar-none scroll-fade-x flex snap-x snap-mandatory gap-2 overflow-x-auto px-3 pb-2 lg:mx-0 lg:block lg:space-y-1 lg:overflow-visible lg:px-0 lg:pb-0 lg:scroll-fade"
        >
          {tools.map((tool) => {
            const selected = selectedTool === tool.id;

            return (
              <Button
                key={tool.id}
                variant="ghost"
                onClick={() => onSelectTool(tool.id)}
                aria-pressed={selected}
                className={`h-auto w-[12.5rem] shrink-0 snap-start flex-col items-start justify-start whitespace-normal rounded-lg border-b-2 border-l-0 px-3 py-3 text-left text-base lg:w-full lg:border-b-0 lg:border-l-2 ${
                  selected
                    ? "bg-accent/75 hover:bg-accent/90"
                    : "border-transparent hover:bg-muted"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-mono font-medium leading-6">
                    {tool.name}
                  </span>
                  <span className="mt-1 hidden leading-6 text-muted-foreground lg:block">
                    {tool.description}
                  </span>
                  <span
                    className={`mt-1 block font-medium lg:mt-2 ${
                      tool.result === "Violation found"
                        ? "text-destructive"
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
      </section>

      <section className="inspect-safety hidden border-t border-border px-6 py-5 leading-7 text-muted-foreground">
        This disposable session is isolated from your normal browser data.
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
      <section className="inspect-tools-scroll px-6 py-5">
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
      <section className="inspect-tools-scroll px-6 py-5">
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
