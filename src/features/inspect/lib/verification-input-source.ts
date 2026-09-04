import type { DirectedTestDefinition } from "../components/inspection-data.ts";

export type VerificationInputSource =
  | { kind: "generated" }
  | { kind: "directed"; test: DirectedTestDefinition };

export const resolveVerificationToolInput = async (
  source: VerificationInputSource,
  generate: () => Promise<Record<string, unknown>>,
) => (source.kind === "directed" ? source.test.input : generate());

export const directedInputRequestsIdempotency = (
  source: VerificationInputSource,
) =>
  source.kind === "directed" &&
  source.test.assertions.some(
    (assertion) => assertion.kind === "same_input_is_idempotent",
  );
