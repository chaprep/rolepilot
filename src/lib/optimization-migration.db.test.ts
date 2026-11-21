import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterAll, expect, it } from "vitest";
import { createTestClient, testsUseSqlite } from "@/test/db";

const client = createTestClient();
afterAll(() => client.$disconnect());
const rows = [{ key: "creativity", value: "EXPRESSIVE" }, { key: "docLanguage", value: "German" }, { key: "resumeLanguage", value: "Arabic" }, { key: "customLanguages", value: '["Farsi"]' }, { key: "paper", value: "LETTER" }];

it("upgrades populated legacy settings while retaining unrelated data", async () => {
  const backend = testsUseSqlite() ? "prisma/sqlite" : "prisma";
  const sql = readFileSync(`${backend}/migrations/20261118130000_resume_optimization/migration.sql`, "utf8");
  if (testsUseSqlite()) {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec('CREATE TABLE "Setting" ("key" TEXT PRIMARY KEY, "value" TEXT NOT NULL)');
      for (const row of rows) db.prepare('INSERT INTO "Setting" VALUES (?, ?)').run(row.key, row.value);
      db.exec(sql);
      expect(db.prepare('SELECT * FROM "Setting" ORDER BY "key"').all()).toEqual([{ key: "creativity", value: "OPTIMIZED" }, { key: "paper", value: "LETTER" }]);
    } finally { db.close(); }
  } else {
    await client.$transaction(async tx => {
      await tx.$executeRawUnsafe('CREATE SCHEMA optimization_upgrade_test');
      await tx.$executeRawUnsafe('SET LOCAL search_path TO optimization_upgrade_test');
      await tx.$executeRawUnsafe('CREATE TYPE "Creativity" AS ENUM (\'FAITHFUL\', \'BALANCED\', \'EXPRESSIVE\')');
      await tx.$executeRawUnsafe('CREATE TABLE "Setting" ("key" TEXT PRIMARY KEY, "value" TEXT NOT NULL)');
      for (const row of rows) await tx.$executeRaw`INSERT INTO "Setting" VALUES (${row.key}, ${row.value})`;
      for (const statement of sql.split(";").filter(statement => statement.trim())) await tx.$executeRawUnsafe(statement);
      expect(await tx.$queryRawUnsafe('SELECT * FROM "Setting" ORDER BY "key"')).toEqual([{ key: "creativity", value: "OPTIMIZED" }, { key: "paper", value: "LETTER" }]);
      expect(await tx.$queryRawUnsafe('SELECT \'OPTIMIZED\'::"Creativity"::text AS value')).toEqual([{ value: "OPTIMIZED" }]);
      await tx.$executeRawUnsafe('DROP SCHEMA optimization_upgrade_test CASCADE');
    });
  }
});
