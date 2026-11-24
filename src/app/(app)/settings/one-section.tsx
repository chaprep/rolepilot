"use client";

import { useState, type FormEvent } from "react";

import { useTrackSave } from "@/components/save-tracker";
import { Button, buttonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { loadOneView } from "@/lib/one/config";

import { checkOneSetup, removeOneSetup, saveOneSetup } from "./one-actions";

export function OneSection({ initial, outcome, inGuide = false }: {
  initial: Awaited<ReturnType<typeof loadOneView>>;
  outcome?: string | string[];
  inGuide?: boolean;
}) {
  const track = useTrackSave();
  const [view, setView] = useState(initial);
  const [clientId, setClientId] = useState(initial.clientId);
  const [permissionSet, setPermissionSet] = useState(initial.permissionSet);
  const [redirectUri, setRedirectUri] = useState(initial.redirectUri);
  const [connectKey, setConnectKey] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    outcome === "success" && initial.connected ? "One authorized. Test the connection to check the Exa actions."
    : outcome === "error" ? "One couldn’t connect. Check the credentials and callback URL, then try again."
    : "",
  );
  const dirty = clientId !== view.clientId || permissionSet !== view.permissionSet || redirectUri !== view.redirectUri
    || Boolean(connectKey || clientSecret);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const result = await track(saveOneSetup({ clientId, permissionSet, redirectUri, connectKey, clientSecret }));
      if (result.ok) {
        setView(result.data);
        setClientId(result.data.clientId);
        setPermissionSet(result.data.permissionSet);
        setRedirectUri(result.data.redirectUri);
        setConnectKey("");
        setClientSecret("");
        setMessage(result.data.connected ? "One settings saved." : "One settings saved. Connect with One to authorize Exa and Muapi.");
      } else setMessage(result.error);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMessage("Checking One permissions…");
    try {
      const result = await checkOneSetup({});
      if (result.ok) setView(result.data.view);
      setMessage(result.ok ? result.data.error ?? (result.data.view.muapiTested ? "Exa and Muapi permissions checked." : "Exa permissions checked. Authorize Muapi for LinkedIn people search.") : result.error);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const result = await track(removeOneSetup({}));
      if (result.ok) {
        setView(result.data);
        setClientId(result.data.clientId);
        setPermissionSet(result.data.permissionSet);
        setRedirectUri(result.data.redirectUri);
        setConnectKey("");
        setClientSecret("");
      }
      setMessage(result.ok ? "One settings removed from Rolepilot." : result.error);
    } finally {
      setBusy(false);
    }
  }

  const credentials = (
    <form onSubmit={(event) => void save(event)} className="flex flex-col gap-4">
      <Input label="One Connect key" type="password" autoComplete="off" value={connectKey}
        onChange={(event) => setConnectKey(event.target.value)} required={!view.saved}
        placeholder={view.saved ? "Saved · enter a new key to replace it" : undefined} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="One client ID" value={clientId} onChange={(event) => setClientId(event.target.value)} required />
        <Input label="One client secret" type="password" autoComplete="off" value={clientSecret}
          onChange={(event) => setClientSecret(event.target.value)} required={!view.saved}
          placeholder={view.saved ? "Saved · enter a new secret to replace it" : undefined} />
      </div>
      <Input label="One permission set ID" value={permissionSet} onChange={(event) => setPermissionSet(event.target.value)} required
        hint="In One, allow Exa’s Search and Get Contents and Muapi’s LinkedIn People Search, Look Up a LinkedIn Company Profile, and Get a Prediction’s Result." />
      <Input label="One callback URL" type="url" value={redirectUri} required onChange={(event) => setRedirectUri(event.target.value)}
        hint="Register this exact address on your One Connect app." />
      {view.unreadable && <p className="text-sm text-muted">The saved credentials couldn’t be read. Enter them again.</p>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy || !dirty}>Save One settings</Button>
        <Button variant="secondary" disabled={busy || dirty || !view.saved}
          onClick={() => window.location.assign(inGuide ? "/api/one/authorize?from=welcome" : "/api/one/authorize")}>
          {view.connected ? "Reconnect with One" : "Connect with One"}
        </Button>
        <Button variant="secondary" disabled={busy || dirty || !view.connected} onClick={() => void test()}>Test connection</Button>
        {(view.saved || view.unreadable) && <Button variant="text" disabled={busy} onClick={() => void remove()}>Remove One settings</Button>}
      </div>
    </form>
  );

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-medium">One{inGuide && " · Optional"}</h2>
        <p className="text-sm text-muted">Connect Exa to search the web and Muapi to find LinkedIn profiles for hiring contacts.</p>
      </div>
      {!view.saved && (
        <div className="flex flex-col items-start gap-2 text-sm text-muted">
          <p>Create or open a Connect app in One’s dashboard. Choose Exa and Muapi, register the callback URL below, and copy the app credentials into Rolepilot.</p>
          <p className="break-all font-mono text-xs text-ink">{view.redirectUri}</p>
          <a href="https://app.withone.ai/developers/connect" target="_blank" rel="noopener noreferrer" className={buttonClassName("secondary")}>
            Open One dashboard
          </a>
        </div>
      )}
      {inGuide && !view.saved ? (
        <details>
          <summary className="cursor-pointer text-sm font-medium">Enter One Connect credentials</summary>
          <div className="mt-4">{credentials}</div>
        </details>
      ) : credentials}
      <p className="text-sm text-muted">
        {view.connected ? (view.tested ? "Exa permissions checked." : "Connected to One. Test the Exa permissions.") : "One is disconnected."}
        {view.connected && (view.muapiTested ? " Muapi permissions checked." : " Muapi permissions are needed for LinkedIn people search.")}
        {" "}Testing checks permissions without running a search.
      </p>
      <p role="status" className="text-sm">{message}</p>
    </Card>
  );
}
