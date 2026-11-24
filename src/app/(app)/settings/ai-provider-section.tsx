"use client";

import { useState } from "react";
import { useTrackSave } from "@/components/save-tracker";
import { CheckCircle2 } from "lucide-react";
import { AiProvider } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import type { AiSettingsView } from "@/lib/ai/provider-options";
import { saveApiKey, testOpenRouterConnection } from "./actions";

export function AiProviderSection({ initial }: { initial: AiSettingsView & { verified?: boolean } }) {
  const track = useTrackSave();
  const [key, setKey] = useState("");
  const [state, setState] = useState(initial.keyState);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [verified, setVerified] = useState(initial.verified ?? false);
  const hasKey = state === "set" || state === "env";
  const showVerification = verified && !message;
  async function save(clear = false) {
    setBusy(true);
    try {
      const result = await track(saveApiKey({ provider: AiProvider.OPENAI,
        change: clear ? { action: "clear" } : { action: "set", value: key } }));
      if (result.ok) {
        setState(result.data.keyState);
        setKey("");
        setVerified(false);
        setMessage(clear ? "Saved key removed." : "API key saved. Select Test connection to verify OpenRouter.");
      } else setMessage(result.error);
    } finally { setBusy(false); }
  }
  async function test() {
    setBusy(true);
    setVerified(false);
    setMessage("Checking your OpenRouter connection…");
    try {
      const result = await testOpenRouterConnection({});
      setVerified(result.ok && result.data.connected);
      setMessage(result.ok ? (result.data.connected ? "" : result.data.message) : result.error);
    } finally { setBusy(false); }
  }
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-medium">OpenRouter</h2>
        <p className="text-sm text-muted">Your profile and task content go to OpenRouter and the provider processing your request.</p>
      </div>
      <Input label="OpenRouter API key" type="password" autoComplete="off" value={key}
        onChange={(event) => setKey(event.target.value)}
        placeholder={state === "set" ? "Saved · enter a new key to replace it" : state === "env" ? "Using ROLEPILOT_AI_KEY" : "Enter your OpenRouter API key"}
        hint={state === "unreadable" ? "The saved key cannot be read. Enter it again." : "Stored encrypted on your server."} />
      <div className="flex flex-wrap gap-3">
        <Button variant={hasKey && !key.trim() ? "secondary" : "primary"} disabled={busy || !key.trim()} onClick={() => void save()}>Save key</Button>
        {(state === "set" || state === "unreadable") && <Button variant="secondary" disabled={busy} onClick={() => void save(true)}>Remove saved key</Button>}
        <Button variant={hasKey && !verified && !key.trim() ? "primary" : "secondary"} disabled={busy || !hasKey || Boolean(key.trim())} onClick={() => void test()}>Test connection</Button>
      </div>
      <p role="status" className={showVerification ? "flex items-center gap-2 text-sm font-medium text-success" : "text-sm"}>
        {showVerification && <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />}
        {message || (verified ? "OpenRouter connection verified." : hasKey ? "Select Test connection to verify your saved key." : "")}
      </p>
      <p className="text-sm text-muted">Connection tests make small requests that use API credits.</p>
      <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-sm underline">Manage OpenRouter API keys</a>
    </Card>
  );
}
