import { createCipheriv, hkdfSync } from "node:crypto";
import type { SecretKind } from "@/lib/secrets";
/** Construct the old format independently of the production decryptor. */
export function legacyCiphertext(kind: SecretKind, value: string) {
  const key = Buffer.from(hkdfSync("sha256", "a".repeat(32), "", `dossier ${kind.purpose} v1`, 32));
  const iv = Buffer.alloc(12, 7);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(kind.associatedData.replace("rolepilot ", "dossier ").replace(" v2", " v1")));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `v1.${iv.toString("base64url")}.${encrypted.toString("base64url")}`;
}

