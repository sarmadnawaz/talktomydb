import "server-only";

import { Client, type ClientConfig } from "pg";

/**
 * Safety budget enforced on every request-scoped client.
 *
 * - statement_timeout: hard ceiling per query. Caps runaway SELECTs.
 * - lock_timeout: refuse to wait on a row lock — read traffic should
 *   never block on writers.
 * - idle_in_transaction_session_timeout: drop us if we hang holding a
 *   transaction. Belt-and-suspenders since we use single-statement
 *   queries.
 * - default_transaction_read_only: a session-level read-only flag.
 *   This is a defense-in-depth — the *real* guarantee comes from the
 *   user connecting with a read-only Postgres role. The flag turns
 *   accidental writes into 25006 errors instead of mutations even if
 *   the role is over-privileged.
 */
export const SAFETY_PARAMS = {
  statement_timeout: "10s",
  lock_timeout: "2s",
  idle_in_transaction_session_timeout: "5s",
  default_transaction_read_only: "on",
} as const;

/**
 * Build a fresh `pg.Client` for one request.
 *
 * We deliberately do NOT pool. Each request gets its own short-lived
 * client so a leaked connection can't be reused across users, and the
 * session-level settings above can't be stomped by a previous query.
 *
 * SSL: if the URL specifies `sslmode=require` (or similar), `pg`
 * negotiates it via the URL. We never disable certificate validation;
 * if a managed DB needs `sslmode=no-verify` the user passes that
 * explicitly in their string.
 */
export function buildClient(connectionString: string): Client {
  const config: ClientConfig = {
    connectionString,
    // Connection-time budget — protects against silent network hangs.
    connectionTimeoutMillis: 5_000,
    // Hard cap on a single query. Mirrored by statement_timeout below;
    // both fire belt-and-suspenders.
    query_timeout: 15_000,
    // Apply our safety budget at the start of every session.
    // (Note: `pg` exposes this as `options`, a libpq-formatted string.)
    options: Object.entries(SAFETY_PARAMS)
      .map(([k, v]) => `-c ${k}=${v}`)
      .join(" "),
  };
  return new Client(config);
}

/**
 * Run `fn` against a fresh client, then close the connection no matter
 * what. Use this for one-shot operations (test connection, introspect
 * schema, run a SELECT). Throws on error — caller decides what to do.
 */
export async function withClient<T>(
  connectionString: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = buildClient(connectionString);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {
      // Best-effort cleanup — the connection might already be torn down
      // by the server (e.g. statement timeout terminated it). Swallowing
      // the secondary error is fine; the primary error already surfaced.
    });
  }
}
