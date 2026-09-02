import { SafetyNote } from "@/components/ready-state/safety-note";
import { WebsiteInspectionForm } from "@/components/ready-state/website-inspection-form";
import { Separator } from "../ui/separator";

export function ToolTruthReadyState() {
  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden bg-background">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025] bg-[linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] bg-size-[48px_48px]"
        aria-hidden="true"
      />

      <main className="relative z-10 flex flex-1 items-center justify-center px-5 py-12 sm:px-8 sm:py-16 lg:py-20">
        <section
          className="w-full max-w-3xl"
          aria-labelledby="inspection-title"
        >
          <div className="mb-7 text-center">
            <h1
              id="inspection-title"
              className="mx-auto max-w-2xl text-balance font-heading text-4xl font-semibold leading-[1.08] tracking-tight text-foreground sm:text-5xl"
            >
              Inspect a WebMCP application
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-pretty text-xl leading-8 text-muted-foreground">
              ToolTruth compares what a tool claims to do with the behavior it
              actually produces in an isolated browser session.
            </p>
          </div>

          <div className="rounded-[1.75rem] border border-border/80 bg-card/92 p-5 shadow-[0_24px_80px_-32px_oklch(0.30_0.04_255/0.28)] backdrop-blur-sm sm:p-7 flex flex-col gap-6">
            <WebsiteInspectionForm />

            <Separator />

            <SafetyNote />
          </div>
        </section>
      </main>
    </div>
  );
}
