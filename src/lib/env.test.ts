import path from "node:path";

import { describe, expect, it } from "vitest";

import { EnvError, parseEnv } from "./env";

// A hash of "correct horse" (scripts/hash-password.ts).
const PASSWORD_HASH = "argon2id:m=19456,t=2,p=1:CLZW5wQoCjh3Q9CHBp_JWw:Ak2xS7TYlYYrhemlgBkVxFmWXfcMq_rjd0mJGZcZFfA";

const valid = {
  ROLEPILOT_PASSWORD: PASSWORD_HASH,
  ROLEPILOT_SECRET: "a".repeat(32),
  DATABASE_URL: "postgresql://postgres:postgres@db:5432/rolepilot",
};

function problems(source: Record<string, string | undefined>): string[] {
  try {
    parseEnv(source);
  } catch (error) {
    if (error instanceof EnvError) return error.problems;
    throw error;
  }
  throw new Error("Expected parseEnv to throw");
}

describe("parseEnv", () => {
  it("ignores retired notification endpoint overrides", () => {
    expect(parseEnv({ ...valid, ROLEPILOT_API_URL: "ftp://legacy.example", ROLEPILOT_UPDATES_TEST_BASE_URL: "legacy" })).toEqual(parseEnv(valid));
  });

  it("accepts the required variables and fills in defaults", () => {
    expect(parseEnv(valid)).toEqual({
      ...valid,
      ROLEPILOT_DATA_DIR: "/data",
      ROLEPILOT_BACKUP_RETENTION_DAYS: 14,
    });
  });


  it("reads the optional variables", () => {
    const env = parseEnv({
      ...valid,
      ROLEPILOT_DATA_DIR: "/srv/rolepilot",
      ROLEPILOT_BACKUP_RETENTION_DAYS: "30",
      ROLEPILOT_AI_PROVIDER: "local",
      ROLEPILOT_AI_URL: "http://ollama:11434",
      ROLEPILOT_AI_MODEL: "llama3.1:8b",
      ROLEPILOT_AI_KEY: "sk-test",
    });
    expect(env).toMatchObject({
      ROLEPILOT_DATA_DIR: "/srv/rolepilot",
      ROLEPILOT_BACKUP_RETENTION_DAYS: 30,
      ROLEPILOT_AI_PROVIDER: "local",
      ROLEPILOT_AI_URL: "http://ollama:11434",
      ROLEPILOT_AI_MODEL: "llama3.1:8b",
      ROLEPILOT_AI_KEY: "sk-test",
    });
  });

  it("reads the AI timeout in seconds", () => {
    expect(parseEnv({ ...valid, ROLEPILOT_AI_TIMEOUT_SECONDS: " 300 " }).ROLEPILOT_AI_TIMEOUT_SECONDS).toBe(300);
    expect(() => parseEnv({ ...valid, ROLEPILOT_AI_TIMEOUT_SECONDS: "5m" })).toThrow(/whole number of seconds/);
    expect(() => parseEnv({ ...valid, ROLEPILOT_AI_TIMEOUT_SECONDS: "1" })).toThrow(/at least 5/);
  });

  it("resolves a relative data directory", () => {
    const env = parseEnv({ ...valid, ROLEPILOT_DATA_DIR: "./data" });
    expect(env.ROLEPILOT_DATA_DIR).toBe(path.resolve("data"));
  });

  it("treats empty values as unset", () => {
    const env = parseEnv({ ...valid, ROLEPILOT_AI_KEY: "", ROLEPILOT_DATA_DIR: " " });
    expect(env.ROLEPILOT_AI_KEY).toBeUndefined();
    expect(env.ROLEPILOT_DATA_DIR).toBe("/data");
    expect(problems({ ...valid, ROLEPILOT_PASSWORD: "" })).toEqual([
      expect.stringMatching(/^ROLEPILOT_PASSWORD is not set\./),
    ]);
  });

  it("names every missing required variable", () => {
    expect(problems({})).toEqual([
      expect.stringMatching(/^ROLEPILOT_PASSWORD is not set\. Set it to/),
      expect.stringMatching(/^ROLEPILOT_SECRET is not set\. .*openssl rand/),
      expect.stringMatching(/^DATABASE_URL is not set\. /),
    ]);
  });

  it("takes an SQLite file as the database, by its full path", () => {
    expect(parseEnv({ ...valid, DATABASE_URL: "file:/data/rolepilot.db" }).DATABASE_URL).toBe("file:/data/rolepilot.db");
    expect(problems({ ...valid, DATABASE_URL: "file:./rolepilot.db" })).toEqual([
      "DATABASE_URL must give the SQLite file's full path, e.g. file:/data/rolepilot.db.",
    ]);
  });

  it("wants a hash of the password, not the password itself", () => {
    expect(problems({ ...valid, ROLEPILOT_PASSWORD: "correct horse" })).toEqual([
      expect.stringMatching(/^ROLEPILOT_PASSWORD must be a hash of your password, not the password itself\. .*hash-password/),
    ]);
    expect(parseEnv({ ...valid, ROLEPILOT_PASSWORD: ` ${PASSWORD_HASH}\n` }).ROLEPILOT_PASSWORD).toBe(PASSWORD_HASH);
  });

  it("rejects a secret shorter than 32 characters", () => {
    expect(problems({ ...valid, ROLEPILOT_SECRET: "short" })).toEqual([
      expect.stringMatching(/^ROLEPILOT_SECRET is too short \(5 characters\)\./),
    ]);
  });

  it("never echoes secret values", () => {
    const messages = problems({
      ROLEPILOT_PASSWORD: "hunter2",
      ROLEPILOT_SECRET: "tiny-secret",
      DATABASE_URL: "mysql://root:db-password@db/rolepilot",
    }).join("\n");
    expect(messages).not.toContain("hunter2");
    expect(messages).not.toContain("tiny-secret");
    expect(messages).not.toContain("db-password");
    expect(messages).toMatch(/DATABASE_URL must be a PostgreSQL connection string/);
  });

  it("rejects invalid optional values", () => {
    expect(
      problems({
        ...valid,
        ROLEPILOT_BACKUP_RETENTION_DAYS: "two weeks",
        ROLEPILOT_AI_PROVIDER: "gemini",
        ROLEPILOT_AI_URL: "ftp://example.com",
      }),
    ).toEqual([
      'ROLEPILOT_BACKUP_RETENTION_DAYS must be a whole number of days (got "two weeks").',
      'ROLEPILOT_AI_PROVIDER must be one of local, openai, anthropic, mistral, lmstudio (got "gemini").',
      "ROLEPILOT_AI_URL must be an http:// or https:// URL.",
    ]);
    expect(problems({ ...valid, ROLEPILOT_BACKUP_RETENTION_DAYS: "0" })).toEqual([
      "ROLEPILOT_BACKUP_RETENTION_DAYS must be at least 1.",
    ]);
  });
});

