"use client";

import { useState } from "react";
import { useTrackSave } from "@/components/save-tracker";
import { AiProvider } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { MODEL_ASSIGNMENTS, JEV } from "@/lib/ai/assignments";
import type { AiSettingsView } from "@/lib/ai/provider-options";
import { saveApiKey, testOpenRouterConnection } from "./actions";

export function AiProviderSection({ initial }: { initial: AiSettingsView }) {
  const track = useTrackSave();
  const [key, setKey] = useState("");
  const [state, setState] = useState(initial.keyState);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<{ model: string; connected: boolean; message: string }[]>([]);
  async function save(clear = false) {
    setBusy(true);
    try {
      const result = await track(saveApiKey({ provider: AiProvider.OPENAI,
        change: clear ? { action: "clear" } : { action: "set", value: key } }));
      if (result.ok) { setState(result.data.keyState); setKey(""); setResults([]); setMessage("API key updated."); }
      else setMessage(result.error);
    } finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setResults([]); setMessage("Checking Luna, Sonnet, and Jev…");
    try {
      const result = await testOpenRouterConnection({});
      if (result.ok) { setResults(result.data.results); setMessage("Connection checks finished."); }
      else setMessage(result.error);
    } finally { setBusy(false); }
  }
  return <div className="flex flex-col gap-5">
    <div><h2 className="text-lg font-medium">OpenRouter</h2>
      <p className="text-sm text-muted">One API key connects the models assigned to each task. Your profile and task content go to OpenRouter and the model provider.</p></div>
    <Card className="flex flex-col gap-4">
      <Input label="OpenRouter API key" type="password" autoComplete="off" value={key}
        onChange={(event) => setKey(event.target.value)}
        placeholder={state === "set" ? "Saved · enter a new key to replace it" : state === "env" ? "Using DOSSIER_AI_KEY" : "Enter your OpenRouter API key"}
        hint={state === "unreadable" ? "The saved key cannot be read. Enter it again." : "Stored encrypted on your server."} />
      <div className="flex flex-wrap gap-3">
        <Button disabled={busy || !key.trim()} onClick={() => void save()}>Save key</Button>
        {(state === "set" || state === "unreadable") && <Button variant="secondary" disabled={busy} onClick={() => void save(true)}>Remove saved key</Button>}
        <Button variant="secondary" disabled={busy || Boolean(key.trim())} onClick={() => void test()}>Test connection</Button>
      </div>
      <p className="text-sm text-muted">Save changes before testing. Connection tests make small requests to all three models and use API credits.</p>
      <p role="status" className="text-sm">{message}</p>
      {results.map((result) => <p key={result.model} className="text-sm">{result.model}: {result.connected ? "Connected" : result.message}</p>)}
      <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-sm underline">Manage OpenRouter API keys</a>
    </Card>
    <Card><h3 className="mb-3 font-medium">Models by task</h3>
      <dl className="divide-y divide-line">{MODEL_ASSIGNMENTS.map((item) => <div key={item.task} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
        <dt>{item.label}</dt><dd className="text-muted">{item.model} · Medium</dd>
      </div>)}<div className="flex flex-wrap justify-between gap-2 py-3 text-sm"><dt>Job and resume scoring</dt><dd className="text-muted">{JEV}</dd></div></dl>
    </Card>
  </div>;
}
