import "server-only";

/**
 * Maps a thrown error from `pg` into a stable, user-facing shape.
 *
 * The frontend renders `message` directly; `code` lets us branch on
 * "auth failed" vs "host unreachable" without parsing strings.
 */
export type DbErrorCode =
  | "INVALID_URL"
  | "HOST_UNREACHABLE"
  | "AUTH_FAILED"
  | "DB_NOT_FOUND"
  | "SSL_REQUIRED"
  | "TIMEOUT"
  | "PERMISSION_DENIED"
  | "READ_ONLY_VIOLATION"
  | "UNKNOWN";

export type DbError = {
  code: DbErrorCode;
  message: string;
};

type PgErrorLike = {
  code?: string;
  errno?: string | number;
  message?: string;
};

export function toDbError(err: unknown): DbError {
  const e = err as PgErrorLike;

  // Connection-time errors surface as Node syscall errors (no pg code).
  if (e?.errno === "ENOTFOUND" || e?.code === "ENOTFOUND") {
    return { code: "HOST_UNREACHABLE", message: "Host could not be resolved." };
  }
  if (e?.code === "ECONNREFUSED") {
    return {
      code: "HOST_UNREACHABLE",
      message: "Connection refused — is the database accepting traffic on that port?",
    };
  }
  if (e?.code === "ETIMEDOUT") {
    return { code: "TIMEOUT", message: "Connection timed out." };
  }

  // Postgres SQLSTATE errors. Reference:
  // https://www.postgresql.org/docs/current/errcodes-appendix.html
  switch (e?.code) {
    case "28P01":
    case "28000":
      return { code: "AUTH_FAILED", message: "Authentication failed — check user and password." };
    case "3D000":
      return { code: "DB_NOT_FOUND", message: "Database does not exist on this server." };
    case "08006":
    case "08001":
      return {
        code: "SSL_REQUIRED",
        message:
          "Connection terminated — the server likely requires SSL. Append `?sslmode=require` to your connection string.",
      };
    case "42501":
      return {
        code: "PERMISSION_DENIED",
        message: "Permission denied. The role lacks privileges for this operation.",
      };
    case "25006":
      return {
        code: "READ_ONLY_VIOLATION",
        message: "Refused: that query would write to the database.",
      };
    case "57014":
      return { code: "TIMEOUT", message: "Statement timed out (over 10 seconds)." };
  }

  const message =
    typeof e?.message === "string" && e.message.length > 0
      ? e.message
      : "Unknown database error.";
  return { code: "UNKNOWN", message };
}
