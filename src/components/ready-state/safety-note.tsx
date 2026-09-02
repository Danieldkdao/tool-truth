import { ShieldCheck } from "lucide-react";

export function SafetyNote() {
  return (
    <div className="flex gap-3 rounded-2xl border border-secondary/20 bg-secondary/7 px-4 py-3.5 text-base leading-7 text-foreground/80">
      <ShieldCheck
        className="mt-0.5 size-5 shrink-0 text-secondary"
        strokeWidth={2.2}
        aria-hidden="true"
      />
      <p>
        Use a staging environment or disposable account. ToolTruth may exercise
        tools that change application state.
      </p>
    </div>
  );
}
