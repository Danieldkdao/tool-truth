import "server-only";

import { createEnv } from "@t3-oss/env-nextjs";
import z from "zod";

export const serverEnv = createEnv({
  server: {
    BROWSERBASE_API_KEY: z.string().min(1).optional(),
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    STAGEHAND_ENV: z.enum(["local", "browserbase"]).default("local"),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },
  emptyStringAsUndefined: true,
  experimental__runtimeEnv: process.env,
});
