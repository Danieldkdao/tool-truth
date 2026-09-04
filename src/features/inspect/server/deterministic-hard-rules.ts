import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";

import type {
  ContractAnalysisData,
  DetectedTool,
  DeterministicFact,
  DeterministicHardRuleViolation,
  StateChange,
} from "../components/inspection-data.ts";

export type DeterministicNetworkRequest = {
  type: string;
  method: string;
  path: string;
  status: number;
  error: string | null;
};

export type RepeatedInvocationEvidence = {
  firstStatus: "Completed" | "Canceled" | "Error";
  secondStatus: "Completed" | "Canceled" | "Error";
  firstOutput: unknown;
  secondOutput: unknown;
  secondStateChanges: StateChange[];
  secondMutatingRequests: string[];
};

type DeterministicBrowserSnapshot = {
  url: string;
  dom: Record<string, number>;
};

export type DeterministicHardRuleInput = {
  tool: DetectedTool;
  toolInput: Record<string, unknown>;
  toolOutput: unknown;
  invocationStatus: "Completed" | "Canceled" | "Error";
  invocationError?: string;
  stateChanges: StateChange[];
  mutatingRequests: string[];
  networkRequests: DeterministicNetworkRequest[];
  forbiddenDestinationRequests: string[];
  repeatedInvocation?: RepeatedInvocationEvidence;
  evidenceComplete: boolean;
  before: DeterministicBrowserSnapshot;
  after: DeterministicBrowserSnapshot;
};

export type DeterministicHardRuleEvaluation = {
  hardVerdict: ContractAnalysisData["deterministic"]["hardVerdict"];
  facts: DeterministicFact[];
  violations: DeterministicHardRuleViolation[];
};

