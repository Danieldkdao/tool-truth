import { serverEnv } from "@/data/env/server";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export const TOOLTRUTH_ANALYSIS_MODEL_ID = "minimax/minimax-m3:free";

export const getToolTruthAnalysisModel = () => {
  if (!serverEnv.OPENROUTER_API_KEY) {
    return undefined;
  }

  const openrouter = createOpenRouter({
    apiKey: serverEnv.OPENROUTER_API_KEY,
  });

  return openrouter(TOOLTRUTH_ANALYSIS_MODEL_ID);
};
