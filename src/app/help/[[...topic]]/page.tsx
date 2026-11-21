import { verifySession } from "@/lib/auth/session";
import Link from "next/link";
import { REPOSITORY_URL } from "@/lib/releases";
export const metadata = { title: "Help" };
export default async function HelpPage() {
  await verifySession();
  return <main className="mx-auto max-w-2xl space-y-6 p-8 text-ink">
    <h1 className="text-2xl font-semibold">rolepilot help</h1>
    <p>Open Settings to configure your AI provider, job sources, Google connection, scoring and backups.</p>
    <p>The setup guide explains each connection and lets you skip services you do not use.</p>
    <p><Link href="/welcome?step=start" className="underline">Open the setup guide</Link></p>
    <p><Link href="/settings" className="underline">Open Settings</Link></p>
    <p><a href={REPOSITORY_URL} className="underline">Source code and documentation</a></p>
  </main>;
}
