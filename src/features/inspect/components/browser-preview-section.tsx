import { LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ToolKey } from "@/features/inspect/components/inspection-data";

type BrowserPreviewSectionProps = {
  selectedTool: ToolKey;
};

export const BrowserPreviewSection = ({
  selectedTool,
}: BrowserPreviewSectionProps) => {
  return (
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
  );
};
