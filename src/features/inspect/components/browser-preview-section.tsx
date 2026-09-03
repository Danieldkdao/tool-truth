"use client";

import { useEffect, useState } from "react";

import { Eye, LockKeyhole, WifiOff } from "lucide-react";

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
  EvidenceScreenshot,
  ToolKey,
  ToolVerificationStatus,
} from "@/features/inspect/components/inspection-data";
import type {
  BrowserSessionView,
  SectionProgress,
} from "@/features/inspect/components/inspection-stream";

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

type BrowserPreviewLiveViewProps = {
  session: BrowserSessionView;
  toolName?: string;
  fallbackScreenshot?: EvidenceScreenshot;
};

const getBrowserSessionCopy = (
  session: BrowserSessionView,
  disconnected: boolean,
  toolName: string | undefined,
) => {
  if (disconnected && session.status === "running") {
    return {
      title: "Live View disconnected",
      description:
        "The Browserbase stream lost its connection. Verification may still be running, and captured screenshots remain available as durable evidence.",
    };
  }

  switch (session.status) {
    case "creating":
      return {
        title: "Connecting to Live View",
        description:
          "Browserbase is creating the isolated browser and preparing its view-only stream.",
      };
    case "running":
      return {
        title: "Live View unavailable",
        description: `The isolated browser is still verifying ${toolName ?? "the target"}. Screenshots continue to be captured as durable evidence.`,
      };
    case "closing":
      return {
        title: "Browser session is closing",
        description:
          "The live connection has ended while ToolTruth safely releases the Browserbase session.",
      };
    case "completed":
      return {
        title: "Browser session complete",
        description:
          "Live View is available only while Browserbase is running. The captured screenshots remain with the verification evidence.",
      };
    case "canceled":
      return {
        title: "Browser session canceled",
        description:
          "The live connection closed when this verification was canceled. Captured screenshots remain available as evidence.",
      };
    case "timed_out":
      return {
        title: "Browser session timed out",
        description:
          "Browserbase closed the live connection at the session limit. Captured screenshots remain available as evidence.",
      };
    case "failed":
      return {
        title: "Browser session disconnected",
        description:
          "The Browserbase session ended unexpectedly. Any screenshots captured before it ended remain available as evidence.",
      };
  }
};

export const BrowserPreviewLiveView = ({
  session,
  toolName,
  fallbackScreenshot,
}: BrowserPreviewLiveViewProps) => {
  const [disconnectedUrl, setDisconnectedUrl] = useState<string | null>(null);
  const disconnected =
    session.liveViewUrl !== null && disconnectedUrl === session.liveViewUrl;
  const isLive =
    session.status === "running" &&
    session.liveViewUrl !== null &&
    !disconnected;
  const copy = getBrowserSessionCopy(session, disconnected, toolName);

  useEffect(() => {
    if (!session.liveViewUrl) return;

    let liveViewOrigin: string;
    try {
      liveViewOrigin = new URL(session.liveViewUrl).origin;
    } catch {
      return;
    }

    const handleMessage = (event: MessageEvent<unknown>) => {
      if (
        event.origin === liveViewOrigin &&
        event.data === "browserbase-disconnected"
      ) {
        setDisconnectedUrl(session.liveViewUrl);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [session.liveViewUrl]);

  return (
    <div className="inspect-browser-frame mx-4 my-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-foreground/15 bg-card shadow-[0_16px_44px_-24px_oklch(0.22_0.02_260/0.38)] sm:mx-5 sm:my-5">
      <div className="border-b border-border bg-muted/75 px-3 py-3 sm:px-4">
        <div className="flex min-h-11 items-center gap-3 rounded-lg border border-border/90 bg-card px-4 shadow-xs">
          <LockKeyhole
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
            {session.targetUrl}
          </p>
          {isLive && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-600/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              <Eye className="size-3.5" aria-hidden="true" />
              Live · View only
            </span>
          )}
        </div>
      </div>

      {isLive ? (
        <div className="inspect-browser relative min-h-[31rem] flex-1 overflow-hidden bg-black">
          <iframe
            key={session.liveViewUrl}
            src={session.liveViewUrl ?? undefined}
            title="View-only Browserbase Live View"
            sandbox="allow-same-origin allow-scripts"
            referrerPolicy="no-referrer"
            tabIndex={-1}
            className="pointer-events-none absolute inset-0 size-full border-0"
          />
          <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-black/70 px-3 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-sm">
            Viewing the same isolated browser used for verification
          </p>
        </div>
      ) : (
        <div
          className="inspect-browser relative flex min-h-[31rem] flex-1 items-center justify-center overflow-hidden bg-card bg-contain bg-center bg-no-repeat p-8"
          style={
            fallbackScreenshot
              ? {
                  backgroundImage: `url('${fallbackScreenshot.dataUrl}')`,
                }
              : undefined
          }
          aria-label={fallbackScreenshot?.label}
        >
          {fallbackScreenshot && (
            <div className="absolute inset-0 bg-card/80 backdrop-blur-[1px]" />
          )}
          <div
            className="relative max-w-md rounded-2xl border border-border/80 bg-card/90 p-7 text-center shadow-xl backdrop-blur-sm"
            aria-live="polite"
          >
            {session.status === "creating" ? (
              <Spinner className="mx-auto size-7 text-primary" />
            ) : (
              <WifiOff
                className="mx-auto size-7 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            <h2 className="mt-5 font-sans text-2xl font-semibold">
              {copy.title}
            </h2>
            <p className="mt-3 leading-7 text-muted-foreground">
              {copy.description}
            </p>
          </div>
        </div>
      )}
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
      title: "Preparing the browser view",
      description: `ToolTruth is checking ${selectedToolLabel} in an isolated browser and collecting its evidence. A live view appears here for Browserbase sessions.`,
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
