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
