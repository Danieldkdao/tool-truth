import { serverEnv } from "@/data/env/server";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export const openrouter = createOpenRouter({
  apiKey: serverEnv.OPENROUTER_API_KEY,
});

export const TOOLTRUTH_ANALYSIS_MODEL_ID = "minimax/minimax-m3:free";

export const toolTruthAnalysisModel = openrouter(TOOLTRUTH_ANALYSIS_MODEL_ID);
