import "server-only";

import { createEnv } from "@t3-oss/env-nextjs";
import z from "zod";

export const serverEnv = createEnv({
  server: {
    BROWSERBASE_API_KEY: z.string().min(1),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },
  emptyStringAsUndefined: true,
  experimental__runtimeEnv: process.env,
});
