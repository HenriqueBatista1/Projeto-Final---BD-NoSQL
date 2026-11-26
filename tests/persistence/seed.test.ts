import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import test from "node:test";

process.env.POSTGRES_URL = "postgresql://demo:demo@localhost:5432/demo";
process.env.MONGODB_URI = "mongodb://localhost:27017/demo";

test("seed helpers use deterministic inventory and demo password", async () => {
  const seed = await import("../../scripts/seed");

  assert.equal(seed.inventoryQuantity(1), 11);
  assert.equal(seed.inventoryQuantity(20), 30);
  assert.equal(seed.inventoryQuantity(41), 10);
  assert.equal(
    seed.hashDemoPassword("123456"),
    scryptSync("123456", "polyglot-store-demo", 64).toString("hex"),
  );
  assert.equal(
    seed.formatAddress({
      street: "Rua Central",
      number: "42",
      city: "Recife",
      zipcode: "50000-000",
    }),
    "Rua Central, 42, Recife, 50000-000",
  );
});

test("seed creates the unique external ID index before product upserts", async (t) => {
  const seed = await import("../../scripts/seed");
  const { mongoClient } = await import("../../src/lib/db/mongodb");
  const { pool } = await import("../../src/lib/db/postgres");
  const calls: string[] = [];
  const product = {
    id: 7,
    title: "Backpack",
    price: 25,
    description: "A durable backpack",
    category: "bags",
    image: "https://example.test/backpack.png",
    rating: { rate: 4, count: 12 },
  };
  const user = {
    name: { firstname: "Test", lastname: "User" },
    email: "test@example.test",
    address: {
      street: "Example Street",
      number: 1,
      city: "Example City",
      zipcode: "00000",
    },
  };
  const collection = {
    async bulkWrite(operations: unknown[]) {
      calls.push("bulkWrite");
      assert.deepEqual(operations, [{
        updateOne: {
          filter: { external_id: 7 },
          update: { $set: {
            external_id: 7,
            title: "Backpack",
            price: 25,
            description: "A durable backpack",
            category: "bags",
            image: "https://example.test/backpack.png",
            rating: { rate: 4, count: 12 },
          } },
          upsert: true,
        },
      }]);
    },
    async createIndex(indexSpec: Record<string, unknown>, options?: { unique?: boolean }) {
      if (options?.unique && "external_id" in indexSpec) {
        calls.push("uniqueIndex");
      }
      return "index";
    },
  };

  t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL) =>
    new Response(
      JSON.stringify(String(url).endsWith("/products") ? [product] : [user]),
      { status: 200 },
    ),
  );
  t.mock.method(mongoClient, "connect", async () => mongoClient);
  t.mock.method(mongoClient, "db", () => ({
    collection: () => collection,
  }) as unknown as ReturnType<typeof mongoClient.db>);
  t.mock.method(mongoClient, "close", async () => {});
  t.mock.method(pool, "query", async () => ({ rows: [], rowCount: 0 }));
  t.mock.method(pool, "end", async () => {});

  await seed.seed();

  assert.deepEqual(calls, ["uniqueIndex", "bulkWrite"]);
});

test("seed rejects non-array API responses before database writes", async () => {
  const seed = await import("../../scripts/seed");

  assert.throws(
    () => seed.validateSeedArray("products", { products: [] }),
    /Invalid FakeStoreAPI products response/,
  );
  assert.throws(
    () => seed.validateSeedArray("users", null),
    /Invalid FakeStoreAPI users response/,
  );
});

test("seed rejects null and non-object entries with a domain error", async () => {
  const seed = await import("../../scripts/seed");

  for (const entry of [null, undefined, "product", 42, () => undefined]) {
    assert.throws(
      () => seed.validateSeedArray("products", [entry]),
      /Invalid FakeStoreAPI products response/,
    );
    assert.throws(
      () => seed.validateSeedArray("users", [entry]),
      /Invalid FakeStoreAPI users response/,
    );
  }
});

test("seed reports a users-response error for malformed addresses", async () => {
  const seed = await import("../../scripts/seed");

  assert.throws(
    () =>
      seed.validateSeedArray("users", [{
        name: { firstname: "A", lastname: "B" },
        email: "user@example.com",
        address: [],
      }]),
    /Invalid FakeStoreAPI users response/,
  );
});

test("seed rejects malformed product and user values before database writes", async () => {
  const seed = await import("../../scripts/seed");

  assert.throws(
    () =>
      seed.validateSeedArray("products", [{
        id: 0,
        title: "",
        price: -1,
        description: "description",
        category: "category",
        image: "image",
        rating: { rate: 5.1, count: -1 },
      }]),
    /Invalid FakeStoreAPI products response/,
  );
  assert.throws(
    () =>
      seed.validateSeedArray("users", [{
        name: { firstname: "", lastname: "User" },
        email: "",
        address: { street: "", number: 1, city: "Recife", zipcode: "50000" },
      }]),
    /Invalid FakeStoreAPI users response/,
  );
});
