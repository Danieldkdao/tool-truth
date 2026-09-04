import { createHash } from "node:crypto";

import { z } from "zod";

import type {
  DirectedAssertion,
  DirectedTestDefinition,
  JsonValue,
} from "../components/inspection-data.ts";
import {
  isSafeDirectedOutputPath,
  serializeCanonicalJson,
} from "../lib/directed-verification.ts";

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const outputPathSchema = z
  .array(z.string().min(1).max(100))
  .min(1)
  .max(8)
  .refine(isSafeDirectedOutputPath, "The output path contains an unsafe segment.");

const directedAssertionSchema: z.ZodType<DirectedAssertion> =
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("invocation_status"),
      expected: z.enum(["completed", "error"]),
    }).strict(),
    z.object({ kind: z.literal("no_mutating_requests") }).strict(),
    z.object({ kind: z.literal("no_observable_state_changes") }).strict(),
    z.object({ kind: z.literal("no_persistent_state_changes") }).strict(),
    z.object({ kind: z.literal("no_navigation") }).strict(),
    z.object({ kind: z.literal("same_input_is_idempotent") }).strict(),
    z.object({
      kind: z.literal("output_field_exists"),
      path: outputPathSchema,
    }).strict(),
    z.object({
      kind: z.literal("output_field_equals"),
      path: outputPathSchema,
      expected: jsonValueSchema,
    }).strict(),
  ]);

export const directedVerificationRequestSchema = z
  .object({
    toolId: z.string().min(1).max(500),
    request: z.string().trim().min(1).max(2_000),
    input: z.record(z.string(), jsonValueSchema),
    assertions: z.array(directedAssertionSchema).min(1).max(8),
    basedOnProbeId: z.string().min(1).max(500).optional(),
  })
  .strict();

export type ParsedDirectedVerificationRequest = z.infer<
  typeof directedVerificationRequestSchema
>;

export const createDirectedInputHash = (
  input: Record<string, JsonValue>,
) =>
  createHash("sha256")
    .update(serializeCanonicalJson(input))
    .digest("hex");

export const toDirectedTestDefinition = (
  request: ParsedDirectedVerificationRequest,
  lineage: Pick<
    DirectedTestDefinition,
    "parentProbeId" | "rootProbeId" | "round"
  >,
): DirectedTestDefinition => ({
  request: request.request,
  input: request.input,
  inputHash: createDirectedInputHash(request.input),
  assertions: request.assertions,
  ...lineage,
});

export const formatZodIssues = (error: z.ZodError) =>
  error.issues.map((issue) => ({
    path: issue.path.join(".") || "request",
    message: issue.message,
  }));
