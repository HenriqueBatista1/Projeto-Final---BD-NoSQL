import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import test from "node:test";
import type { Collection, MongoClient } from "mongodb";
import type { Pool } from "pg";
import {
  closeLiveConnections,
  connectLiveMongo,
  connectLivePostgres,
  hasInventoryIdCollision,
  liveTestsEnabled,
  trackLiveWriteAttempt,
} from "./live-helpers";

type SeedProduct = {
  id: number;
};

type SeedUser = {
  email: string;
};

type ProductDocument = {
  external_id: number;
  title: string;
  price: number;
  description: string;
  category: string;
  image: string;
  rating: { rate: number; count: number };
};

const LIVE_TEST_ENABLED = liveTestsEnabled();
const LIVE_TEST_TIMEOUT_MS = 120_000;

async function fetchSeedData(): Promise<{
  productIds: number[];
  userEmails: string[];
}> {
  const [productsResponse, usersResponse] = await Promise.all([
    fetch("https://fakestoreapi.com/products"),
    fetch("https://fakestoreapi.com/users"),
  ]);
  if (!productsResponse.ok) {
    throw new Error(`FakeStoreAPI products request failed: ${productsResponse.status}`);
  }
  if (!usersResponse.ok) {
    throw new Error(`FakeStoreAPI users request failed: ${usersResponse.status}`);
  }

  const products: unknown = await productsResponse.json();
  const users: unknown = await usersResponse.json();
  assert.ok(Array.isArray(products), "FakeStoreAPI products response must be an array");
  assert.ok(Array.isArray(users), "FakeStoreAPI users response must be an array");

  const productIds = (products as SeedProduct[]).map((product) => {
    assert.ok(
      product && Number.isInteger(product.id) && product.id > 0,
      "FakeStoreAPI product IDs must be positive integers",
    );
    return product.id;
  });
  const userEmails = (users as SeedUser[]).map((user) => {
    assert.ok(
      user && typeof user.email === "string" && user.email.length > 0,
      "FakeStoreAPI user emails must be non-empty strings",
    );
    return user.email;
  });

  assert.equal(new Set(productIds).size, productIds.length);
  assert.equal(new Set(userEmails).size, userEmails.length);
  return { productIds, userEmails };
}

async function allocateUnusedProductId(
  database: Pool,
  products: Collection<ProductDocument>,
  reservedIds: Set<number>,
): Promise<number> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const externalId = randomInt(1, 2_147_483_647);
    if (reservedIds.has(externalId)) {
      continue;
    }

    const [inventoryCollision, product] = await Promise.all([
      hasInventoryIdCollision(database, externalId),
      products.findOne(
        { external_id: externalId },
        { projection: { _id: 1 } },
      ),
    ]);

    if (!inventoryCollision && product === null) {
      return externalId;
    }
  }

  throw new Error("Could not allocate a unique seed-test product ID");
}

async function countSeedUsers(
  database: Pool,
  userEmails: string[],
): Promise<number> {
  const result = await database.query<{ email: string; count: number }>(
    `SELECT email, COUNT(*)::int AS count
     FROM users
     WHERE email = ANY($1::varchar[])
     GROUP BY email`,
    [userEmails],
  );
  assert.equal(result.rows.length, userEmails.length);
  assert.ok(result.rows.every((row) => row.count === 1));
  return result.rows.reduce((total, row) => total + row.count, 0);
}

async function getInventory(
  database: Pool,
  externalIds: number[],
): Promise<Map<number, number>> {
  const result = await database.query<{
    external_product_id: number;
    quantity: number;
  }>(
    `SELECT external_product_id, quantity
     FROM inventory
     WHERE external_product_id = ANY($1::int[])`,
    [externalIds],
  );
  return new Map(
    result.rows.map(({ external_product_id, quantity }) => [
      external_product_id,
      quantity,
    ]),
  );
}