describe("job search variables (E14-4)", () => {
  it("reads the source and its keys", () => {
    expect(
      parseEnv({
        ...valid,
        ROLEPILOT_JOBS_SOURCE: "jsearch",
        ROLEPILOT_JSEARCH_KEY: "ak_test",
        ROLEPILOT_JSEARCH_HOST: "rapidapi",
        ROLEPILOT_ADZUNA_APP_ID: "app",
        ROLEPILOT_ADZUNA_KEY: "adz",
        ROLEPILOT_FREEHIRE_URL: "https://jobs.example/",
      }),
    ).toMatchObject({
      ROLEPILOT_JOBS_SOURCE: "jsearch",
      ROLEPILOT_JSEARCH_KEY: "ak_test",
      ROLEPILOT_JSEARCH_HOST: "rapidapi",
      ROLEPILOT_ADZUNA_APP_ID: "app",
      ROLEPILOT_ADZUNA_KEY: "adz",
      ROLEPILOT_FREEHIRE_URL: "https://jobs.example",
    });
    expect(parseEnv({ ...valid, ROLEPILOT_JOBS_SOURCE: "freehire" }).ROLEPILOT_JOBS_SOURCE).toBe("freehire");
  });

  it("reads whether the Bundesagentur für Arbeit is offered, and refuses choosing it while it's off (#223)", () => {
    expect(parseEnv(valid).ROLEPILOT_JOBS_ARBEITSAGENTUR).toBeUndefined();
    expect(parseEnv({ ...valid, ROLEPILOT_JOBS_ARBEITSAGENTUR: " OFF " }).ROLEPILOT_JOBS_ARBEITSAGENTUR).toBe("off");
    expect(problems({ ...valid, ROLEPILOT_JOBS_ARBEITSAGENTUR: "no" })).toEqual(['ROLEPILOT_JOBS_ARBEITSAGENTUR must be on or off (got "no").']);
    expect(problems({ ...valid, ROLEPILOT_JOBS_SOURCE: "arbeitsagentur", ROLEPILOT_JOBS_ARBEITSAGENTUR: "off" })).toEqual([
      "ROLEPILOT_JOBS_SOURCE is arbeitsagentur, but ROLEPILOT_JOBS_ARBEITSAGENTUR is off. Choose another source, or remove one of the two.",
    ]);
  });

  it("rejects sources and hosts it doesn't know, without echoing keys", () => {
    expect(problems({ ...valid, ROLEPILOT_JOBS_SOURCE: "linkedin", ROLEPILOT_JSEARCH_HOST: "google", ROLEPILOT_JSEARCH_KEY: "ak_secret" })).toEqual([
      'ROLEPILOT_JOBS_SOURCE must be one of jsearch, adzuna, arbeitsagentur, freehire, off (got "linkedin").',
      'ROLEPILOT_JSEARCH_HOST must be openwebninja or rapidapi (got "google").',
    ]);
  });
});

it("reads legacy environment keys but prefers explicit rolepilot values", () => {
  const legacy = { DATABASE_URL: valid.DATABASE_URL, DOSSIER_PASSWORD: PASSWORD_HASH, DOSSIER_SECRET: "a".repeat(32) };
  expect(parseEnv(legacy)).toEqual(parseEnv(valid));
  expect(parseEnv({ ...legacy, ROLEPILOT_SECRET: "b".repeat(32) }).ROLEPILOT_SECRET).toBe("b".repeat(32));
  expect(parseEnv({ ...valid, DOSSIER_TELEMETRY: "on" })).toEqual(parseEnv(valid));
});
