"use client";

import { useState } from "react";

import { useTrackSave } from "@/components/save-tracker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import type { ActionResult } from "@/lib/action";
import type { SecretState } from "@/lib/secrets";

import { saveZyteKey, setCompanyResearch, testZyteConnection } from "./research-actions";

type ResearchSettings = { keyState: SecretState; enabled: boolean; verified: boolean };

export function ResearchSection({ initial }: { initial: ResearchSettings }) {
  const track = useTrackSave();
  const [settings, setSettings] = useState(initial);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function run(request: () => Promise<ActionResult<ResearchSettings>>, pending: string, success: string, clearInput = false) {
    setBusy(true);
    setMessage(pending);
    try {
      const result = await track(request());
      if (result.ok) {
        setSettings(result.data);
        if (clearInput) setKey("");
        setMessage(success);
      } else setMessage(result.error);
    } catch {
      setMessage("The request couldn’t be completed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-medium">Company research</h2>
        <p className="text-sm text-muted">When enabled, new cover letters can use public company information. Each run can make up to 3 Zyte searches and 5 page requests in 2 minutes. Matching findings are reused for 7 days.</p>
      </div>
      <Input label="Zyte API key" type="password" autoComplete="off" value={key} disabled={busy}
        onChange={(event) => setKey(event.target.value)}
        placeholder={settings.keyState === "set" ? "Saved · enter a new key to replace it" : "Enter your Zyte API key"}
        hint={settings.keyState === "unreadable" ? "The saved key can’t be read. Enter it again." : "Stored encrypted on your server."} />
      <div className="flex flex-wrap gap-3">
        <Button disabled={busy || !key.trim()} onClick={() => void run(() => saveZyteKey({ action: "set", value: key }), "Saving key…", "Key saved. Test the connection before enabling research.", true)}>Save Zyte key</Button>
        {settings.keyState !== "none" && <Button variant="secondary" disabled={busy} onClick={() => void run(() => saveZyteKey({ action: "clear" }), "Removing key…", "Key removed. Company research is off.", true)}>Remove Zyte key</Button>}
        <Button variant="secondary" disabled={busy || settings.keyState !== "set" || !!key.trim()} onClick={() => void run(() => testZyteConnection({}), "Checking Zyte search and page retrieval…", "Zyte search and page retrieval are connected.")}>Test Zyte connection</Button>
      </div>
      <Toggle label="Research companies for new cover letters" checked={settings.enabled}
        description={settings.verified ? "Uses the cover-letter model through OpenRouter." : "Test the saved key to enable research."}
        disabled={busy || (!settings.enabled && (settings.keyState !== "set" || !settings.verified || !!key.trim()))}
        onCheckedChange={(enabled) => void run(() => setCompanyResearch({ enabled }), "Updating research setting…", enabled ? "Company research is on." : "Company research is off.")} />
      <p role="status" className="text-sm">{message}</p>
    </Card>
  );
}
