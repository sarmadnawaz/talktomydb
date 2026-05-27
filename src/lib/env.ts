import "server-only";

import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  ANTHROPIC_API_KEY: z
    .string()
    .min(1, "ANTHROPIC_API_KEY is required to generate SQL")
    .optional(),

  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters")
    .default("change-me-change-me-change-me-change-me-please"),

  APP_PASSWORD: z.string().min(1).optional(),
});

type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }

  if (parsed.data.NODE_ENV === "production") {
    if (parsed.data.SESSION_SECRET.startsWith("change-me-")) {
      throw new Error(
        "SESSION_SECRET must be set in production (got the development default).",
      );
    }
    if (!parsed.data.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY must be set in production.");
    }
  }

  return parsed.data;
}

export const env = loadEnv();
