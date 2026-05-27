"use server";

import { redirect } from "next/navigation";

import { testConnection, type TestConnectionResult } from "@/lib/db/test-connection";
import { getSession } from "@/lib/session";

/**
 * Test-only: opens a short-lived probe connection and reports back.
 *
 * The string is **not** persisted to the session — `saveConnection`
 * is a separate action so the UI flow is: type → test (see result)
 * → save (commit).
 */
export async function testConnectionAction(
  _prev: TestConnectionResult | null,
  formData: FormData,
): Promise<TestConnectionResult> {
  const raw = formData.get("connectionString");
  if (typeof raw !== "string") {
    return {
      ok: false,
      error: { code: "INVALID_URL", message: "Connection string is required." },
    };
  }
  return testConnection(raw);
}

/**
 * Probe-then-commit. Same probe as `testConnectionAction` but on
 * success the string is saved into the encrypted session cookie and
 * the user is redirected into the app.
 *
 * On failure the function returns the error so the form can render it.
 */
export async function saveConnectionAction(
  _prev: TestConnectionResult | null,
  formData: FormData,
): Promise<TestConnectionResult> {
  const raw = formData.get("connectionString");
  if (typeof raw !== "string") {
    return {
      ok: false,
      error: { code: "INVALID_URL", message: "Connection string is required." },
    };
  }

  const result = await testConnection(raw);
  if (!result.ok) return result;

  const session = await getSession();
  session.connectionString = raw.trim();
  await session.save();

  redirect("/");
}

/** Clears the session cookie and bounces back to the connect screen. */
export async function disconnectAction(): Promise<void> {
  const session = await getSession();
  session.destroy();
  redirect("/connect");
}
