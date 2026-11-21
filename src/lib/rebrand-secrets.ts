import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { AI_API_KEY, JOB_SOURCE_KEY, TYPESAFE_KEY, GOOGLE_CLIENT_SECRET, GOOGLE_TOKEN, decryptSecret, encryptSecret, SecretUnreadable, type SecretKind } from "@/lib/secrets";

const KINDS: Record<string, SecretKind> = {
  apiKeyEnc: AI_API_KEY, jsearchKeyEnc: JOB_SOURCE_KEY, adzunaKeyEnc: JOB_SOURCE_KEY,
  typesafeKeyEnc: TYPESAFE_KEY, googleClientSecretEnc: GOOGLE_CLIENT_SECRET,
};

/** Rewrap readable v1 credentials; preserve damaged credentials for recovery with their original root secret. */
export async function migrateLegacySecrets(db: PrismaClient) {
  let migrated = 0;
  let unreadable = 0;
  await db.$transaction(async (tx) => {
    const rewrite = (kind: SecretKind, stored: string): string | null => {
      try { return encryptSecret(kind, decryptSecret(kind, stored)); }
      catch (error) {
        if (!(error instanceof SecretUnreadable)) throw error;
        unreadable++;
        return null;
      }
    };
    for (const row of await tx.setting.findMany({ where: { key: { in: Object.keys(KINDS) }, value: { startsWith: "v1." } } })) {
      const value = rewrite(KINDS[row.key], row.value);
      if (value !== null) migrated += (await tx.setting.updateMany({ where: { key: row.key, value: row.value }, data: { value } })).count;
    }
    for (const row of await tx.googleAccount.findMany({ where: { refreshTokenEnc: { startsWith: "v1." } } })) {
      const value = rewrite(GOOGLE_TOKEN, row.refreshTokenEnc);
      if (value !== null) migrated += (await tx.googleAccount.updateMany({ where: { id: row.id, refreshTokenEnc: row.refreshTokenEnc }, data: { refreshTokenEnc: value } })).count;
    }
  });
  return { migrated, unreadable };
}
