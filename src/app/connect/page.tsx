import { redirect } from "next/navigation";

import { ConnectionForm } from "@/components/connection-form";
import { isConnected } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  if (await isConnected()) {
    redirect("/");
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <ConnectionForm />
    </main>
  );
}
