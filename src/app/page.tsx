import { redirect } from "next/navigation";

import { isConnected } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!(await isConnected())) {
    redirect("/connect");
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-8">
      <div className="max-w-md space-y-3 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Connected</h1>
        <p className="text-muted-foreground text-sm">
          Schema tree and query workspace land in the next milestone.
        </p>
      </div>
    </main>
  );
}
