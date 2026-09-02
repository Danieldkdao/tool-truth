"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Globe2, Sparkles } from "lucide-react";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  inspectFormSchema,
  type InspectFormValues,
} from "@/features/inspect/actions/schemas";
import { showToast } from "@/lib/utils";

export function WebsiteInspectionForm() {
  const form = useForm<InspectFormValues>({
    resolver: zodResolver(inspectFormSchema),
    defaultValues: {
      url: "",
    },
  });

  function onSubmit(data: InspectFormValues) {
    console.log(data);
    showToast("Website inspection submitted!", "success");
  }

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
          className="h-13 rounded-2xl px-6 text-base font-semibold shadow-sm shadow-primary/15"
        >
          Inspect website
          <ArrowRight className="size-5 transition-transform group-hover/button:translate-x-0.5" />
        </Button>

        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-13 rounded-2xl border-border bg-card px-5 text-base font-semibold shadow-xs"
        >
          <Sparkles className="size-5 text-secondary" />
          Try AgentMart demo
        </Button>
      </div>
    </form>
  );
}
