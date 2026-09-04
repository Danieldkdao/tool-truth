import type {
  DirectedAssertion,
  DirectedAssertionCheck,
  DirectedTestDefinition,
  DirectedTestEvaluation,
  StateChange,
} from "../components/inspection-data.ts";

export type DirectedEvaluationInput = {
  assertions: DirectedAssertion[];
  invocationStatus: "Completed" | "Canceled" | "Error";
  toolOutput: unknown;
  beforeUrl: string;
  afterUrl: string;
  stateChanges: StateChange[];
  mutatingRequests: string[];
  evidenceComplete: boolean;
  repeatedInvocation?: {
    firstStatus: "Completed" | "Canceled" | "Error";
    secondStatus: "Completed" | "Canceled" | "Error";
    firstOutput: unknown;
    secondOutput: unknown;
    secondStateChanges: StateChange[];
    secondMutatingRequests: string[];
  };
};

const PERSISTENT_STATE_PATH = /^(?:localStorage|sessionStorage|cookies)\./;
const FORBIDDEN_PATH_SEGMENTS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const serializeCanonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(serializeCanonicalJson).join(",")}]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${serializeCanonicalJson(value[key])}`,
      )
      .join(",")}}`;
  }

  return JSON.stringify(value) ?? String(value);
};

const readOutputPath = (output: unknown, path: string[]) => {
  let current = output;

  for (const segment of path) {
    if (
      !isRecord(current) ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return { exists: false, value: undefined } as const;
    }
    current = current[segment];
  }

  return { exists: true, value: current } as const;
};

export const isSafeDirectedOutputPath = (path: string[]) =>
  path.length > 0 &&
  path.length <= 8 &&
  path.every(
    (segment) =>
      segment.length > 0 &&
      segment.length <= 100 &&
      !FORBIDDEN_PATH_SEGMENTS.has(segment),
  );

export type DirectedLineageCandidate = {
  id: string;
  toolId: string;
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  directedTest?: Pick<DirectedTestDefinition, "rootProbeId" | "round">;
};

export type DirectedLineageResolution =
  | {
      ok: true;
      parentProbeId: string | null;
      rootProbeId: string;
      round: number;
    }
  | { ok: false; message: string };

export const resolveDirectedLineage = (
  probes: DirectedLineageCandidate[],
  toolId: string,
  newProbeId: string,
  basedOnProbeId?: string,
): DirectedLineageResolution => {
  const directedProbes = probes
    .filter((probe) => probe.toolId === toolId && probe.directedTest)
    .sort(
      (left, right) =>
        (left.directedTest?.round ?? 0) - (right.directedTest?.round ?? 0),
    );
  const activeProbe = directedProbes.find(
    (probe) => probe.status === "queued" || probe.status === "running",
  );
  if (activeProbe) {
    return {
      ok: false,
      message:
        "The latest directed round must complete before another round can start.",
    };
  }

  const latestCompleted = directedProbes
    .filter((probe) => probe.status === "completed")
    .at(-1);

  if (basedOnProbeId) {
    const requestedParent = probes.find((probe) => probe.id === basedOnProbeId);
    if (
      !requestedParent?.directedTest ||
      requestedParent.toolId !== toolId ||
      requestedParent.status !== "completed" ||
      requestedParent.id !== latestCompleted?.id
    ) {
      return {
        ok: false,
        message:
          "basedOnProbeId must reference the latest completed directed round for this tool.",
      };
    }
  }

  return {
    ok: true,
    parentProbeId: latestCompleted?.id ?? null,
    rootProbeId: latestCompleted?.directedTest?.rootProbeId ?? newProbeId,
    round: (latestCompleted?.directedTest?.round ?? 0) + 1,
  };
};

const evidenceSensitiveCheck = (
  assertion: DirectedAssertion,
  hasViolation: boolean,
  evidenceComplete: boolean,
  success: string,
  failure: string,
  evidenceIds: string[],
): DirectedAssertionCheck => {
  if (hasViolation) {
    return { assertion, status: "violated", explanation: failure, evidenceIds };
  }

  if (!evidenceComplete) {
    return {
      assertion,
      status: "inconclusive",
      explanation: "The captured evidence was incomplete, so absence could not be established reliably.",
      evidenceIds,
    };
  }

  return { assertion, status: "satisfied", explanation: success, evidenceIds };
};

