import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createTestClient, resetDatabase } from "@/test/db";

import { createPrismaClient } from "./database";

const db = createTestClient();

beforeEach(() => resetDatabase(db));
afterAll(() => db.$disconnect());

describe("the database client", () => {
  it("keeps a write made while a transaction is open out of that transaction", async () => {
    let opened!: () => void;
    const open = new Promise<void>((resolve) => (opened = resolve));
    const undone = db
      .$transaction(async (tx) => {
        await tx.fact.create({ data: { text: "inside" } });
        opened();
        await new Promise((resolve) => setTimeout(resolve, 50));
        throw new Error("undo");
      })
      .catch((error: Error) => error.message);

    await open;
    await db.fact.create({ data: { text: "outside" } });

    expect(await undone).toBe("undo");
    expect((await db.fact.findMany()).map((fact) => fact.text)).toEqual(["outside"]);
  });

  it("compares skill names without case", async () => {
    await db.skill.create({ data: { name: "TypeScript" } });
    expect(await db.skill.findUnique({ where: { name: "typescript" } })).toMatchObject({ name: "TypeScript" });
    await expect(db.skill.create({ data: { name: "TYPESCRIPT" } })).rejects.toThrow();
  });
});

it("serializes writes outside an SQLite transaction even in the PostgreSQL test run", async () => {
  const sqlite = createPrismaClient("file::memory:");
  try {
    await sqlite.$executeRaw`CREATE TABLE sample (name TEXT NOT NULL)`;
    const { promise: started, resolve: markStarted } = Promise.withResolvers<void>();
    const { promise: finish, resolve: release } = Promise.withResolvers<void>();
    const transaction = sqlite.$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO sample (name) VALUES ('inside')`;
      markStarted();
      await finish;
      throw new Error("roll back");
    });
    const rejected = expect(transaction).rejects.toThrow("roll back");
    await Promise.race([started, transaction]);
    const outside = sqlite.$executeRaw`INSERT INTO sample (name) VALUES ('outside')`.then((count) => count);
    release();
    await rejected;
    expect(await outside).toBe(1);
    await sqlite.$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO sample (name) VALUES ('committed')`;
    });
    expect(await sqlite.$queryRaw`SELECT name FROM sample ORDER BY name`).toEqual([{ name: "committed" }, { name: "outside" }]);
  } finally {
    await sqlite.$disconnect();
  }
});
