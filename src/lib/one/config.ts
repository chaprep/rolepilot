import "server-only";

import { createHash } from "node:crypto";

import { createOneConnect } from "@withone/connect/server";
import { z } from "zod";

import { ActionError } from "@/lib/action";
import { lockForTransaction } from "@/lib/db-lock";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret, ONE_CONFIG } from "@/lib/secrets";
import { requestOrigin } from "@/lib/settings-views";
import { loadSettings, saveSettings } from "@/lib/settings-data";
import { env } from "@/lib/env";

export const ONE_RETURN = "/settings?section=ai";
const CALLBACK = "/api/one/callback";
const CONFIG_LOCK = 974634120;

const field = z.string().trim().max(2048);
const redirectUri = field.pipe(z.url()).refine((value) => {
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return (url.protocol === "https:" || (url.protocol === "http:" && loopback))
    && url.pathname === CALLBACK && !url.search && !url.hash && !url.username && !url.password;
}, "Use the Rolepilot callback URL with HTTPS or a local HTTP address.");

export const oneSetupInput = z.object({
  clientId: field.min(1),
  clientSecret: field,
  connectKey: field,
  permissionSet: field.min(1),
  redirectUri,
});

const storedConfig = oneSetupInput.extend({
  clientSecret: field.min(1),
  connectKey: field.min(1),
});

function readConfig(ciphertext: string | null) {
  if (!ciphertext) return null;
  try {
    return storedConfig.parse(JSON.parse(decryptSecret(ONE_CONFIG, ciphertext)));
  } catch {
    return null;
  }
}

export async function loadOneView() {
  const { oneConfigEnc, oneUserReference, oneExaConnectionKey, oneMuapiConnectionKey } = await loadSettings();
  const config = readConfig(oneConfigEnc);
  return {
    clientId: config?.clientId ?? "",
    permissionSet: config?.permissionSet ?? "",
    redirectUri: config?.redirectUri ?? new URL(CALLBACK, env.ROLEPILOT_PUBLIC_URL ?? await requestOrigin()).href,
    saved: Boolean(config),
    unreadable: Boolean(oneConfigEnc && !config),
    connected: Boolean(config && oneUserReference),
    muapiTested: Boolean(config && oneUserReference && oneMuapiConnectionKey),
    tested: Boolean(config && oneUserReference && oneExaConnectionKey),
  };
}

export async function saveOneConfig(input: z.infer<typeof oneSetupInput> | null) {
  await prisma.$transaction(async (tx) => {
    await lockForTransaction(tx, CONFIG_LOCK);
    if (!input) {
      await saveSettings({ oneConfigEnc: null, oneUserReference: null, oneExaConnectionKey: null, oneMuapiConnectionKey: null }, tx);
      return;
    }
    const previous = readConfig((await loadSettings(tx)).oneConfigEnc);
    const candidate = {
      ...input,
      connectKey: input.connectKey || previous?.connectKey,
      clientSecret: input.clientSecret || previous?.clientSecret,
    };
    const parsed = storedConfig.safeParse(candidate);
    if (!parsed.success) throw new ActionError("Enter both the One Connect key and the One client secret.");
    if (JSON.stringify(previous) === JSON.stringify(parsed.data)) return;
    await saveSettings({
      oneConfigEnc: encryptSecret(ONE_CONFIG, JSON.stringify(parsed.data)),
      oneUserReference: null,
      oneExaConnectionKey: null, oneMuapiConnectionKey: null,
    }, tx);
  });
  return loadOneView();
}

export async function loadOneSetup(returnTo = ONE_RETURN) {
  const settings = await loadSettings();
  const ciphertext = settings.oneConfigEnc;
  const config = readConfig(ciphertext);
  if (!ciphertext || !config) return null;

  // Rolepilot has one signed-in owner per installation. The revision ties cached
  // MCP tokens and grant writes to this particular configuration.
  const revision = createHash("sha256").update(ciphertext).digest("base64url");
  const userId = `rolepilot-owner-${revision}`;
  const reference = settings.oneUserReference;
  const connect = createOneConnect({
    ...config,
    returnTo,
    userStore: {
      loadUser: async () => reference,
      saveUser: async (_userId, nextReference) => {
        await updateGrant({ ciphertext }, { oneUserReference: nextReference, oneExaConnectionKey: null, oneMuapiConnectionKey: null });
      },
      clearUser: async () => {
        await updateGrant({ ciphertext, reference }, { oneUserReference: null, oneExaConnectionKey: null, oneMuapiConnectionKey: null });
      },
    },
  });

  return { connect, config, userId, revision, ciphertext, reference, connectionKey: settings.oneExaConnectionKey, muapiConnectionKey: settings.oneMuapiConnectionKey };
}

export async function rememberOneConnection(setup: NonNullable<Awaited<ReturnType<typeof loadOneSetup>>>, connectionKey: string | null, muapiConnectionKey: string | null = null) {
  await updateGrant(setup, { oneExaConnectionKey: connectionKey, oneMuapiConnectionKey: muapiConnectionKey });
}

async function updateGrant(
  expected: { ciphertext: string; reference?: string | null },
  changes: { oneUserReference?: string | null; oneExaConnectionKey: string | null; oneMuapiConnectionKey: string | null },
) {
  await prisma.$transaction(async (tx) => {
    await lockForTransaction(tx, CONFIG_LOCK);
    const current = await loadSettings(tx);
    if (current.oneConfigEnc !== expected.ciphertext || (expected.reference !== undefined && current.oneUserReference !== expected.reference)) {
      throw new ActionError("The One connection changed. Try again with the current settings.");
    }
    await saveSettings(changes, tx);
  });
}