const ajv = new Ajv({
  allErrors: true,
  allowUnionTypes: true,
  strict: false,
});
const schemaValidators = new Map<string, ValidateFunction>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parseSchema = (schema: DetectedTool["outputSchema"]) => {
  if (!schema) return null;
  if (typeof schema !== "string") return schema;

  try {
    const parsed = JSON.parse(schema) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const getSchemaValidator = (schema: Record<string, unknown>) => {
  const key = JSON.stringify(schema);
  const cached = schemaValidators.get(key);
  if (cached) return cached;

  const validator = ajv.compile(schema);
  if (schemaValidators.size >= 100) {
    const oldestKey = schemaValidators.keys().next().value;
    if (typeof oldestKey === "string") schemaValidators.delete(oldestKey);
  }
  schemaValidators.set(key, validator);
  return validator;
};

const formatSchemaErrors = (errors: ErrorObject[] | null | undefined) => {
  if (!errors || errors.length === 0) return "The output did not match the schema.";

  return errors
    .slice(0, 3)
    .map((error) => {
      const path = error.instancePath || "output";
      return `${path} ${error.message ?? "is invalid"}`;
    })
    .join("; ");
};

const indicatesReadOnlyBehavior = (tool: DetectedTool) => {
  const annotations = tool.annotations ?? {};
  if (annotations.readOnly === true || annotations.readOnlyHint === true) {
    return true;
  }

  if (annotations.readOnly === false || annotations.readOnlyHint === false) {
    return false;
  }

  const description = tool.description.trim();
  const declaresMutation =
    /\b(add|book|cancel|charge|checkout|create|delete|modify|order|place|purchase|remove|reserve|save|send|submit|update|write)\b/i.test(
      description,
    );

  if (declaresMutation) return false;

  return /\b(read[- ]only|no state changes?|without (?:changing|creating|modifying|saving|writing)|does not (?:change|create|modify|save|write))\b/i.test(
    description,
  );
};

const promisesMutation = (tool: DetectedTool) => {
  const annotations = tool.annotations ?? {};
  if (annotations.readOnly === false || annotations.readOnlyHint === false) {
    return true;
  }

  return /\b(adds?|books?|cancels?|charges?|checkouts?|creates?|deletes?|modifies?|places?|purchases?|removes?|reserves?|restores?|saves?|sends?|submits?|updates?|writes?)\b/i.test(
    tool.description,
  );
};

const promisesDirectlyObservableMutation = (tool: DetectedTool) => {
  const annotations = tool.annotations ?? {};
  if (
    annotations.observableMutation === true ||
    annotations.observableMutationHint === true
  ) {
    return true;
  }

  return /\b(cart|cookie|form|inventory|local\s*storage|order(?:\s+status)?|page|session\s*storage|ui|visible|displayed|rendered)\b/i.test(
    tool.description,
  );
};

const explicitlyClaimsSuccess = (output: unknown) => {
  if (typeof output === "string") {
    return /^(?:ok|success|successful|succeeded|completed)(?:[.!]|\s.*)?$/i.test(
      output.trim(),
    );
  }

  if (!isRecord(output)) return false;
  if (output.success === true || output.ok === true) return true;

  return [output.status, output.result].some(
    (value) =>
      typeof value === "string" &&
      /^(?:ok|success|successful|succeeded|completed|created|updated|deleted|canceled|cancelled)$/i.test(
        value.trim(),
      ),
  );
};

const isApplicationRequest = (request: DeterministicNetworkRequest) =>
  request.type === "fetch" ||
  request.type === "xhr" ||
  request.type === "other";

const isSuccessfulRequest = (request: DeterministicNetworkRequest) =>
  request.status >= 200 && request.status < 400 && !request.error;

const requiresConfirmation = (tool: DetectedTool) => {
  const annotations = tool.annotations ?? {};
  if (
    annotations.requiresConfirmation === true ||
    annotations.confirmationRequired === true ||
    annotations.confirmationRequiredHint === true
  ) {
    return true;
  }

  return /\b(?:requires?|asks? for|after|only after|must obtain)\s+(?:explicit\s+|user\s+)?confirmation\b/i.test(
    tool.description,
  );
};

const inputConfirmsAction = (input: Record<string, unknown>) =>
  Object.entries(input).some(
    ([key, value]) =>
      /^(?:confirm|confirmed|confirmation|approved|userApproved)$/i.test(key) &&
      value === true,
  );

export const toolPromisesIdempotency = (tool: DetectedTool) => {
  const annotations = tool.annotations ?? {};
  return (
    annotations.idempotent === true ||
    annotations.idempotentHint === true ||
    /\bidempoten(?:t|cy)\b|\brepeat(?:ing|ed)?\b.*\b(?:same|without (?:creating|changing|reducing))\b/i.test(
      `${tool.name} ${tool.description}`,
    )
  );
};

const consequentialStateChanges = (changes: StateChange[]) =>
  changes.filter(
    ([path]) =>
      path === "page.url" ||
      /^(localStorage|sessionStorage|cookies|form)\./.test(path),
  );

const readIdentity = (output: unknown): string | null => {
  if (!isRecord(output)) return null;

  for (const key of ["orderId", "order_id", "id"]) {
    const value = output[key];
    if (typeof value === "string" || typeof value === "number") {
      return `${key}:${String(value)}`;
    }
  }

  return isRecord(output.order) ? readIdentity(output.order) : null;
};

const createBaselineFacts = (
  input: DeterministicHardRuleInput,
): DeterministicFact[] => [
  {
    id: "invocation",
    statement: `The tool invocation ended with status ${input.invocationStatus}.`,
  },
  {
    id: "state_summary",
    statement: `${input.stateChanges.length} observable state changes and ${input.mutatingRequests.length} confirmed mutating requests were captured.`,
  },
  {
    id: "contract_classification",
    statement: indicatesReadOnlyBehavior(input.tool)
      ? "The declared contract was classified as read-only."
      : "The declared contract was not classified as read-only by the hard-rule engine.",
  },
  {
    id: "evidence_completeness",
    statement: input.evidenceComplete
      ? "The deterministic evidence capture completed without reaching its collection limits."
      : "The deterministic evidence capture was partial, so absence-based hard rules were not applied.",
  },
];

export const evaluateDeterministicHardRules = (
  input: DeterministicHardRuleInput,
): DeterministicHardRuleEvaluation => {
  const violations: DeterministicHardRuleViolation[] = [];
  const addViolation = (violation: DeterministicHardRuleViolation) => {
    if (!violations.some(({ id }) => id === violation.id)) {
      violations.push(violation);
    }
  };

  if (input.invocationStatus !== "Completed") {
    addViolation({
      id: "invocation_error",
      title: "The tool did not complete successfully",
      statement:
        input.invocationError?.trim() ||
        `The tool invocation ended with status ${input.invocationStatus}.`,
      suggestedRepair:
        "Inspect the invocation error, make the tool's required setup explicit, and retry with schema-valid input.",
      evidenceIds: ["invocation"],
    });
  }

  if (input.forbiddenDestinationRequests.length > 0) {
    addViolation({
      id: "forbidden_destination",
      title: "The tool contacted a forbidden destination",
      statement: `${input.forbiddenDestinationRequests.length} request${input.forbiddenDestinationRequests.length === 1 ? "" : "s"} attempted to reach a destination blocked by ToolTruth's network policy.`,
      suggestedRepair:
        "Remove the forbidden destination and route the operation only through explicitly allowed public services.",
      evidenceIds: ["hard_rule_signals"],
    });
  }

  if (input.invocationStatus === "Completed") {
    const outputSchema = parseSchema(input.tool.outputSchema);
    if (outputSchema) {
      try {
        const validator = getSchemaValidator(outputSchema);
        if (!validator(input.toolOutput)) {
          addViolation({
            id: "output_schema_mismatch",
            title: "The output does not match its declared schema",
            statement: formatSchemaErrors(validator.errors),
            suggestedRepair:
              "Return every required field with the declared types, or update the output schema to match the supported response contract.",
            evidenceIds: ["contract", "output"],
          });
        }
      } catch {
        // An invalid declaration cannot prove that the runtime output is wrong.
      }
    }

    const consequentialChanges = consequentialStateChanges(input.stateChanges);
    const mutationCount =
      consequentialChanges.length + input.mutatingRequests.length;
    if (indicatesReadOnlyBehavior(input.tool) && mutationCount > 0) {
      addViolation({
        id: "readonly_mutation",
        title: "A read-only tool changed observable state",
        statement: `The read-only contract produced ${consequentialChanges.length} consequential state change${consequentialChanges.length === 1 ? "" : "s"} and ${input.mutatingRequests.length} confirmed mutating request${input.mutatingRequests.length === 1 ? "" : "s"}.`,
        suggestedRepair:
          "Remove the side effect, or declare the mutation accurately and require confirmation when the action is consequential.",
        evidenceIds: ["contract", "hard_rule_signals"],
      });
    }

    const applicationRequests = input.networkRequests.filter(
      isApplicationRequest,
    );
    const failedApplicationRequests = applicationRequests.filter(
      (request) => !isSuccessfulRequest(request),
    );
    if (
      explicitlyClaimsSuccess(input.toolOutput) &&
      failedApplicationRequests.length > 0 &&
      applicationRequests.every((request) => !isSuccessfulRequest(request))
    ) {
      addViolation({
        id: "success_with_failed_request",
        title: "The tool reported success after its request failed",
        statement: `The output explicitly reported success, but all ${applicationRequests.length} captured application request${applicationRequests.length === 1 ? "" : "s"} failed.`,
        suggestedRepair:
          "Return a failure when the underlying request fails and expose a useful, non-sensitive error to the caller.",
        evidenceIds: ["output", "hard_rule_signals"],
      });
    }

    if (
      input.evidenceComplete &&
      promisesMutation(input.tool) &&
      promisesDirectlyObservableMutation(input.tool) &&
      explicitlyClaimsSuccess(input.toolOutput) &&
      input.stateChanges.length === 0 &&
      input.mutatingRequests.length === 0 &&
      applicationRequests.every((request) => !isSuccessfulRequest(request))
    ) {
      addViolation({
        id: "promised_mutation_missing",
        title: "The promised change did not occur",
        statement:
          "The tool reported success, but complete before-and-after evidence showed no state change and no successful request that could have performed the promised mutation.",
        suggestedRepair:
          "Perform and persist the promised change before returning success, then expose the resulting state so it can be verified.",
        evidenceIds: ["contract", "output", "ui_before", "ui_after"],
      });
    }

    if (
      requiresConfirmation(input.tool) &&
      explicitlyClaimsSuccess(input.toolOutput) &&
      mutationCount > 0 &&
      !inputConfirmsAction(input.toolInput) &&
      (input.after.dom.dialogs ?? 0) <= (input.before.dom.dialogs ?? 0)
    ) {
      addViolation({
        id: "confirmation_missing",
        title: "The promised confirmation step did not occur",
        statement:
          "A consequential action completed without confirmed input and without an observable confirmation prompt.",
        suggestedRepair:
          "Pause before the consequential action and require an explicit confirmation signal that is recorded in the invocation evidence.",
        evidenceIds: ["contract", "input", "output", "ui_before", "ui_after"],
      });
    }
  }

  const repeated = input.repeatedInvocation;
  if (
    repeated &&
    toolPromisesIdempotency(input.tool) &&
    repeated.firstStatus === "Completed"
  ) {
    const firstIdentity = readIdentity(repeated.firstOutput);
    const secondIdentity = readIdentity(repeated.secondOutput);
    const repeatedStateChanges = consequentialStateChanges(
      repeated.secondStateChanges,
    );
    if (
      repeated.secondStatus !== "Completed" ||
      repeatedStateChanges.length > 0 ||
      (firstIdentity !== null &&
        secondIdentity !== null &&
        firstIdentity !== secondIdentity)
    ) {
      addViolation({
        id: "idempotency_violation",
        title: "The repeated call violated its idempotency promise",
        statement:
          repeated.secondStatus !== "Completed"
            ? `Repeating the same input ended with status ${repeated.secondStatus} instead of returning the original result.`
            : repeatedStateChanges.length > 0
            ? `Repeating the same input caused ${repeatedStateChanges.length} additional consequential state change${repeatedStateChanges.length === 1 ? "" : "s"}.`
            : "Repeating the same input returned a different resource identity.",
        suggestedRepair:
          "Persist and reuse the first result for the same idempotency key without applying the mutation again.",
        evidenceIds: ["contract", "input", "repeated_invocation"],
      });
    }
  }

  const contractViolations = violations.filter(
    ({ id }) => id !== "invocation_error",
  );
  const hardVerdict: DeterministicHardRuleEvaluation["hardVerdict"] =
    contractViolations.length > 0
      ? "failed"
      : violations.some(({ id }) => id === "invocation_error")
        ? "error"
        : null;
  const facts = [
    ...createBaselineFacts(input),
    ...violations.map(({ id, statement }) => ({ id, statement })),
  ];

  return { hardVerdict, facts, violations };
};
