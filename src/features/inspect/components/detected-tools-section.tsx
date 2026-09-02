import { Button } from "@/components/ui/button";
import {
  detectedTools,
  type ToolKey,
} from "@/features/inspect/components/inspection-data";

type DetectedToolsSectionProps = {
  selectedTool: ToolKey;
  onSelectTool: (tool: ToolKey) => void;
};

export function DetectedToolsSection({
  selectedTool,
  onSelectTool,
}: DetectedToolsSectionProps) {
  return (
    <aside className="inspect-tools-panel border-b border-border bg-background/70">
      <section className="inspect-tools-scroll px-3 py-4 lg:py-5">
        <div className="flex items-center justify-between px-3 pb-3">
          <h1 className="font-sans font-semibold">Detected tools</h1>
          <p className="text-muted-foreground">4 found</p>
        </div>

        <nav
          aria-label="Detected WebMCP tools"
          className="scrollbar-none scroll-fade-x flex snap-x snap-mandatory gap-2 overflow-x-auto px-3 pb-2 lg:mx-0 lg:block lg:space-y-1 lg:overflow-visible lg:px-0 lg:pb-0 lg:scroll-fade"
        >
          {detectedTools.map((tool) => {
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
}
