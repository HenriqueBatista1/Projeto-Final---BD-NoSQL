import { Pool } from "pg";

declare global {
  var __postgresPool: Pool | undefined;
}

const connectionString = process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error("POSTGRES_URL is required");
}

export const pool =
  globalThis.__postgresPool ??
  (globalThis.__postgresPool = new Pool({
    connectionString,
    max: 5,
    ssl: { rejectUnauthorized: false },
  }));
