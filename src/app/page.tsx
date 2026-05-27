export default function HomePage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-8">
      <div className="max-w-md space-y-3 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">TalkToMyDB</h1>
        <p className="text-sm text-muted-foreground">
          Production-grade text-to-SQL for Postgres. Read-only, guardrailed,
          schema-aware.
        </p>
      </div>
    </main>
  );
}
