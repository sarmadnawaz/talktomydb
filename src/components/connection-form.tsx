"use client";

import { useActionState } from "react";
import {
  CheckCircle2Icon,
  DatabaseIcon,
  Loader2Icon,
  ShieldCheckIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveConnectionAction,
  testConnectionAction,
} from "@/lib/actions/connection";
import type { TestConnectionResult } from "@/lib/db/test-connection";

const EXAMPLE = "postgres://user:password@host:5432/database?sslmode=require";

export function ConnectionForm() {
  const [testResult, runTest, isTesting] = useActionState<TestConnectionResult | null, FormData>(
    testConnectionAction,
    null,
  );
  const [saveResult, runSave, isSaving] = useActionState<TestConnectionResult | null, FormData>(
    saveConnectionAction,
    null,
  );

  // saveConnectionAction redirects on success, so a non-null `saveResult`
  // is always an error. testResult is the only path that can be ok=true.
  const error =
    saveResult && !saveResult.ok ? saveResult.error : testResult && !testResult.ok
      ? testResult.error
      : null;
  const success = testResult?.ok ? testResult.info : null;
  const busy = isTesting || isSaving;

  return (
    <div className="bg-card text-card-foreground w-full max-w-xl rounded-xl border p-6 shadow-sm sm:p-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="bg-muted flex size-10 items-center justify-center rounded-lg">
          <DatabaseIcon className="size-5" />
        </div>
        <div>
          <h1 className="text-lg leading-tight font-semibold tracking-tight">
            Connect a Postgres database
          </h1>
          <p className="text-muted-foreground text-sm">
            Paste a connection string. Use a read-only role.
          </p>
        </div>
      </div>

      <form className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="connectionString">Connection string</Label>
          <Input
            id="connectionString"
            name="connectionString"
            type="text"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={EXAMPLE}
            className="font-mono text-xs sm:text-sm"
            required
          />
          <p className="text-muted-foreground text-xs">
            Stored only in an encrypted, httpOnly cookie scoped to your browser.
            Never logged, never persisted server-side.
          </p>
        </div>

        {error ? (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>{labelForCode(error.code)}</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}

        {success ? (
          <Alert>
            <CheckCircle2Icon />
            <AlertTitle>
              Connected to <span className="font-mono">{success.database}</span> as{" "}
              <span className="font-mono">{success.current_user}</span>
            </AlertTitle>
            <AlertDescription>
              <span>PostgreSQL {success.server_version}</span>
              {success.is_read_only ? (
                <span className="text-foreground inline-flex items-center gap-1">
                  <ShieldCheckIcon className="size-3.5" /> Read-only session verified
                </span>
              ) : (
                <span className="text-destructive">
                  Read-only flag did not take — proceed with caution.
                </span>
              )}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex gap-2 pt-1">
          <Button type="submit" formAction={runTest} variant="secondary" disabled={busy}>
            {isTesting ? <Loader2Icon className="animate-spin" /> : null}
            Test connection
          </Button>
          <Button type="submit" formAction={runSave} disabled={busy}>
            {isSaving ? <Loader2Icon className="animate-spin" /> : null}
            Connect
          </Button>
        </div>
      </form>
    </div>
  );
}

function labelForCode(code: string): string {
  switch (code) {
    case "INVALID_URL":
      return "Invalid connection string";
    case "HOST_UNREACHABLE":
      return "Host unreachable";
    case "AUTH_FAILED":
      return "Authentication failed";
    case "DB_NOT_FOUND":
      return "Database not found";
    case "SSL_REQUIRED":
      return "SSL required";
    case "TIMEOUT":
      return "Connection timed out";
    case "PERMISSION_DENIED":
      return "Permission denied";
    case "READ_ONLY_VIOLATION":
      return "Refused — write attempt blocked";
    default:
      return "Connection failed";
  }
}
