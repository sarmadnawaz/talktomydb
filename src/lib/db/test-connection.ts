import "server-only";

import { z } from "zod";

import { withClient } from "./client";
import { toDbError, type DbError } from "./errors";

const ConnectionStringSchema = z
  .string()
  .trim()
  .min(1, "Connection string is required.")
  .refine(
    (s) => /^postgres(ql)?:\/\//.test(s),
    "Connection string must start with `postgres://` or `postgresql://`.",
  );

export type TestConnectionResult =
  | {
      ok: true;
      info: {
        server_version: string;
        database: string;
        current_user: string;
        is_read_only: boolean;
      };
    }
  | { ok: false; error: DbError };

/**
 * Validates a connection string, opens a short-lived connection, and
 * sanity-checks that the safety flags we set actually took effect.
 *
 * Returns a discriminated union so callers (server actions, route
 * handlers) can render without try/catch boilerplate.
 */
export async function testConnection(input: string): Promise<TestConnectionResult> {
  const parsed = ConnectionStringSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "INVALID_URL",
        message: parsed.error.issues[0]?.message ?? "Invalid connection string.",
      },
    };
  }

  try {
    return await withClient(parsed.data, async (client) => {
      const result = await client.query<{
        server_version: string;
        database: string;
        current_user: string;
        is_read_only: string;
      }>(
        `SELECT
            current_setting('server_version')               AS server_version,
            current_database()                              AS database,
            current_user                                    AS current_user,
            current_setting('default_transaction_read_only') AS is_read_only`,
      );

      const row = result.rows[0];
      if (!row) {
        return {
          ok: false as const,
          error: { code: "UNKNOWN" as const, message: "Connection probe returned no rows." },
        };
      }
      return {
        ok: true as const,
        info: {
          server_version: row.server_version,
          database: row.database,
          current_user: row.current_user,
          is_read_only: row.is_read_only === "on",
        },
      };
    });
  } catch (err) {
    return { ok: false, error: toDbError(err) };
  }
}
