"use client";

import { ArrowLeft, RefreshCw, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type InspectionErrorStateProps = {
  title: string;
  description: string;
  reason?: string;
  homeHref?: string;
  homeLabel?: string;
  retryLabel?: string;
  showRetry?: boolean;
  onRetry?: () => void;
};

export const InspectionErrorState = ({
  title,
  description,
  reason,
  homeHref = "/",
  homeLabel = "Back to home",
  retryLabel = "Try again",
  showRetry = true,
  onRetry,
}: InspectionErrorStateProps) => {
  const retry = () => {
    if (onRetry) {
      onRetry();
      return;
    }

    window.location.reload();
  };

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-background px-5 py-12 text-base text-foreground sm:px-8">
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] bg-size-[48px_48px] opacity-[0.025]"
        aria-hidden="true"
      />

      <section
        role="alert"
        aria-labelledby="inspection-error-title"
        className="relative w-full max-w-2xl rounded-[1.75rem] border border-border/80 bg-card/95 px-6 py-9 text-center shadow-[0_24px_80px_-32px_oklch(0.30_0.04_255/0.28)] backdrop-blur-sm sm:px-10 sm:py-11"
      >
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/[0.07] text-destructive">
          <TriangleAlert
            className="size-6"
            strokeWidth={1.8}
            aria-hidden="true"
          />
        </div>
        <h1
          id="inspection-error-title"
          className="mx-auto mt-3 max-w-xl text-balance font-heading text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl"
        >
          {title}
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-xl leading-8 text-muted-foreground">
          {description}
        </p>

        {reason ? (
          <div className="mx-auto mt-7 max-w-xl rounded-xl border border-border bg-muted/55 px-5 py-4 text-left">
            <p className="font-semibold text-foreground">What happened</p>
            <p className="mt-1.5 leading-7 text-muted-foreground">{reason}</p>
          </div>
        ) : null}

        <div className="mt-8 flex flex-col-reverse justify-center gap-3 sm:flex-row">
          <Link
            href={homeHref}
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "min-h-12 rounded-lg px-5 text-base font-semibold",
            )}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {homeLabel}
          </Link>

          {showRetry ? (
            <Button
              type="button"
              size="lg"
              onClick={retry}
              className="min-h-12 rounded-lg px-5 text-base font-semibold"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              {retryLabel}
            </Button>
          ) : null}
        </div>
      </section>
    </main>
  );
};
