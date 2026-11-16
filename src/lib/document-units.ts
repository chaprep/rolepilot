import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { DocumentKind } from "@/generated/prisma/enums";
import { unitsSchema, type Unit } from "@/lib/application-data";
import { saveVersion, type VersionNote } from "@/lib/document-versions";
import { readDocumentState, type DocumentStates } from "@/lib/document-state";
import { synchronizeDocumentProfile } from "@/lib/resume-fit";
import { prisma } from "@/lib/prisma";

// Changes to a tailored document's units: an edit by hand (E8-3), a
// regenerated unit (E8-4), the refine chat's edits and their undo (E8-5,
// E8-6). They can overlap, since AI work runs in the background, so every
// change reads, edits and writes in one go, and starts over if a document
// changed in between. Nothing is overwritten unseen.

/** An application's documents by kind; a missing document is absent. */
export type DocumentUnits = Partial<Record<DocumentKind, Unit[]>>;

class ChangedMeanwhile extends Error {}

const ATTEMPTS = 3;

/**
 * Lets `change` edit the application's units (in place) and make other
 * writes with `tx`, then saves the documents whose units changed, all in one
 * transaction. With `version`, each changed document also gets a version
 * (E8-10): AI changes pass one, edits by hand don't. Returns what `change`
 * returns. With an existing transaction, the caller owns rollback and retry.
 */
export async function updateDocuments<T>(
  applicationId: string,
  change: (documents: DocumentUnits, tx: Prisma.TransactionClient, states: DocumentStates) => Promise<T>,
  { version, transaction }: { version?: VersionNote; transaction?: Prisma.TransactionClient } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      const write = async (tx: Prisma.TransactionClient) => {
        const rows = await tx.document.findMany({ where: { applicationId } });
        const documents: DocumentUnits = {};
        for (const row of rows) documents[row.kind] = unitsSchema.parse(row.units);
        const states: DocumentStates = Object.fromEntries(rows.map(row => [row.kind, readDocumentState(row.state)]));
        const before = new Map(rows.map(row => [row.kind, JSON.stringify({ units: documents[row.kind], state: states[row.kind] })]));

        const result = await change(documents, tx, states);

        for (const row of rows) {
          const units = unitsSchema.parse(documents[row.kind]);
          const state = states[row.kind] ?? null;
          if (state && row.kind === "RESUME" && JSON.stringify(units) !== JSON.stringify(unitsSchema.parse(row.units))) state.profile = synchronizeDocumentProfile(state.profile, units);
          if (JSON.stringify({ units, state }) === before.get(row.kind)) continue;
          // Only if nobody else saved it since it was read.
          const { count } = await tx.document.updateMany({
            where: { id: row.id, updatedAt: row.updatedAt },
            data: { units, state: state ? state as unknown as Prisma.InputJsonValue : Prisma.DbNull },
          });
          if (count === 0) throw new ChangedMeanwhile();
          if (row.kind === "RESUME") await tx.application.update({ where: { id: applicationId }, data: { resumeFit: Prisma.DbNull } });
          if (version) await saveVersion(tx, row.id, units, version, state);
        }
        return result;
      };
      return transaction ? await write(transaction) : await prisma.$transaction(write);
    } catch (error) {
      if (transaction || !(error instanceof ChangedMeanwhile) || attempt === ATTEMPTS) throw error;
    }
  }
}
