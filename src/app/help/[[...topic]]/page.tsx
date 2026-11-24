import { verifySession } from "@/lib/auth/session";
import Link from "next/link";
import { REPOSITORY_URL } from "@/lib/releases";
export const metadata = { title: "Help" };
export default async function HelpPage() {
  await verifySession();
  return <main className="mx-auto max-w-2xl space-y-6 p-8 text-ink">
    <h1 className="text-2xl font-semibold">Rolepilot help</h1>
    <p>Use Settings to connect OpenRouter, set up optional integrations such as One and Google, choose a job source, or manage backups.</p>
    <p>The setup guide walks through the connections and lets you skip optional services.</p>
    <p><Link href="/welcome?step=start" className="underline">Open the setup guide</Link></p>
    <p><Link href="/settings" className="underline">Open Settings</Link></p>
    <p><a href={`${REPOSITORY_URL}/blob/main/docs/README.md`} className="underline">Rolepilot documentation</a></p>
  </main>;
}
