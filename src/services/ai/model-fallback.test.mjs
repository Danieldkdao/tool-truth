import assert from "node:assert/strict";
import test from "node:test";

import {
  ModelFallbackExhaustedError,
  runWithModelFallback,
} from "./model-fallback.ts";

const PRIMARY_MODEL_ID = "primary/model";
const FALLBACK_MODEL_ID = "z-ai/glm-5.3-flash";

test("uses the fallback model when the primary generation fails", async () => {
  const attempts = [];

  const result = await runWithModelFallback({
    primaryModelId: PRIMARY_MODEL_ID,
    fallbackModelId: FALLBACK_MODEL_ID,
    run: async (modelId) => {
      attempts.push(modelId);
      if (modelId === PRIMARY_MODEL_ID) {
        throw new Error('[{"code":"invalid_type","path":["summary"]}]');
      }

      return "cohesive fallback output";
    },
  });

  assert.deepEqual(attempts, [PRIMARY_MODEL_ID, FALLBACK_MODEL_ID]);
  assert.deepEqual(result, {
    value: "cohesive fallback output",
    modelId: FALLBACK_MODEL_ID,
    usedFallback: true,
  });
});

test("returns a safe error after both models fail", async () => {
  await assert.rejects(
    runWithModelFallback({
      primaryModelId: PRIMARY_MODEL_ID,
      fallbackModelId: FALLBACK_MODEL_ID,
      run: async (modelId) => {
        throw new Error(`raw provider details from ${modelId}`);
      },
    }),
    (error) => {
      assert.ok(error instanceof ModelFallbackExhaustedError);
      assert.equal(
        error.message,
        "The model request failed after the fallback model was attempted.",
      );
      assert.doesNotMatch(error.message, /raw provider details/);
      return true;
    },
  );
});

test("does not invoke the fallback after cancellation", async () => {
  const controller = new AbortController();
  let fallbackWasCalled = false;

  await assert.rejects(
    runWithModelFallback({
      primaryModelId: PRIMARY_MODEL_ID,
      fallbackModelId: FALLBACK_MODEL_ID,
      signal: controller.signal,
      run: async (modelId) => {
        if (modelId === PRIMARY_MODEL_ID) {
          controller.abort();
          throw new DOMException("Cancelled", "AbortError");
        }

        fallbackWasCalled = true;
        return "unexpected";
      },
    }),
    (error) => error instanceof DOMException && error.name === "AbortError",
  );

  assert.equal(fallbackWasCalled, false);
});