const evaluateAssertion = (
  assertion: DirectedAssertion,
  input: DirectedEvaluationInput,
): DirectedAssertionCheck => {
  switch (assertion.kind) {
    case "invocation_status": {
      if (input.invocationStatus === "Canceled") {
        return {
          assertion,
          status: "inconclusive",
          explanation: "The invocation was canceled before its final status could be evaluated.",
          evidenceIds: ["invocation"],
        };
      }

      const actual = input.invocationStatus === "Completed" ? "completed" : "error";
      return {
        assertion,
        status: actual === assertion.expected ? "satisfied" : "violated",
        explanation:
          actual === assertion.expected
            ? `The invocation finished with the expected ${actual} status.`
            : `The invocation finished with ${actual}, not ${assertion.expected}.`,
        evidenceIds: ["invocation"],
      };
    }
    case "no_mutating_requests":
      return evidenceSensitiveCheck(
        assertion,
        input.mutatingRequests.length > 0,
        input.evidenceComplete,
        "No mutating network request was observed.",
        `${input.mutatingRequests.length} mutating network request${input.mutatingRequests.length === 1 ? " was" : "s were"} observed.`,
        ["network"],
      );
    case "no_observable_state_changes":
      return evidenceSensitiveCheck(
        assertion,
        input.stateChanges.length > 0,
        input.evidenceComplete,
        "No observable browser state change was captured.",
        `${input.stateChanges.length} observable browser state change${input.stateChanges.length === 1 ? " was" : "s were"} captured.`,
        ["state"],
      );
    case "no_persistent_state_changes": {
      const persistentChanges = input.stateChanges.filter(([path]) =>
        PERSISTENT_STATE_PATH.test(path),
      );
      return evidenceSensitiveCheck(
        assertion,
        persistentChanges.length > 0,
        input.evidenceComplete,
        "No cookie or browser-storage change was captured.",
        `${persistentChanges.length} persistent browser state change${persistentChanges.length === 1 ? " was" : "s were"} captured.`,
        ["state"],
      );
    }
    case "no_navigation":
      return evidenceSensitiveCheck(
        assertion,
        input.beforeUrl !== input.afterUrl,
        input.evidenceComplete,
        "The page remained at the original URL.",
        "The page navigated to a different URL.",
        ["navigation"],
      );
    case "same_input_is_idempotent": {
      const repeated = input.repeatedInvocation;
      if (!repeated) {
        return {
          assertion,
          status: "inconclusive",
          explanation: "A second identical invocation was not captured.",
          evidenceIds: ["repeated_invocation"],
        };
      }

      const sameOutput =
        serializeCanonicalJson(repeated.firstOutput) ===
        serializeCanonicalJson(repeated.secondOutput);
      const isIdempotent =
        repeated.firstStatus === "Completed" &&
        repeated.secondStatus === "Completed" &&
        repeated.secondStateChanges.length === 0 &&
        sameOutput;

      return {
        assertion,
        status: isIdempotent ? "satisfied" : "violated",
        explanation: isIdempotent
          ? "The identical second invocation completed without a new state effect or output change."
          : "The identical second invocation changed status, output, or observable state.",
        evidenceIds: ["repeated_invocation"],
      };
    }
    case "output_field_exists":
    case "output_field_equals": {
      if (input.invocationStatus !== "Completed") {
        return {
          assertion,
          status: "inconclusive",
          explanation: "The invocation did not complete, so its output field could not be evaluated.",
          evidenceIds: ["output"],
        };
      }

      const resolved = readOutputPath(input.toolOutput, assertion.path);
      if (assertion.kind === "output_field_exists") {
        return {
          assertion,
          status: resolved.exists ? "satisfied" : "violated",
          explanation: resolved.exists
            ? `The output contains ${assertion.path.join(".")}.`
            : `The output does not contain ${assertion.path.join(".")}.`,
          evidenceIds: ["output"],
        };
      }

      const equals =
        resolved.exists &&
        serializeCanonicalJson(resolved.value) ===
        serializeCanonicalJson(assertion.expected);
      return {
        assertion,
        status: equals ? "satisfied" : "violated",
        explanation: !resolved.exists
          ? `The output does not contain ${assertion.path.join(".")}.`
          : equals
            ? `The output field ${assertion.path.join(".")} matched the expected value.`
            : `The output field ${assertion.path.join(".")} did not match the expected value.`,
        evidenceIds: ["output"],
      };
    }
  }
};

export const evaluateDirectedTest = (
  input: DirectedEvaluationInput,
): DirectedTestEvaluation => {
  const checks = input.assertions.map((assertion) =>
    evaluateAssertion(assertion, input),
  );
  const verdict = checks.some((check) => check.status === "violated")
    ? "failed"
    : checks.some((check) => check.status === "inconclusive")
      ? "inconclusive"
      : "passed";

  return { verdict, checks };
};
