import "server-only";

import { z } from "zod";

/**
 * Treat unset and "" the same — shells, .env files, and Vercel UIs all
 * happily produce empty-string values for "missing" entries, and we
 * don't want that to look different from undefined.
 */
const optionalString = z
  .string()
  .optional()
  .transform((s) => (s && s.length > 0 ? s : undefined));

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ANTHROPIC_API_KEY: optionalString,
  SESSION_SECRET: optionalString,
  APP_PASSWORD: optionalString,
});

type Env = z.infer<typeof EnvSchema> & { SESSION_SECRET: string };

const DEV_SESSION_SECRET = "talktomydb-dev-secret-do-not-use-in-production-please";

/**
 * `next build` runs server modules to collect page data, so any
 * `throw` at module-eval time turns the build into a hostage of
 * runtime secrets. Skip the production guards during the build phase
 * — the runtime check still fires when a request actually arrives.
 */
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

function loadEnv(): Env {
  const parsed = EnvSchema.parse(process.env);

  if (!parsed.SESSION_SECRET) {
    if (parsed.NODE_ENV === "production" && !isBuildPhase) {
      throw new Error(
        "SESSION_SECRET must be set in production. Generate one with `openssl rand -base64 48`.",
      );
    }
    return { ...parsed, SESSION_SECRET: DEV_SESSION_SECRET };
  }

  if (parsed.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters.");
  }

  return parsed as Env;
}

/**
 * Lazy proxy so module evaluation never crashes — validation runs on
 * first access. Modules import `env` freely without taking on the
 * "must have secrets" contract until they actually read a value.
 */
let cached: Env | null = null;
export const env = new Proxy({} as Env, {
  get(_, prop: string) {
    cached ??= loadEnv();
    return cached[prop as keyof Env];
  },
});
