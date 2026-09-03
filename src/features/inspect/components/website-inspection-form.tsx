"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Globe2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  inspectionCreatedSchema,
  inspectFormSchema,
  type InspectFormValues,
} from "@/features/inspect/actions/schemas";
import { showToast } from "@/lib/utils";

const AGENTMART_DEMO_URL = "https://tooltruth-agentmart.vercel.app";

export const WebsiteInspectionForm = () => {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const form = useForm<InspectFormValues>({
    resolver: zodResolver(inspectFormSchema),
    defaultValues: {
      url: "",
    },
  });

  const onSubmit = async (data: InspectFormValues) => {
    setLoading(true);
    try {
      const response = await fetch("/api/inspection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      const responseBody = await response.json();

      if (!response.ok) {
        const errorMessage =
          typeof responseBody === "object" &&
          responseBody !== null &&
          "error" in responseBody &&
          typeof responseBody.error === "string"
            ? responseBody.error
            : "The inspection session could not be started.";

        throw new Error(errorMessage);
      }

      const result = inspectionCreatedSchema.parse(responseBody);

      console.log({ runId: result.runId });
      showToast("Inspection session started", "success", {
        description: `Run ID: ${result.runId}`,
      });
      router.push(`/inspect/${encodeURIComponent(result.runId)}`);

      // note: we don't set loading to false here because the page is being redirected
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The inspection session could not be started.";

      form.setError("url", { type: "server", message }, { shouldFocus: true });
      showToast("Unable to start inspection", "error", {
        description: message,
      });
      setLoading(false);
    }
  };

  const buttonDisabled = form.formState.isSubmitting || loading;
  const submitAgentMartDemo = () => {
    form.clearErrors("url");
    form.setValue("url", AGENTMART_DEMO_URL, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
    void form.handleSubmit(onSubmit)();
  };

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(onSubmit)}
      noValidate
    >
      <Controller
        name="url"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field className="gap-3" data-invalid={fieldState.invalid}>
            <FieldLabel
              htmlFor={field.name}
              className="block text-base font-semibold"
            >
              WebMCP application URL
            </FieldLabel>

            <div className="group relative">
              <Globe2
                className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary"
                aria-hidden="true"
              />
              <Input
                {...field}
                id={field.name}
                type="url"
                inputMode="url"
                autoComplete="url"
                aria-invalid={fieldState.invalid}
                placeholder="https://staging.example.com"
                className="h-14 rounded-2xl border-border bg-background pl-12 pr-4 text-base shadow-xs placeholder:text-muted-foreground/80 focus-visible:bg-card md:text-base"
              />
            </div>

            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
          </Field>
        )}
      />

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Button
          type="submit"
          size="lg"
          disabled={buttonDisabled}
          className="h-13 rounded-2xl px-6 text-base font-semibold shadow-sm shadow-primary/15"
        >
          {buttonDisabled ? "Starting inspection…" : "Inspect website"}
          <ArrowRight className="size-5 transition-transform group-hover/button:translate-x-0.5" />
        </Button>

        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={buttonDisabled}
          onClick={submitAgentMartDemo}
          className="h-13 rounded-2xl border-border bg-card px-5 text-base font-semibold shadow-xs"
        >
          <Sparkles className="size-5 text-secondary" />
          Try AgentMart demo
        </Button>
      </div>
    </form>
  );
};
