import { LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type {
  BrowserPreviewData,
  ToolKey,
  ToolVerificationStatus,
} from "@/features/inspect/components/inspection-data";
import type { SectionProgress } from "@/features/inspect/components/inspection-stream";

type BrowserPreviewSectionProps = {
  data: BrowserPreviewData;
  selectedTool: ToolKey;
};

export const BrowserPreviewSection = ({
  data,
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
            {data.url}
          </p>
        </div>
      </div>

      <div className="inspect-browser min-h-[31rem] flex-1 overflow-auto bg-card p-5 sm:p-8">
        <div className="mx-auto flex min-h-full max-w-5xl flex-col">
          <div className="flex items-center justify-between gap-6 border-b border-border pb-5">
            <div>
              <p className="text-lg font-semibold">{data.siteName}</p>
              <p className="mt-1 text-muted-foreground">
                {data.fixtureLabel}
              </p>
            </div>
            <p className="text-muted-foreground">Cart ({data.cartCount})</p>
          </div>

          <div className="grid flex-1 gap-10 py-8 md:grid-cols-[minmax(0,1fr)_18rem] md:items-start">
            <section aria-labelledby="fixture-product-title">
              <p className="font-medium text-primary">{data.category}</p>
              <h2
                id="fixture-product-title"
                className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"
              >
                {data.productName}
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
                {data.productDescription}
              </p>

              <dl className="mt-8 divide-y divide-border border-y border-border">
                <div className="grid grid-cols-2 gap-6 py-4">
                  <dt className="text-muted-foreground">Price</dt>
                  <dd className="text-right font-medium">{data.price}</dd>
                </div>
                <div className="grid grid-cols-2 gap-6 py-4">
                  <dt className="text-muted-foreground">Available</dt>
                  <dd className="text-right font-medium">
                    {data.availableUnits} units
                  </dd>
                </div>
                <div className="grid grid-cols-2 gap-6 py-4">
                  <dt className="text-muted-foreground">Color</dt>
                  <dd className="text-right font-medium">{data.color}</dd>
                </div>
              </dl>
            </section>

            <aside className="border-l-2 border-primary/30 bg-accent/40 px-6 py-5">
              <p className="font-semibold">Order preview</p>
              <div className="mt-5 space-y-3 text-muted-foreground">
                <div className="flex justify-between gap-5">
                  <span>Subtotal</span>
                  <span className="text-foreground">{data.price}</span>
                </div>
                <div className="flex justify-between gap-5">
                  <span>Shipping</span>
                  <span className="text-foreground">{data.shipping}</span>
                </div>
                <div className="flex justify-between gap-5 border-t border-border pt-4 font-semibold text-foreground">
                  <span>Total</span>
                  <span>{data.price}</span>
                </div>
              </div>

              <Button className="mt-6 min-h-11 w-full rounded-lg px-4 text-base font-semibold">
                Preview order
              </Button>

              {selectedTool === "preview_order" && (
                <p className="mt-5 border-t border-destructive/25 pt-4 font-semibold leading-7 text-destructive">
                  Order confirmed. Reference {data.orderReference}.
                </p>
              )}
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
};

type BrowserPreviewLocalPlaceholderProps = {
  toolName?: string;
  verificationStatus?: ToolVerificationStatus;
};

const getLocalBrowserPreviewCopy = (
  toolName: string | undefined,
  verificationStatus: ToolVerificationStatus | undefined,
) => {
  const selectedToolLabel = toolName ?? "the selected tool";

  if (verificationStatus === "running") {
    return {
      title: "Verification is running",
      description: `ToolTruth is checking ${selectedToolLabel} in the retained local browser and collecting its evidence.`,
    };
  }

  if (
    verificationStatus === "passed" ||
    verificationStatus === "failed" ||
    verificationStatus === "error"
  ) {
    return {
      title: "Browser evidence runs locally",
      description:
        "ToolTruth keeps one disposable local browser open from discovery through verification. Live View will appear here when the runner is switched to Browserbase.",
    };
  }

  return {
    title: "Verification hasn’t started",
    description: `Run verification for ${selectedToolLabel} to begin the browser check and collect evidence for its Live View.`,
  };
};

export const BrowserPreviewLocalPlaceholder = ({
  toolName,
  verificationStatus,
}: BrowserPreviewLocalPlaceholderProps) => {
  const copy = getLocalBrowserPreviewCopy(toolName, verificationStatus);

  return (
    <div className="inspect-browser-frame mx-4 my-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-foreground/15 bg-card shadow-[0_16px_44px_-24px_oklch(0.22_0.02_260/0.38)] sm:mx-5 sm:my-5">
      <div className="border-b border-border bg-muted/75 px-3 py-3 sm:px-4">
        <div className="flex min-h-11 items-center gap-3 rounded-lg border border-border/90 bg-card px-4 shadow-xs">
          <LockKeyhole
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
            Local Stagehand session
          </p>
        </div>
      </div>

      <div className="inspect-browser flex min-h-[31rem] flex-1 items-center justify-center bg-card p-8">
        <div className="max-w-md text-center" aria-live="polite">
          <LockKeyhole className="mx-auto size-7 text-primary" aria-hidden="true" />
          <h2 className="mt-5 font-sans text-2xl font-semibold">
            {copy.title}
          </h2>
          <p className="mt-3 leading-7 text-muted-foreground">
            {copy.description}
          </p>
        </div>
      </div>
    </div>
  );
};

type BrowserPreviewSectionProgressProps = {
  progress: SectionProgress;
};

export const BrowserPreviewSectionProgress = ({
  progress,
}: BrowserPreviewSectionProgressProps) => {
  return (
    <div
      className="inspect-browser-frame mx-4 my-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-foreground/15 bg-card shadow-[0_16px_44px_-24px_oklch(0.22_0.02_260/0.38)] sm:mx-5 sm:my-5"
      aria-busy="true"
      aria-label="Loading isolated browser"
    >
      <div className="border-b border-border bg-muted/75 px-3 py-3 sm:px-4">
        <div className="flex min-h-11 items-center gap-3 rounded-lg border border-border/90 bg-card px-4 shadow-xs">
          <LockKeyhole
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="truncate font-mono text-muted-foreground">
            Opening target application…
          </p>
        </div>
      </div>

      <div className="inspect-browser flex min-h-[31rem] flex-1 items-center justify-center bg-card p-8">
        <div className="w-full max-w-md text-center">
          <Spinner className="mx-auto size-7 text-primary" />
          <h2 className="mt-5 font-sans text-2xl font-semibold">
            Preparing isolated browser
          </h2>
          <p className="mt-2 leading-7 text-muted-foreground">
            {progress.message}
          </p>
          <Progress
            value={progress.value}
            className="mt-7 gap-2 text-left"
          >
            <ProgressLabel className="text-base">Browser progress</ProgressLabel>
            <ProgressValue className="text-base" />
          </Progress>
        </div>
      </div>
    </div>
  );
};

export const BrowserPreviewSectionSkeleton = () => {
  return (
    <div
      className="inspect-browser-frame mx-4 my-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-foreground/15 bg-card shadow-[0_16px_44px_-24px_oklch(0.22_0.02_260/0.38)] sm:mx-5 sm:my-5"
      aria-label="Loading browser preview"
    >
      <div className="border-b border-border bg-muted/75 px-3 py-3 sm:px-4">
        <div className="flex min-h-11 items-center gap-3 rounded-lg border border-border/90 bg-card px-4 shadow-xs">
          <Skeleton className="size-4 shrink-0 rounded-full" />
          <Skeleton className="h-5 w-3/5 rounded-md" />
        </div>
      </div>

      <div className="inspect-browser min-h-[31rem] flex-1 bg-card p-5 sm:p-8">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center justify-between gap-6 border-b border-border pb-5">
            <div className="space-y-2">
              <Skeleton className="h-6 w-28 rounded-md" />
              <Skeleton className="h-5 w-36 rounded-md" />
            </div>
            <Skeleton className="h-5 w-20 rounded-md" />
          </div>

          <div className="grid gap-10 py-8 md:grid-cols-[minmax(0,1fr)_18rem]">
            <div>
              <Skeleton className="h-5 w-20 rounded-md" />
              <Skeleton className="mt-5 h-10 w-4/5 rounded-lg" />
              <Skeleton className="mt-5 h-6 w-full rounded-md" />
              <Skeleton className="mt-3 h-6 w-3/4 rounded-md" />
              <div className="mt-8 space-y-4 border-y border-border py-4">
                <Skeleton className="h-5 w-full rounded-md" />
                <Skeleton className="h-5 w-full rounded-md" />
                <Skeleton className="h-5 w-full rounded-md" />
              </div>
            </div>

            <div className="border-l-2 border-border bg-muted/40 px-6 py-5">
              <Skeleton className="h-6 w-32 rounded-md" />
              <Skeleton className="mt-6 h-5 w-full rounded-md" />
              <Skeleton className="mt-4 h-5 w-full rounded-md" />
              <Skeleton className="mt-6 h-12 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
