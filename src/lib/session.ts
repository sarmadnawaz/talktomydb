import "server-only";

import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

import { env } from "./env";

/**
 * What we keep server-side per visitor.
 *
 * `connectionString` is the user's Postgres URL. It is **only** stored
 * inside this iron-session cookie — encrypted with SESSION_SECRET and
 * scoped to the browser. We never log it, never write it to disk, and
 * never expose it to the client bundle. See PRD §5.1.
 */
export type SessionData = {
  connectionString?: string;
};

const COOKIE_NAME = "talktomydb_session";

const sessionOptions: SessionOptions = {
  password: env.SESSION_SECRET,
  cookieName: COOKIE_NAME,
  // 7-day session. The cookie is replaced on every save anyway, so this
  // is really an idle timeout for inactive visitors.
  ttl: 60 * 60 * 24 * 7,
  cookieOptions: {
    httpOnly: true,
    sameSite: "strict",
    secure: env.NODE_ENV === "production",
    path: "/",
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

/** True if the visitor has stored a connection string in this session. */
export async function isConnected(): Promise<boolean> {
  const session = await getSession();
  return Boolean(session.connectionString);
}

/**
 * Reads the connection string from the session.
 *
 * Throws when no connection is set. Server code that requires one
 * should let this throw so callers see a clear "not connected" error
 * instead of a confusing pg-level failure.
 */
export async function requireConnectionString(): Promise<string> {
  const session = await getSession();
  if (!session.connectionString) {
    throw new Error("No database connection set for this session.");
  }
  return session.connectionString;
}
