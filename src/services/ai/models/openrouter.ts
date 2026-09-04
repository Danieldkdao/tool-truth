import { serverEnv } from "@/data/env/server";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export const TOOLTRUTH_ANALYSIS_MODEL_ID = "qwen/qwen3.8-flash";
export const TOOLTRUTH_FALLBACK_MODEL_ID = "z-ai/glm-5.3-flash";
export const TOOLTRUTH_SEMANTIC_MODEL_IDS = {
  contractChecker: "qwen/qwen3.8-flash",
  evidenceChecker: "minimax/minimax-m3",
  adjudicator: "z-ai/glm-5.3-flash",
} as const;

export const getToolTruthAnalysisModel = (
  modelId: string = TOOLTRUTH_ANALYSIS_MODEL_ID,
) => {
  if (!serverEnv.OPENROUTER_API_KEY) {
    return undefined;
  }

  const openrouter = createOpenRouter({
    apiKey: serverEnv.OPENROUTER_API_KEY,
  });

  return openrouter(modelId);
};
