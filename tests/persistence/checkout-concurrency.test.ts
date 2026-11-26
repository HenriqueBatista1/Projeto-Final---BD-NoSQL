import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import test from "node:test";
import type { Collection, MongoClient } from "mongodb";
import type Redis from "ioredis";
import type { Pool } from "pg";

const LIVE_TEST_ENABLED = process.env.RUN_LIVE_TESTS === "1";
const STOCK = 3;
const CHECKOUT_COUNT = 10;

type ProductDocument = {
  external_id: number;
  title: string;
  price: number;
  description: string;
  category: string;
  image: string;
  rating: { rate: number; count: number };
};

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required when RUN_LIVE_TESTS=1`);
  }
  return value;
}

function isPostgresDeadlock(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "40P01"
  );
}

async function findUnusedExternalId(
  database: Pool,
  products: Collection<ProductDocument>,
): Promise<number> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const externalId = randomInt(1, 2_147_483_647);
    const [inventory, product] = await Promise.all([
      database.query(
        "SELECT 1 FROM inventory WHERE external_product_id = $1",
        [externalId],
      ),
      products.findOne(
        { external_id: externalId },
        { projection: { _id: 1 } },
      ),
    ]);

    if (inventory.rows.length === 0 && product === null) {
      return externalId;
    }
  }

  throw new Error("Could not allocate a unique test product ID");
}

async function cleanPostgresFixtures(
  database: Pool,
  userIds: number[],
  externalId: number | undefined,
): Promise<void> {
  const client = await database.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM order_items
       WHERE order_id IN (
         SELECT id FROM orders WHERE user_id = ANY($1::int[])
       )`,
      [userIds],
    );
    await client.query(
      "DELETE FROM orders WHERE user_id = ANY($1::int[])",
      [userIds],
    );

    if (externalId !== undefined) {
      await client.query(
        "DELETE FROM inventory_logs WHERE external_product_id = $1",
        [externalId],
      );
      await client.query(
        "DELETE FROM inventory WHERE external_product_id = $1",
        [externalId],
      );
    }

    await client.query(
      "DELETE FROM users WHERE id = ANY($1::int[])",
      [userIds],
    );
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "PostgreSQL fixture cleanup and rollback both failed",
      );
    }
    throw error;
  } finally {
    client.release();
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

test(
  "concurrent live checkouts never oversell and preserve rejected carts",
  { skip: !LIVE_TEST_ENABLED, timeout: 45_000 },
  async () => {
    const postgresUrl = requiredEnvironment("POSTGRES_URL");
    const mongoUri = requiredEnvironment("MONGODB_URI");
    const redisUrl = requiredEnvironment("REDIS_URL");

    const [{ Pool }, { MongoClient }, { default: Redis }, checkoutModule,
      { CartAndSessionRepository }, { CatalogRepository },
      { OrderAndInventoryRepository }] = await Promise.all([
      import("pg"),
      import("mongodb"),
      import("ioredis"),
      import("../../src/lib/services/checkout"),
      import("../../src/lib/repositories/cart-session"),
      import("../../src/lib/repositories/catalog"),
      import("../../src/lib/repositories/orders-inventory"),
    ]);

    let database: Pool | undefined;
    let mongoClient: MongoClient | undefined;
    let redisClient: Redis | undefined;
    let externalId: number | undefined;
    let mongoProductCreated = false;
    let inventoryCreated = false;
    const userIds: number[] = [];
    const cartUserIds: number[] = [];
    let failed = false;
    let primaryError: unknown;

    try {
      database = new Pool({
        connectionString: postgresUrl,
        max: 5,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10_000,
        statement_timeout: 15_000,
      });
      mongoClient = new MongoClient(mongoUri, {
        serverSelectionTimeoutMS: 10_000,
      });
      redisClient = new Redis(redisUrl, {
        lazyConnect: true,
        connectTimeout: 10_000,
        commandTimeout: 10_000,
        maxRetriesPerRequest: 1,
      });

      const mongoConnection = mongoClient;
      const redisConnection = redisClient;
      const productCollection = mongoConnection
        .db("polyglot_store")
        .collection<ProductDocument>("products");
      const connectionResults = await Promise.allSettled([
        mongoConnection.connect(),
        redisConnection.connect(),
      ]);
      const connectionErrors = connectionResults.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      if (connectionErrors.length > 0) {
        throw new AggregateError(connectionErrors, "Could not connect to live test databases");
      }

      externalId = await findUnusedExternalId(database, productCollection);
      const runId = randomUUID();

      for (let index = 0; index < CHECKOUT_COUNT; index += 1) {
        const user = await database.query<{ id: number }>(
          `INSERT INTO users (name, email, password_hash, address)
           VALUES ($1, $2, $3, NULL)
           RETURNING id`,
          [
            `E2 concurrency ${runId} ${index}`,
            `e2-${runId}-${index}@example.test`,
            "live-test-only",
          ],
        );
        const userId = user.rows[0]?.id;
        if (userId === undefined) {
          throw new Error("Test user insert did not return an ID");
        }
        userIds.push(userId);
      }

      await productCollection.insertOne({
        external_id: externalId,
        title: `E2 temporary product ${runId}`,
        price: 1,
        description: "Temporary product for the checkout concurrency test",
        category: "e2-test",
        image: "https://example.test/e2-test.png",
        rating: { rate: 5, count: 1 },
      });
      mongoProductCreated = true;
      await database.query(
        "INSERT INTO inventory (external_product_id, quantity) VALUES ($1, $2)",
        [externalId, STOCK],
      );
      inventoryCreated = true;

      const cartRepository = new CartAndSessionRepository(redisConnection);
      for (const userId of userIds) {
        const key = `cart:${userId}`;
        if ((await redisConnection.exists(key)) !== 0) {
          throw new Error(`Refusing to overwrite an existing test cart key: ${key}`);
        }
        cartUserIds.push(userId);
        await cartRepository.addItem(userId, externalId, 1);
      }

      const checkoutService = new checkoutModule.CheckoutService(
        cartRepository,
        new CatalogRepository(mongoConnection),
        new OrderAndInventoryRepository(database),
      );
      const outcomes = await Promise.allSettled(
        userIds.map((userId) =>
          checkoutService.checkout({
            userId,
            deliveryAddress: "E2 temporary address",
            paymentMethod: "PIX",
          }),
        ),
      );

      const approved = outcomes.flatMap((outcome, index) =>
        outcome.status === "fulfilled" ? [{ index, result: outcome.value }] : [],
      );
      const rejected = outcomes.flatMap((outcome, index) =>
        outcome.status === "rejected" ? [{ index, error: outcome.reason }] : [],
      );

      assert.equal(approved.length, 3, "exactly the available stock should be sold");
      assert.equal(rejected.length, 7, "the remaining checkouts should be rejected");
      assert.ok(approved.every(({ result }) => result.cartCleared));
      assert.equal(
        rejected.filter(({ error }) => isPostgresDeadlock(error)).length,
        0,
        "concurrent checkouts must not deadlock",
      );
      for (const { error } of rejected) {
        assert.ok(error instanceof checkoutModule.CheckoutError);
        assert.equal(error.code, "INSUFFICIENT_STOCK");
      }

      const approvedUserIds = approved.map(({ index }) => userIds[index]).sort((a, b) => a - b);
      const rejectedUserIds = rejected.map(({ index }) => userIds[index]).sort((a, b) => a - b);
      for (const userId of approvedUserIds) {
        assert.deepEqual(await cartRepository.getCart(userId), {});
      }
      for (const userId of rejectedUserIds) {
        assert.deepEqual(await cartRepository.getCart(userId), {
          [externalId]: 1,
        });
      }

      const inventory = await database.query<{ quantity: number }>(
        "SELECT quantity FROM inventory WHERE external_product_id = $1",
        [externalId],
      );
      assert.deepEqual(inventory.rows, [{ quantity: 0 }]);

      const orders = await database.query<{ id: number; user_id: number }>(
        "SELECT id, user_id FROM orders WHERE user_id = ANY($1::int[])",
        [userIds],
      );
      assert.equal(orders.rows.length, 3);
      assert.deepEqual(
        orders.rows.map(({ user_id }) => user_id).sort((a, b) => a - b),
        approvedUserIds,
      );

      const orderItems = await database.query<{
        external_product_id: number;
        quantity: number;
      }>(
        `SELECT external_product_id, quantity
         FROM order_items
         WHERE order_id = ANY($1::int[])`,
        [orders.rows.map(({ id }) => id)],
      );
      assert.deepEqual(orderItems.rows, [
        { external_product_id: externalId, quantity: 1 },
        { external_product_id: externalId, quantity: 1 },
        { external_product_id: externalId, quantity: 1 },
      ]);

      const audit = await database.query<{
        old_quantity: number;
        new_quantity: number;
        change_amount: number;
      }>(
        `SELECT old_quantity, new_quantity, change_amount
         FROM inventory_logs
         WHERE external_product_id = $1
         ORDER BY id ASC`,
        [externalId],
      );
      assert.deepEqual(
        audit.rows.map(({ old_quantity, new_quantity, change_amount }) => [
          old_quantity,
          new_quantity,
          change_amount,
        ]),
        [
          [0, STOCK, STOCK],
          [3, 2, -1],
          [2, 1, -1],
          [1, 0, -1],
        ],
      );
    } catch (error) {
      failed = true;
      primaryError = error;
    } finally {
      const cleanupActions: Promise<unknown>[] = [];
      if (database) {
        cleanupActions.push(
          cleanPostgresFixtures(
            database,
            userIds,
            inventoryCreated ? externalId : undefined,
          ),
        );
      }
      if (mongoClient && mongoProductCreated && externalId !== undefined) {
        cleanupActions.push(
          mongoClient
            .db("polyglot_store")
            .collection("products")
            .deleteOne({ external_id: externalId }),
        );
      }
      if (redisClient) {
        const client = redisClient;
        cleanupActions.push(
          Promise.all(cartUserIds.map((userId) => client.del(`cart:${userId}`))),
        );
      }

      const cleanupResults = await Promise.allSettled(cleanupActions);
      const cleanupErrors = cleanupResults.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );

      const closeActions: Promise<unknown>[] = [];
      if (database) {
        closeActions.push(database.end());
      }
      if (mongoClient) {
        closeActions.push(mongoClient.close());
      }
      if (redisClient) {
        closeActions.push(closeRedis(redisClient));
      }

      const closeResults = await Promise.allSettled(closeActions);
      const closeErrors = closeResults.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
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
          "Live checkout test, fixture cleanup, or connection shutdown failed",
        );
      }
    }
  },
);
