import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import Ajv2019 from "ajv/dist/2019.js";
import Ajv2020 from "ajv/dist/2020.js";

import type { DetectedTool } from "@/features/inspect/components/inspection-data";

export type ToolInputValidationResult =
  | { valid: true }
  | {
      valid: false;
      code: "invalid_input" | "schema_unavailable";
      issues: Array<{ path: string; message: string }>;
    };

const AJV_OPTIONS = {
  allErrors: true,
  allowUnionTypes: true,
  strict: false,
} as const;
const validators = new Map<string, ValidateFunction>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parseSchema = (schema: DetectedTool["inputSchema"]) => {
  if (!schema) return null;
  if (typeof schema !== "string") return schema;

  try {
    const parsed = JSON.parse(schema) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const compileSchema = (schema: Record<string, unknown>) => {
  const dialect = typeof schema.$schema === "string" ? schema.$schema : "";
  if (/draft\/2020-12/i.test(dialect)) {
    return new Ajv2020(AJV_OPTIONS).compile(schema);
  }
  if (/draft\/2019-09/i.test(dialect)) {
    return new Ajv2019(AJV_OPTIONS).compile(schema);
  }
  return new Ajv(AJV_OPTIONS).compile(schema);
};

const readValidator = (schema: Record<string, unknown>) => {
  const key = JSON.stringify(schema);
  const existing = validators.get(key);
  if (existing) return existing;

  const validator = compileSchema(schema);
  if (validators.size >= 100) {
    const oldest = validators.keys().next().value;
    if (typeof oldest === "string") validators.delete(oldest);
  }
  validators.set(key, validator);
  return validator;
};

const formatIssue = (error: ErrorObject) => ({
  path: error.instancePath || "input",
  message: error.message ?? "is invalid",
});

export const validateDirectedToolInput = (
  tool: DetectedTool,
  input: Record<string, unknown>,
): ToolInputValidationResult => {
  const schema = parseSchema(tool.inputSchema);
  if (!schema) {
    return Object.keys(input).length === 0
      ? { valid: true }
      : {
          valid: false,
          code: "schema_unavailable",
          issues: [
            {
              path: "input",
              message:
                "The tool has no readable input schema, so only an empty input object can be verified exactly.",
            },
          ],
        };
  }

  try {
    const validator = readValidator(schema);
    return validator(input)
      ? { valid: true }
      : {
          valid: false,
          code: "invalid_input",
          issues: (validator.errors ?? []).slice(0, 12).map(formatIssue),
        };
  } catch {
    return Object.keys(input).length === 0
      ? { valid: true }
      : {
          valid: false,
          code: "schema_unavailable",
          issues: [
            {
              path: "input",
              message:
                "The tool input schema could not be compiled, so only an empty input object can be verified exactly.",
            },
          ],
        };
  }
};
