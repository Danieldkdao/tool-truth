"use client";

import { useState } from "react";
import { Download, LockKeyhole, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ToolKey =
  | "preview_order"
  | "check_inventory"
  | "summarize_reviews"
  | "estimate_shipping";
type EvidenceTab = "Timeline" | "State diff" | "Network";

const tools = [
  {
    id: "preview_order" as const,
    name: "preview_order",
    description: "Calculate a checkout preview",
    result: "Violation found",
  },
  {
    id: "check_inventory" as const,
    name: "check_inventory",
    description: "Read current product availability",
    result: "Violation found",
  },
  {
    id: "summarize_reviews" as const,
    name: "summarize_reviews",
    description: "Summarize external customer reviews",
    result: "Needs review",
  },
  {
    id: "estimate_shipping" as const,
    name: "estimate_shipping",
    description: "Estimate delivery date and cost",
    result: "Not tested",
  },
];

const findings: Record<
  ToolKey,
  {
    title: string;
    declared: string;
    observed: string;
    parameter: string;
    value: string;
  }
> = {
  preview_order: {
    title: "Behavior does not match the contract",
    declared: "Calculates an order preview without changing application state.",
    observed: "Created order #1048, reduced inventory, and cleared the cart.",
    parameter: "productId",
    value: "headphones-01",
  },
  check_inventory: {
    title: "A read-only tool changed inventory",
    declared: "Returns the current inventory count without making changes.",
    observed: "Reduced available inventory from 14 units to 13 units.",
    parameter: "productId",
    value: "headphones-01",
  },
  summarize_reviews: {
    title: "External content needs a trust boundary",
    declared: "Summarizes product reviews from an external source.",
    observed: "Returned external review text without marking it as untrusted.",
    parameter: "productId",
    value: "headphones-01",
  },
  estimate_shipping: {
    title: "This tool has not been verified yet",
    declared: "Estimates shipping cost and arrival date from a postal code.",
    observed: "No runtime behavior has been recorded for this tool.",
    parameter: "postalCode",
    value: "78701",
  },
};

const timeline = [
  ["00:00.000", "Baseline captured", "Cart: 1 item · Inventory: 14"],
  ["00:01.142", "Tool invoked", "preview_order(productId, quantity)"],
  ["00:01.864", "Network mutation", "POST /api/orders · 201 Created"],
  [
    "00:02.091",
    "Rendered confirmation",
    "“Order confirmed” appeared in the page",
  ],
  [
    "00:02.308",
    "State comparison",
    "Order added · Inventory −1 · Cart cleared",
  ],
];

const stateChanges = [
  ["orders", "0 records", "1 record"],
  ["inventory.headphones-01", "14", "13"],
  ["cart.items", "1", "0"],
];

export default function InspectPage() {
  const [selectedTool, setSelectedTool] = useState<ToolKey>("preview_order");
  const [activeTab, setActiveTab] = useState<EvidenceTab>("Timeline");
  const [isRunning, setIsRunning] = useState(false);

  const finding = findings[selectedTool];

  function runMockVerification() {
    setIsRunning(true);
    window.setTimeout(() => setIsRunning(false), 1100);
  }

  return (
    <main className="inspect-shell min-h-svh bg-card text-base text-foreground">
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
            {tools.map((tool) => {
              const selected = selectedTool === tool.id;

              return (
                <Button
                  key={tool.id}
                  variant="ghost"
                  onClick={() => setSelectedTool(tool.id)}
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

      <section className="inspect-workspace min-w-0 bg-muted/55">
        <div className="inspect-browser-frame mx-4 my-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-foreground/15 bg-card shadow-[0_16px_44px_-24px_oklch(0.22_0.02_260/0.38)] sm:mx-5 sm:my-5">
          <div className="border-b border-border bg-muted/75 px-3 py-3 sm:px-4">
            <div className="flex min-h-11 items-center gap-3 rounded-lg border border-border/90 bg-card px-4 shadow-xs">
              <LockKeyhole
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
                https://fixture.tooltruth.dev/products/headphones
              </p>
              <p className="hidden text-muted-foreground md:block">
                Isolated session
              </p>
            </div>
          </div>

          <div className="inspect-browser min-h-[31rem] flex-1 overflow-auto bg-card p-5 sm:p-8">
            <div className="mx-auto flex min-h-full max-w-5xl flex-col">
              <div className="flex items-center justify-between gap-6 border-b border-border pb-5">
                <div>
                  <p className="text-lg font-semibold">AgentMart</p>
                  <p className="mt-1 text-muted-foreground">Commerce fixture</p>
                </div>
                <p className="text-muted-foreground">Cart (1)</p>
              </div>

              <div className="grid flex-1 gap-10 py-8 md:grid-cols-[minmax(0,1fr)_18rem] md:items-start">
                <section aria-labelledby="fixture-product-title">
                  <p className="font-medium text-primary">Audio</p>
                  <h2
                    id="fixture-product-title"
                    className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
                  >
                    Studio wireless headphones
                  </h2>
                  <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
                    Balanced sound, adaptive noise cancellation, and a 30-hour
                    battery for focused work.
                  </p>

                  <dl className="mt-8 divide-y divide-border border-y border-border">
                    <div className="grid grid-cols-2 gap-6 py-4">
                      <dt className="text-muted-foreground">Price</dt>
                      <dd className="text-right font-medium">$129.00</dd>
                    </div>
                    <div className="grid grid-cols-2 gap-6 py-4">
                      <dt className="text-muted-foreground">Available</dt>
                      <dd className="text-right font-medium">14 units</dd>
                    </div>
                    <div className="grid grid-cols-2 gap-6 py-4">
                      <dt className="text-muted-foreground">Color</dt>
                      <dd className="text-right font-medium">Graphite</dd>
                    </div>
                  </dl>
                </section>

                <aside className="border-l-2 border-primary/30 bg-accent/40 px-6 py-5">
                  <p className="font-semibold">Order preview</p>
                  <div className="mt-5 space-y-3 text-muted-foreground">
                    <div className="flex justify-between gap-5">
                      <span>Subtotal</span>
                      <span className="text-foreground">$129.00</span>
                    </div>
                    <div className="flex justify-between gap-5">
                      <span>Shipping</span>
                      <span className="text-foreground">Free</span>
                    </div>
                    <div className="flex justify-between gap-5 border-t border-border pt-4 font-semibold text-foreground">
                      <span>Total</span>
                      <span>$129.00</span>
                    </div>
                  </div>

                  <Button className="mt-6 min-h-11 w-full rounded-lg px-4 text-base font-semibold">
                    Preview order
                  </Button>

                  {selectedTool === "preview_order" && (
                    <p className="mt-5 border-t border-destructive/25 pt-4 font-semibold leading-7 text-destructive">
                      Order confirmed. Reference #1048.
                    </p>
                  )}
                </aside>
              </div>
            </div>
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as EvidenceTab)}
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
              {(["Timeline", "State diff", "Network"] as EvidenceTab[]).map(
                (tab) => (
                  <TabsTrigger
                    key={tab}
                    value={tab}
                    className="cursor-pointer min-h-8 rounded-lg px-3 text-base font-medium data-active:bg-accent/70 data-active:text-foreground data-active:shadow-xs"
                  >
                    {tab}
                  </TabsTrigger>
                ),
              )}
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
                    <time className="font-mono text-muted-foreground">
                      {time}
                    </time>
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
      </section>

      <aside className="inspect-analysis border-t border-border bg-card">
        <section className="border-b border-destructive/20 bg-destructive/[0.055] px-6 py-6">
          <p className="text-muted-foreground">Contract analysis</p>
          <h2 className="mt-3 font-sans text-2xl font-semibold leading-8 tracking-tight">
            {finding.title}
          </h2>
          <div className="mt-5 border-l-4 border-destructive bg-card/70 px-4 py-3">
            <p className="font-semibold text-destructive">
              Verification failed
            </p>
            <p className="mt-1 leading-7 text-foreground/80">
              Three unexpected state changes were observed.
            </p>
          </div>
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

          <div className="border-l-4 border-destructive bg-destructive/[0.055] px-4 py-4">
            <h3 className="font-sans font-semibold text-destructive">
              Observed behavior
            </h3>
            <p className="mt-2 leading-7 text-foreground">{finding.observed}</p>
          </div>
        </section>

        <section className="border-t border-border bg-accent/35 px-6 py-6">
          <div className="flex items-center justify-between gap-4">
            <h3 className="font-sans font-semibold">Probe configuration</h3>
            <p className="text-muted-foreground">Clean sandbox</p>
          </div>

          <dl className="mt-4 divide-y divide-border border-y border-border">
            <div className="py-3">
              <dt className="text-muted-foreground">Tool</dt>
              <dd className="mt-1 break-all font-mono">{selectedTool}</dd>
            </div>
            <div className="py-3">
              <dt className="text-muted-foreground">{finding.parameter}</dt>
              <dd className="mt-1 break-all font-mono">{finding.value}</dd>
            </div>
            <div className="py-3">
              <dt className="text-muted-foreground">quantity</dt>
              <dd className="mt-1 font-mono">1</dd>
            </div>
          </dl>

          <Button
            size="lg"
            onClick={runMockVerification}
            disabled={isRunning}
            className="mt-5 min-h-12 w-full rounded-lg px-4 text-base font-semibold disabled:cursor-wait"
          >
            <Play className="size-4" fill="currentColor" aria-hidden="true" />
            {isRunning ? "Running verification…" : "Run verification"}
          </Button>
        </section>

        <section className="border-t border-border px-6 py-6">
          <h3 className="font-sans font-semibold">Suggested repair</h3>
          <p className="mt-3 leading-7 text-muted-foreground">
            Split the preview and purchase behavior into separate tools, then
            require approval before placing the order.
          </p>
          <Button
            variant="link"
            className="mt-4 min-h-10 px-0 text-base font-semibold"
          >
            Review proposed change
          </Button>
        </section>

        <section className="border-t border-border px-6 py-5">
          <Button
            variant="ghost"
            className="min-h-10 px-0 text-base font-semibold text-muted-foreground hover:bg-transparent hover:text-foreground"
          >
            <Download className="size-4" aria-hidden="true" />
            Export evidence receipt
          </Button>
        </section>
      </aside>
    </main>
  );
}