function runSeedProcess(): void {
  const result = spawnSync("npm", ["run", "seed"], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    timeout: LIVE_TEST_TIMEOUT_MS,
  });

  if (result.error) {
    throw new Error(`Could not run npm run seed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const output = `${result.stderr}\n${result.stdout}`
      .replace(/(?:postgres(?:ql)?|mongodb(?:\+srv)?|rediss?):\/\/\S+/gi, "<connection URL redacted>")
      .trim()
      .split("\n")
      .slice(-8)
      .join("\n");
    throw new Error(
      `npm run seed exited with status ${String(result.status)}${output ? `:\n${output}` : ""}`,
    );
  }
}

async function removeSentinels(
  database: Pool,
  userId: number | undefined,
  userEmail: string | undefined,
  userName: string | undefined,
  externalId: number | undefined,
  inventoryInsertAttempted: boolean,
): Promise<void> {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    if (inventoryInsertAttempted && externalId !== undefined) {
      await client.query(
        "DELETE FROM inventory_logs WHERE external_product_id = $1",
        [externalId],
      );
      await client.query(
        "DELETE FROM inventory WHERE external_product_id = $1",
        [externalId],
      );
    }
    if (userId !== undefined || userEmail !== undefined) {
      await client.query(
        `DELETE FROM users
         WHERE ($1::int IS NOT NULL AND id = $1)
            OR ($2::varchar IS NOT NULL AND email = $2 AND name = $3)`,
        [userId ?? null, userEmail ?? null, userName ?? null],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Seed sentinel cleanup and rollback both failed",
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

test(
  "live seed is idempotent and creates the expected MongoDB indexes",
  { skip: !LIVE_TEST_ENABLED, timeout: LIVE_TEST_TIMEOUT_MS * 2 },
  async () => {
    let database: Pool | undefined;
    let mongoClient: MongoClient | undefined;
    let productCollection: Collection<ProductDocument> | undefined;
    let sentinelExternalId: number | undefined;
    let sentinelProductTitle: string | undefined;
    let sentinelProductInsertAttempted = false;
    let sentinelInventoryInsertAttempted = false;
    let sentinelUserInsertAttempted = false;
    let sentinelUserId: number | undefined;
    let sentinelUserEmail: string | undefined;
    let sentinelUserName: string | undefined;
    let failed = false;
    let primaryError: unknown;

    try {
      database = await connectLivePostgres();
      mongoClient = await connectLiveMongo();
      productCollection = mongoClient
        .db("polyglot_store")
        .collection<ProductDocument>("products");

      const runId = randomUUID();
      const sentinelEmail = `e3-seed-${runId}@example.test`;
      const sentinelName = `E3 seed sentinel ${runId}`;
      sentinelUserEmail = sentinelEmail;
      sentinelUserName = sentinelName;

      const [{ productIds, userEmails }, existingSentinelUser] = await Promise.all([
        fetchSeedData(),
        database.query(
          "SELECT 1 FROM users WHERE email = $1",
          [sentinelEmail],
        ),
      ]);
      const existingInventory = await getInventory(database, productIds);
      const reservedIds = new Set(productIds);
      sentinelExternalId = await allocateUnusedProductId(
        database,
        productCollection,
        reservedIds,
      );
      const postgresForWrites = database;
      const productsForWrites = productCollection;
      const sentinelIdForWrites = sentinelExternalId;

      if (existingSentinelUser.rows.length > 0) {
        throw new Error("Refusing to overwrite an existing seed sentinel user");
      }
      const sentinelUser = await trackLiveWriteAttempt(
        () => {
          sentinelUserInsertAttempted = true;
        },
        () =>
          postgresForWrites.query<{ id: number }>(
            `INSERT INTO users (name, email, password_hash, address)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [
              sentinelUserName,
              sentinelUserEmail,
              "live-test-only",
              "E3 seed sentinel address",
            ],
          ),
      );
      sentinelUserId = sentinelUser.rows[0]?.id;
      if (sentinelUserId === undefined) {
        throw new Error("Seed sentinel user insert did not return an ID");
      }

      const productTitle = `E3 seed sentinel ${runId}`;
      sentinelProductTitle = productTitle;
      await trackLiveWriteAttempt(
        () => {
          sentinelProductInsertAttempted = true;
        },
        () =>
          productsForWrites.insertOne({
            external_id: sentinelIdForWrites,
            title: productTitle,
            price: 1,
            description: "Sentinel product retained by the seed",
            category: "e3-test",
            image: "https://example.test/e3-sentinel.png",
            rating: { rate: 5, count: 1 },
          }),
      );

      await trackLiveWriteAttempt(
        () => {
          sentinelInventoryInsertAttempted = true;
        },
        () =>
          postgresForWrites.query(
            "INSERT INTO inventory (external_product_id, quantity) VALUES ($1, $2)",
            [sentinelIdForWrites, 37],
          ),
      );

      runSeedProcess();
      const [productCountAfterFirstRun, userCountAfterFirstRun] = await Promise.all([
        productCollection.countDocuments({
          external_id: { $in: productIds },
        }),
        countSeedUsers(database, userEmails),
      ]);
      assert.equal(productCountAfterFirstRun, productIds.length);
      assert.equal(userCountAfterFirstRun, userEmails.length);

      runSeedProcess();
      const [productCountAfterSecondRun, userCountAfterSecondRun] = await Promise.all([
        productCollection.countDocuments({
          external_id: { $in: productIds },
        }),
        countSeedUsers(database, userEmails),
      ]);
      assert.equal(productCountAfterSecondRun, productCountAfterFirstRun);
      assert.equal(userCountAfterSecondRun, userCountAfterFirstRun);

      const [
        inventoryAfterSeed,
        sentinelProductAfterSeed,
        sentinelUserAfterSeed,
        sentinelInventoryAfterSeed,
        indexes,
      ] = await Promise.all([
        getInventory(database, productIds),
        productCollection.findOne({ external_id: sentinelExternalId }),
        database.query(
          "SELECT 1 FROM users WHERE id = $1",
          [sentinelUserId],
        ),
        getInventory(database, [sentinelExternalId]),
        productCollection.listIndexes().toArray(),
      ]);
      for (const [externalId, quantity] of existingInventory) {
        assert.equal(
          inventoryAfterSeed.get(externalId),
          quantity,
          `seed overwrote existing inventory for product ${externalId}`,
        );
      }

      assert.ok(
        sentinelProductAfterSeed,
        "seed must retain unrelated MongoDB products",
      );
      assert.equal(sentinelUserAfterSeed.rowCount, 1);
      assert.equal(sentinelInventoryAfterSeed.get(sentinelExternalId), 37);

      assert.ok(
        indexes.some(
          (index) =>
            index.unique === true &&
            index.key.external_id === 1 &&
            Object.keys(index.key).length === 1,
        ),
        "products must have a unique ascending external_id index",
      );
      assert.ok(
        indexes.some(
          (index) =>
            index.key.category === 1 &&
            Object.keys(index.key).length === 1,
        ),
        "products must have an ascending category index",
      );
      assert.ok(
        indexes.some((index) => {
          const weights =
            index.weights && typeof index.weights === "object"
              ? (index.weights as Record<string, unknown>)
              : undefined;
          if (!weights) {
            return false;
          }
          const textFields = Object.keys(weights).sort();
          return (
            textFields.length === 3 &&
            textFields.join(",") === "category,description,title"
          );
        }),
        "products must have a text index over title, description, and category",
      );
    } catch (error) {
      failed = true;
      primaryError = error;
    } finally {
      const cleanupActions: Promise<unknown>[] = [];
      if (
        database &&
        (sentinelUserInsertAttempted || sentinelInventoryInsertAttempted)
      ) {
        cleanupActions.push(
          removeSentinels(
            database,
            sentinelUserInsertAttempted ? sentinelUserId : undefined,
            sentinelUserInsertAttempted ? sentinelUserEmail : undefined,
            sentinelUserInsertAttempted ? sentinelUserName : undefined,
            sentinelExternalId,
            sentinelInventoryInsertAttempted,
          ),
        );
      }
      if (
        mongoClient &&
        productCollection &&
        sentinelProductInsertAttempted &&
        sentinelExternalId !== undefined &&
        sentinelProductTitle !== undefined
      ) {
        cleanupActions.push(
          productCollection.deleteOne({
            external_id: sentinelExternalId,
            title: sentinelProductTitle,
          }),
        );
      }

      const cleanupResults = await Promise.allSettled(cleanupActions);
      const cleanupErrors = cleanupResults.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      const closeErrors: unknown[] = [];
      try {
        await closeLiveConnections({ postgres: database, mongo: mongoClient });
      } catch (error) {
        closeErrors.push(error);
      }

      const errors = [
        ...(failed ? [primaryError] : []),
        ...cleanupErrors,
        ...closeErrors,
      ];
      if (errors.length === 1) {
        throw errors[0];
      }
      if (errors.length > 1) {
        throw new AggregateError(
          errors,
          "Live seed test, sentinel cleanup, or connection shutdown failed",
        );
      }
    }
  },
);
