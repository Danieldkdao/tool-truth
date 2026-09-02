import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type {
  EvidenceTab,
  ExecutionEvidenceData,
} from "@/features/inspect/components/inspection-data";
import type { SectionProgress } from "@/features/inspect/components/inspection-stream";

type ExecutionEvidenceSectionProps = {
  data: ExecutionEvidenceData;
  activeTab: EvidenceTab;
  onActiveTabChange: (tab: EvidenceTab) => void;
};

const evidenceTabs: EvidenceTab[] = ["Timeline", "State diff", "Network"];

export const ExecutionEvidenceSection = ({
  data,
  activeTab,
  onActiveTabChange,
}: ExecutionEvidenceSectionProps) => {
  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => onActiveTabChange(value as EvidenceTab)}
      className="inspect-evidence gap-0 border-t border-border bg-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
        <div>
          <h2 className="font-sans font-semibold">Execution evidence</h2>
          <p className="mt-1 text-muted-foreground">{data.runLabel}</p>
        </div>
        <TabsList
          aria-label="Evidence views"
          className="h-auto rounded-lg bg-transparent! p-1"
        >
          {evidenceTabs.map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="cursor-pointer min-h-8 rounded-lg px-3 text-base font-medium data-active:bg-accent/70 data-active:text-foreground data-active:shadow-xs"
            >
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <div className="inspect-evidence-scroll max-h-[22rem] overflow-auto px-5 py-4 sm:px-6">
        <TabsContent value="Timeline" className="text-base">
          <ol className="divide-y divide-border">
            {data.timeline.map(([time, event, detail]) => (
              <li
                key={time}
                className="grid gap-1 py-3 sm:grid-cols-[6.5rem_10rem_1fr] sm:gap-4"
              >
                <time className="font-mono text-muted-foreground">{time}</time>
                <p className="font-medium">{event}</p>
                <p className="min-w-0 break-words text-muted-foreground">
                  {detail}
                </p>
              </li>
            ))}
          </ol>
        </TabsContent>

        <TabsContent value="State diff" className="text-base">
          <div className="min-w-[34rem]">
            <div className="grid grid-cols-[1fr_9rem_9rem] gap-5 border-b border-border pb-3 font-medium text-muted-foreground">
              <p>State path</p>
              <p>Before</p>
              <p>After</p>
            </div>
            {data.stateChanges.map(([path, before, after]) => (
              <div
                key={path}
                className="grid grid-cols-[1fr_9rem_9rem] gap-5 border-b border-border py-3"
              >
                <p className="font-mono">{path}</p>
                <p>{before}</p>
                <p className="font-medium text-destructive">{after}</p>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="Network" className="text-base">
          <div className="space-y-3">
            {data.network.map((entry) => (
              <div
                key={`${entry.method}-${entry.path}`}
                className="grid gap-3 sm:grid-cols-[5rem_1fr_auto]"
              >
                <p className="font-mono font-medium text-destructive">
                  {entry.method}
                </p>
                <p className="font-mono">{entry.path}</p>
                <p className="text-muted-foreground">
                  {entry.status} · {entry.duration}
                </p>
              </div>
            ))}
          </div>
        </TabsContent>
      </div>
    </Tabs>
  );
};

type ExecutionEvidenceSectionProgressProps = {
  progress: SectionProgress;
};

export const ExecutionEvidenceSectionProgress = ({
  progress,
}: ExecutionEvidenceSectionProgressProps) => {
  return (
    <section
      className="inspect-evidence border-t border-border bg-card"
      aria-busy="true"
      aria-label="Collecting execution evidence"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Spinner className="size-5 text-primary" />
          <div>
            <h2 className="font-sans font-semibold">Execution evidence</h2>
            <p className="mt-1 text-muted-foreground">Probe in progress</p>
          </div>
        </div>
        <p className="font-medium text-primary">Collecting live evidence</p>
      </div>

      <div className="inspect-evidence-scroll px-5 py-5 sm:px-6">
        <Progress value={progress.value} className="gap-2">
          <ProgressLabel className="text-base leading-6">
            {progress.message}
          </ProgressLabel>
          <ProgressValue className="text-base" />
        </Progress>

        <ol className="mt-5 divide-y divide-border text-muted-foreground">
          <li className="py-3">Capture the baseline snapshot</li>
          <li className="py-3">Record tool inputs and output</li>
          <li className="py-3">Compare state and network activity</li>
        </ol>
      </div>
    </section>
  );
};

export const ExecutionEvidenceSectionSkeleton = () => {
  return (
    <section
      className="inspect-evidence border-t border-border bg-card"
      aria-label="Loading execution evidence"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40 rounded-md" />
          <Skeleton className="h-5 w-32 rounded-md" />
        </div>
        <Skeleton className="h-10 w-64 rounded-lg" />
      </div>

      <div className="inspect-evidence-scroll px-5 py-4 sm:px-6">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="grid gap-3 border-b border-border py-3 sm:grid-cols-[6.5rem_10rem_1fr]"
          >
            <Skeleton className="h-5 w-20 rounded-md" />
            <Skeleton className="h-5 w-32 rounded-md" />
            <Skeleton className="h-5 w-full rounded-md" />
          </div>
        ))}
      </div>
    </section>
  );
};
