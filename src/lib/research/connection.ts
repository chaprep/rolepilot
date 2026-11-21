import "server-only";

import { ActionError } from "@/lib/action";
import { decryptSecret, ZYTE_KEY } from "@/lib/secrets";

import { readPage, ResearchError, searchWeb } from "./zyte";

export async function verifyZyte(stored: string): Promise<void> {
  let apiKey: string;
  try { apiKey = decryptSecret(ZYTE_KEY, stored); }
  catch { throw new ActionError("The saved Zyte key can’t be read. Enter it again."); }
  const options = { apiKey, signal: AbortSignal.timeout(65_000) };
  let checking = "search";
  try {
    await searchWeb("Example Domain", options);
    checking = "page retrieval";
    await readPage("https://example.com/", options);
  } catch (error) {
    const code = error instanceof ResearchError ? error.code : "network";
    if (code === "credentials") throw new ActionError("Zyte rejected the API key or this account lacks access.");
    if (code === "search-configuration") throw new ActionError("Zyte Search didn’t accept google.com. Check that the domain and Search API are enabled for your Zyte account.");
    if (code === "rate-limit") throw new ActionError(`Zyte rate-limited the ${checking} check. Try again shortly.`);
    throw new ActionError(`Zyte ${checking} failed. Check your connection and account access, then try again.`);
  }
}
