import { z } from "zod";

export const inspectFormSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, "Enter a WebMCP application URL.")
    .pipe(z.httpUrl("Enter a valid URL, including http:// or https://.")),
});

export type InspectFormValues = z.infer<typeof inspectFormSchema>;
