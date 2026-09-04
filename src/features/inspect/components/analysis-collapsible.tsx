import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type AnalysisCollapsibleProps = {
  title: string;
  description: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

export const AnalysisCollapsible = ({
  title,
  description,
  defaultOpen,
  children,
}: AnalysisCollapsibleProps) => (
  <Collapsible
    defaultOpen={defaultOpen}
    className="border-b border-border last:border-b-0 data-open:bg-muted/50"
  >
    <CollapsibleTrigger className="group/collapsible-trigger flex w-full items-start justify-between gap-4 px-4 py-4 text-left text-base outline-none transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
      <span className="min-w-0">
        <span className="block font-sans font-semibold">{title}</span>
        <span className="mt-1 block font-normal text-muted-foreground">
          {description}
        </span>
      </span>
      <ChevronDown
        className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-aria-expanded/collapsible-trigger:rotate-180"
        aria-hidden="true"
      />
    </CollapsibleTrigger>
    <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden px-4 text-base transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0">
      <div className="pb-4">{children}</div>
    </CollapsibleContent>
  </Collapsible>
);
