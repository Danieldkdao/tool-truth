export class ModelFallbackExhaustedError extends Error {
  readonly primaryError: unknown;
  readonly fallbackError: unknown;

  constructor(primaryError: unknown, fallbackError: unknown) {
    super("The model request failed after the fallback model was attempted.");
    this.name = "ModelFallbackExhaustedError";
    this.primaryError = primaryError;
    this.fallbackError = fallbackError;
  }
}

type RunWithModelFallbackOptions<T> = {
  primaryModelId: string;
  fallbackModelId: string;
  run: (modelId: string) => Promise<T>;
  signal?: AbortSignal;
  onFallback?: (fallbackModelId: string) => void;
};

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw new DOMException("The model request was cancelled.", "AbortError");
  }
};

export const runWithModelFallback = async <T>({
  primaryModelId,
  fallbackModelId,
  run,
  signal,
  onFallback,
}: RunWithModelFallbackOptions<T>) => {
  throwIfAborted(signal);

  try {
    return {
      value: await run(primaryModelId),
      modelId: primaryModelId,
      usedFallback: false,
    };
  } catch (primaryError) {
    throwIfAborted(signal);
    onFallback?.(fallbackModelId);

    try {
      return {
        value: await run(fallbackModelId),
        modelId: fallbackModelId,
        usedFallback: true,
      };
    } catch (fallbackError) {
      throwIfAborted(signal);
      throw new ModelFallbackExhaustedError(primaryError, fallbackError);
    }
  }
};
