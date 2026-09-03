import { z } from "zod";

export const inspectFormSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, "Enter a WebMCP application URL.")
    .max(2048, "The URL is too long.")
    .pipe(z.httpUrl("Enter a valid URL, including http:// or https://.")),
  password: z
    .string()
    .min(1, "Enter the inspection password.")
    .max(256, "The inspection password is too long."),
});

export type InspectFormValues = z.infer<typeof inspectFormSchema>;

export const inspectionCreatedSchema = z.object({
  runId: z.string().startsWith("run_"),
  expiresAt: z.iso.datetime(),
});

export type InspectionCreated = z.infer<typeof inspectionCreatedSchema>;
