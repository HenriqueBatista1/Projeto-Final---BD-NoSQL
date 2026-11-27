import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import test from "node:test";
import type { Collection, MongoClient } from "mongodb";
import type Redis from "ioredis";
import type { Pool } from "pg";
import {
  closeLiveConnections,
  connectLiveMongo,
  connectLivePostgres,
  connectLiveRedis,
  hasInventoryIdCollision,
  liveTestsEnabled,
  trackLiveWriteAttempt,
} from "./live-helpers";

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
const LIVE_TEST_TIMEOUT_MS = 45_000;
const INITIAL_STOCK = 8;
const ORDER_QUANTITY = 2;
const UNIT_PRICE = 3.25;

async function allocateUnusedProductId(
  database: Pool,
  products: Collection<ProductDocument>,
): Promise<number> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const externalId = randomInt(1, 2_147_483_647);
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
  throw new Error("Could not allocate a unique checkout test product ID");
}

async function removeCheckoutFixtures(
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
    if (userId !== undefined) {
      await client.query(
        `DELETE FROM order_items
         WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)`,
        [userId],
      );
      await client.query("DELETE FROM orders WHERE user_id = $1", [userId]);
    }
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
        "Checkout fixture cleanup and rollback both failed",
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

test(
  "live checkout creates an audited order and clears its Redis cart",
  { skip: !LIVE_TEST_ENABLED, timeout: LIVE_TEST_TIMEOUT_MS },
  async () => {
    let database: Pool | undefined;
    let mongoClient: MongoClient | undefined;
    let redisClient: Redis | undefined;
    let productCollection: Collection<ProductDocument> | undefined;
    let externalId: number | undefined;
    let mongoProductTitle: string | undefined;
    let mongoProductInsertAttempted = false;
    let inventoryInsertAttempted = false;
    let userInsertAttempted = false;
    let userId: number | undefined;
    let userEmail: string | undefined;
    let userName: string | undefined;
    let cartUserId: number | undefined;
    let cartKeyOwned = false;
    let failed = false;
    let primaryError: unknown;

    try {
      database = await connectLivePostgres();
      mongoClient = await connectLiveMongo();
      redisClient = await connectLiveRedis();
      productCollection = mongoClient
        .db("polyglot_store")
        .collection<ProductDocument>("products");

      const runId = randomUUID();
      userEmail = `e3-checkout-${runId}@example.test`;
      userName = `E3 checkout ${runId}`;
      const [allocatedExternalId, existingUser] = await Promise.all([
        allocateUnusedProductId(database, productCollection),
        database.query(
          "SELECT 1 FROM users WHERE email = $1",
          [userEmail],
        ),
      ]);
      externalId = allocatedExternalId;
      if (existingUser.rows.length > 0) {
        throw new Error("Refusing to overwrite an existing checkout test user");
      }
      const postgresForWrites = database;
      const productsForWrites = productCollection;
      const fixtureExternalId = externalId;
      const user = await trackLiveWriteAttempt(
        () => {
          userInsertAttempted = true;
        },
        () =>
          postgresForWrites.query<{ id: number }>(
            `INSERT INTO users (name, email, password_hash, address)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [
              userName,
              userEmail,
              "live-test-only",
              "E3 checkout delivery address",
            ],
          ),
      );
      userId = user.rows[0]?.id;
      if (userId === undefined) {
        throw new Error("Checkout test user insert did not return an ID");
      }

      const productTitle = `E3 checkout product ${runId}`;
      mongoProductTitle = productTitle;
      await trackLiveWriteAttempt(
        () => {
          mongoProductInsertAttempted = true;
        },
        () =>
          productsForWrites.insertOne({
            external_id: fixtureExternalId,
            title: productTitle,
            price: UNIT_PRICE,
            description: "Temporary product for the checkout integration test",
            category: "e3-test",
            image: "https://example.test/e3-checkout.png",
            rating: { rate: 5, count: 1 },
          }),
      );

      await trackLiveWriteAttempt(
        () => {
          inventoryInsertAttempted = true;
        },
        () =>
          postgresForWrites.query(
            "INSERT INTO inventory (external_product_id, quantity) VALUES ($1, $2)",
            [fixtureExternalId, INITIAL_STOCK],
          ),
      );

      const cartKey = `cart:${userId}`;
      if ((await redisClient.exists(cartKey)) !== 0) {
        throw new Error(`Refusing to overwrite an existing test cart key: ${cartKey}`);
      }
      cartUserId = userId;
      cartKeyOwned = true;

      const [
        { CheckoutService },
        { CartAndSessionRepository },
        { CatalogRepository },
        { OrderAndInventoryRepository },
      ] = await Promise.all([
        import("../../src/lib/services/checkout"),
        import("../../src/lib/repositories/cart-session"),
        import("../../src/lib/repositories/catalog"),
        import("../../src/lib/repositories/orders-inventory"),
      ]);

      const cartRepository = new CartAndSessionRepository(redisClient);
      await cartRepository.addItem(userId, externalId, ORDER_QUANTITY);

      const checkout = new CheckoutService(
        cartRepository,
        new CatalogRepository(mongoClient),
        new OrderAndInventoryRepository(database),
      );
      const result = await checkout.checkout({
        userId,
        deliveryAddress: "E3 checkout delivery address",
        paymentMethod: "PIX",
      });
      assert.equal(result.cartCleared, true);

      const [cart, orders, orderItems, stock, audit] = await Promise.all([
        cartRepository.getCart(userId),
        database.query<{
          id: number;
          total_amount: string;
          payment_method: string;
          delivery_address: string;
        }>(
          `SELECT id, total_amount, payment_method, delivery_address
           FROM orders
           WHERE id = $1 AND user_id = $2`,
          [result.orderId, userId],
        ),
        database.query<{
          external_product_id: number;
          product_title: string;
          unit_price: string;
          quantity: number;
          subtotal: string;
        }>(
          `SELECT external_product_id, product_title, unit_price, quantity, subtotal
           FROM order_items
           WHERE order_id = $1`,
          [result.orderId],
        ),
        database.query<{ quantity: number }>(
          "SELECT quantity FROM inventory WHERE external_product_id = $1",
          [externalId],
        ),
        database.query<{
          old_quantity: number;
          new_quantity: number;
          change_amount: number;
        }>(
          `SELECT old_quantity, new_quantity, change_amount
           FROM inventory_logs
           WHERE external_product_id = $1
           ORDER BY id ASC`,
          [externalId],
        ),
      ]);

      assert.deepEqual(cart, {});
      assert.equal(orders.rows.length, 1);
      assert.equal(Number(orders.rows[0]?.total_amount), 6.5);
      assert.equal(orders.rows[0]?.payment_method, "PIX");
      assert.equal(orders.rows[0]?.delivery_address, "E3 checkout delivery address");

      assert.deepEqual(
        orderItems.rows.map((item) => ({
          external_product_id: item.external_product_id,
          product_title: item.product_title,
          unit_price: Number(item.unit_price),
          quantity: item.quantity,
          subtotal: Number(item.subtotal),
        })),
        [{
          external_product_id: externalId,
          product_title: `E3 checkout product ${runId}`,
          unit_price: UNIT_PRICE,
          quantity: ORDER_QUANTITY,
          subtotal: 6.5,
        }],
      );

      assert.deepEqual(stock.rows, [{ quantity: INITIAL_STOCK - ORDER_QUANTITY }]);

      assert.deepEqual(audit.rows, [
        {
          old_quantity: 0,
          new_quantity: INITIAL_STOCK,
          change_amount: INITIAL_STOCK,
        },
        {
          old_quantity: INITIAL_STOCK,
          new_quantity: INITIAL_STOCK - ORDER_QUANTITY,
          change_amount: -ORDER_QUANTITY,
        },
      ]);
    } catch (error) {
      failed = true;
      primaryError = error;
    } finally {
      const cleanupActions: Promise<unknown>[] = [];
      if (database && (userInsertAttempted || inventoryInsertAttempted)) {
        cleanupActions.push(
          removeCheckoutFixtures(
            database,
            userInsertAttempted ? userId : undefined,
            userInsertAttempted ? userEmail : undefined,
            userInsertAttempted ? userName : undefined,
            externalId,
            inventoryInsertAttempted,
          ),
        );
      }
      if (
        mongoClient &&
        productCollection &&
        mongoProductInsertAttempted &&
        externalId !== undefined &&
        mongoProductTitle !== undefined
      ) {
        cleanupActions.push(
          productCollection.deleteOne({
            external_id: externalId,
            title: mongoProductTitle,
          }),
        );
      }
      if (redisClient && cartUserId !== undefined && cartKeyOwned) {
        cleanupActions.push(redisClient.del(`cart:${cartUserId}`));
      }

      const cleanupResults = await Promise.allSettled(cleanupActions);
      const cleanupErrors = cleanupResults.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      const closeErrors: unknown[] = [];
      try {
        await closeLiveConnections({
          postgres: database,
          mongo: mongoClient,
          redis: redisClient,
        });
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
          "Live checkout test, fixture cleanup, or connection shutdown failed",
        );
      }
    }
  },
);
