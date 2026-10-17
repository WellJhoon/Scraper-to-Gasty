import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema.js";

function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value.replace(/^['"]|['"]$/g, "");
    }
  }
}

loadDotEnv();

const rawDatabaseUrl = process.env.DATABASE_URL?.trim();
const databaseUrl = rawDatabaseUrl || "postgres://postgres:postgres@localhost:5432/postgres";

if (!rawDatabaseUrl) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required in production");
  }
}

const globalDb = globalThis as typeof globalThis & {
  postgresClient?: Sql;
};

const parsedPoolMax = Number(process.env.POSTGRES_MAX_CONNECTIONS);
const poolMax = Number.isFinite(parsedPoolMax)
  ? Math.max(1, parsedPoolMax)
  : process.env.NODE_ENV === "development"
    ? 1
    : 5;

const createClient = () =>
  postgres(databaseUrl, {
    prepare: false,
    connect_timeout: 15,
    max: poolMax,
  });

const client = globalDb.postgresClient ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalDb.postgresClient = client;
}

export const db = drizzle({ client, schema });
export const postgresClient = client;

export async function closeDb(): Promise<void> {
  try {
    await postgresClient.end({ timeout: 5 });
  } catch {
    // Ignore close errors during shutdown to avoid masking the main job result.
  }
}
