import type Redis from "ioredis";
import type { MongoClient } from "mongodb";
import type { Pool } from "pg";

export type LiveConnections = {
  postgres?: Pool;
  mongo?: MongoClient;
  redis?: Redis;
};

const CONNECTION_TIMEOUT_MS = 10_000;
const QUERY_TIMEOUT_MS = 15_000;

export function liveTestsEnabled(): boolean {
  return process.env.RUN_LIVE_TESTS === "1";
}

export async function trackLiveWriteAttempt<T>(
  markAttempted: () => void,
  operation: () => Promise<T>,
): Promise<T> {
  markAttempted();
  return operation();
}

export async function hasInventoryIdCollision(
  database: {
    query: (text: string, values: number[]) => Promise<{ rows: unknown[] }>;
  },
  externalId: number,
): Promise<boolean> {
  const [inventory, audit] = await Promise.all([
    database.query(
      "SELECT 1 FROM inventory WHERE external_product_id = $1",
      [externalId],
    ),
    database.query(
      "SELECT 1 FROM inventory_logs WHERE external_product_id = $1",
      [externalId],
    ),
  ]);
  return inventory.rows.length > 0 || audit.rows.length > 0;
}

export function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required when RUN_LIVE_TESTS=1`);
  }
  return value;
}

export async function connectLivePostgres(): Promise<Pool> {
  const { Pool } = await import("pg");
  const client = new Pool({
    connectionString: requiredEnvironment("POSTGRES_URL"),
    max: 5,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    statement_timeout: QUERY_TIMEOUT_MS,
  });

  try {
    await client.query("SELECT 1");
    return client;
  } catch (error) {
    try {
      await closeLiveConnections({ postgres: client });
    } catch (closeError) {
      throw new AggregateError(
        [error, closeError],
        "PostgreSQL connection failed and its pool could not be closed",
      );
    }
    throw error;
  }
}

export async function connectLiveMongo(): Promise<MongoClient> {
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(requiredEnvironment("MONGODB_URI"), {
    serverSelectionTimeoutMS: CONNECTION_TIMEOUT_MS,
  });

  try {
    await client.connect();
    return client;
  } catch (error) {
    try {
      await closeLiveConnections({ mongo: client });
    } catch (closeError) {
      throw new AggregateError(
        [error, closeError],
        "MongoDB connection failed and its client could not be closed",
      );
    }
    throw error;
  }
}

export async function connectLiveRedis(): Promise<Redis> {
  const { default: Redis } = await import("ioredis");
  const client = new Redis(requiredEnvironment("REDIS_URL"), {
    lazyConnect: true,
    connectTimeout: CONNECTION_TIMEOUT_MS,
    commandTimeout: QUERY_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
  });

  try {
    await client.connect();
    await client.ping();
    return client;
  } catch (error) {
    try {
      await closeLiveConnections({ redis: client });
    } catch (closeError) {
      throw new AggregateError(
        [error, closeError],
        "Redis connection failed and its client could not be closed",
      );
    }
    throw error;
  }
}

async function closeRedis(client: Redis): Promise<void> {
  try {
    if (client.status === "ready") {
      await client.quit();
    } else {
      client.disconnect();
    }
  } finally {
    if (client.status !== "end") {
      client.disconnect();
    }
  }
}

export async function closeLiveConnections(
  connections: LiveConnections,
): Promise<void> {
  const results = await Promise.allSettled([
    ...(connections.postgres ? [connections.postgres.end()] : []),
    ...(connections.mongo ? [connections.mongo.close()] : []),
    ...(connections.redis ? [closeRedis(connections.redis)] : []),
  ]);
  const errors = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );

  if (errors.length > 0) {
    throw new AggregateError(errors, "One or more live test clients failed to close");
  }
}
