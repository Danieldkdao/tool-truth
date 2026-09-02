import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  stateChanges,
  timeline,
  type EvidenceTab,
} from "@/features/inspect/components/inspection-data";

type ExecutionEvidenceSectionProps = {
  activeTab: EvidenceTab;
  onActiveTabChange: (tab: EvidenceTab) => void;
};

const evidenceTabs: EvidenceTab[] = ["Timeline", "State diff", "Network"];

export function ExecutionEvidenceSection({
  activeTab,
  onActiveTabChange,
}: ExecutionEvidenceSectionProps) {
  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => onActiveTabChange(value as EvidenceTab)}
      className="inspect-evidence gap-0 border-t border-border bg-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
        <div>
          <h2 className="font-sans font-semibold">Execution evidence</h2>
          <p className="mt-1 text-muted-foreground">Probe run TT-2048</p>
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
            {timeline.map(([time, event, detail]) => (
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
            {stateChanges.map(([path, before, after]) => (
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
          <div className="grid gap-3 sm:grid-cols-[5rem_1fr_auto]">
            <p className="font-mono font-medium text-destructive">POST</p>
            <p className="font-mono">/api/orders</p>
            <p className="text-muted-foreground">201 Created · 164 ms</p>
          </div>
        </TabsContent>
      </div>
    </Tabs>
  );
}
