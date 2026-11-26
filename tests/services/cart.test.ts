import assert from "node:assert/strict";
import test from "node:test";
import type {
  CartAndSessionRepository,
  CatalogRepository,
  OrderAndInventoryRepository,
} from "../../src/lib/repositories/contracts";
import type { ProductRecord } from "../../src/lib/types";
import {
  CartProductUnavailableError,
  CartService,
} from "../../src/lib/services/cart";

type CartReader = Pick<
  CartAndSessionRepository,
  "getCart" | "addItem" | "removeItem"
>;
type CatalogReader = Pick<
  CatalogRepository,
  "findByExternalId" | "findByExternalIds"
>;
type InventoryReader = Pick<OrderAndInventoryRepository, "stocksFor">;

const PRODUCTS: ProductRecord[] = [
  {
    externalId: 3,
    title: "Three",
    price: 4,
    description: "Third product",
    category: "test",
    image: "https://example.test/three.png",
    rating: { rate: 4, count: 3 },
  },
  {
    externalId: 9,
    title: "Nine",
    price: 12.5,
    description: "Ninth product",
    category: "test",
    image: "https://example.test/nine.png",
    rating: { rate: 4.5, count: 9 },
  },
];

test("empty carts do not query catalog or inventory", async () => {
  const cartRepository: CartReader = {
    async getCart(userId) {
      assert.equal(userId, 7);
      return {};
    },
    async addItem() {
      return 1;
    },
    async removeItem() {},
  };
  const catalogRepository: CatalogReader = {
    async findByExternalId() {
      throw new Error("catalog details must not be queried");
    },
    async findByExternalIds() {
      throw new Error("catalog must not be queried");
    },
  };
  const inventoryRepository: InventoryReader = {
    async stocksFor() {
      throw new Error("inventory must not be queried");
    },
  };
  const service = new CartService(
    cartRepository,
    catalogRepository,
    inventoryRepository,
  );

  assert.deepEqual(await service.getCart(7), []);
});

test("cart hydration combines product details and batched stocks", async () => {
  const calls = {
    catalog: [] as number[][],
    inventory: [] as number[][],
  };
  const cartRepository: CartReader = {
    async getCart() {
      return { 3: 2, 9: 4 };
    },
    async addItem() {
      return 1;
    },
    async removeItem() {},
  };
  const catalogRepository: CatalogReader = {
    async findByExternalId() {
      throw new Error("catalog details must not be queried");
    },
    async findByExternalIds(ids) {
      calls.catalog.push(ids);
      return [...PRODUCTS].reverse();
    },
  };
  const inventoryRepository: InventoryReader = {
    async stocksFor(ids) {
      calls.inventory.push(ids);
      return new Map([[3, 5], [9, 1]]);
    },
  };
  const service = new CartService(
    cartRepository,
    catalogRepository,
    inventoryRepository,
  );

  assert.deepEqual(await service.getCart(1), [
    {
      externalId: 3,
      quantity: 2,
      title: "Three",
      price: 4,
      image: "https://example.test/three.png",
      stock: 5,
      available: true,
    },
    {
      externalId: 9,
      quantity: 4,
      title: "Nine",
      price: 12.5,
      image: "https://example.test/nine.png",
      stock: 1,
      available: false,
    },
  ]);
  assert.deepEqual(calls.catalog, [[3, 9]]);
  assert.deepEqual(calls.inventory, [[3, 9]]);
});

test("missing inventory is treated as zero stock", async () => {
  const service = new CartService(
    {
      async getCart() { return { 3: 1 }; },
      async addItem() { return 1; },
      async removeItem() {},
    },
    {
      async findByExternalId() { return PRODUCTS[0]; },
      async findByExternalIds() { return [PRODUCTS[0]]; },
    },
    { async stocksFor() { return new Map(); } },
  );

  const items = await service.getCart(1);

  assert.equal(items[0]?.stock, 0);
  assert.equal(items[0]?.available, false);
});

test("missing catalog products reject hydration without mutating the cart", async () => {
  const mutations: string[] = [];
  const cartRepository: CartReader & Pick<
    CartAndSessionRepository,
    "addItem" | "removeItem" | "clearCart"
  > = {
    async getCart() {
      return { 3: 1, 9: 2, 11: 1 };
    },
    async addItem() {
      mutations.push("addItem");
      return 1;
    },
    async removeItem() {
      mutations.push("removeItem");
    },
    async clearCart() {
      mutations.push("clearCart");
    },
  };
  const inventoryRepository: InventoryReader = {
    async stocksFor() {
      throw new Error("inventory must not be queried");
    },
  };
  const service = new CartService(
    cartRepository,
    {
      async findByExternalId() { return PRODUCTS[0]; },
      async findByExternalIds() { return [PRODUCTS[0]]; },
    },
    inventoryRepository,
  );

  await assert.rejects(
    service.getCart(1),
    (error: unknown) => {
      assert.ok(error instanceof CartProductUnavailableError);
      assert.deepEqual(error.missingExternalIds, [9, 11]);
      return true;
    },
  );
  assert.deepEqual(mutations, []);
});

test("inventory failures are propagated unchanged", async () => {
  const failure = new Error("inventory unavailable");
  const service = new CartService(
    {
      async getCart() { return { 3: 1 }; },
      async addItem() { return 1; },
      async removeItem() {},
    },
    {
      async findByExternalId() { return PRODUCTS[0]; },
      async findByExternalIds() { return [PRODUCTS[0]]; },
    },
    { async stocksFor() { throw failure; } },
  );

  await assert.rejects(
    service.getCart(1),
    (error: unknown) => error === failure,
  );
});

test("cart service validates product before positive quantity changes", async () => {
  const addedItems: Array<[number, number, number]> = [];
  const catalogLookups: number[] = [];
  const service = new CartService(
    {
      async getCart() {
        return {};
      },
      async addItem(userId, externalId, quantity = 1) {
        addedItems.push([userId, externalId, quantity]);
        return quantity;
      },
      async removeItem() {},
    },
    {
      async findByExternalId(externalId) {
        catalogLookups.push(externalId);
        return PRODUCTS.find((product) => product.externalId === externalId) ?? null;
      },
      async findByExternalIds() {
        return [];
      },
    },
    { async stocksFor() { return new Map(); } },
  );

  await service.updateItemQuantity(7, 3, 2);

  assert.deepEqual(catalogLookups, [3]);
  assert.deepEqual(addedItems, [[7, 3, 2]]);
});

test("cart service rejects a missing product before mutation", async () => {
  const mutations: Array<[number, number, number]> = [];
  const service = new CartService(
    {
      async getCart() {
        return {};
      },
      async addItem(userId, externalId, quantity = 1) {
        mutations.push([userId, externalId, quantity]);
        return quantity;
      },
      async removeItem() {},
    },
    {
      async findByExternalId() {
        return null;
      },
      async findByExternalIds() {
        return [];
      },
    },
    { async stocksFor() { return new Map(); } },
  );

  await assert.rejects(
    service.updateItemQuantity(7, 404, 1),
    (error: unknown) => {
      assert.ok(error instanceof CartProductUnavailableError);
      assert.deepEqual(error.missingExternalIds, [404]);
      return true;
    },
  );
  assert.deepEqual(mutations, []);
});

test("cart service decrements quantity without a catalog lookup", async () => {
  const addedItems: Array<[number, number, number]> = [];
  const service = new CartService(
    {
      async getCart() {
        return {};
      },
      async addItem(userId, externalId, quantity = 1) {
        addedItems.push([userId, externalId, quantity]);
        return quantity;
      },
      async removeItem() {},
    },
    {
      async findByExternalId() {
        throw new Error("catalog must not be queried");
      },
      async findByExternalIds() {
        return [];
      },
    },
    { async stocksFor() { return new Map(); } },
  );

  await service.updateItemQuantity(7, 3, -1);

  assert.deepEqual(addedItems, [[7, 3, -1]]);
});

test("cart service removes an item through the repository", async () => {
  const removedItems: Array<[number, number]> = [];
  const service = new CartService(
    {
      async getCart() {
        return {};
      },
      async addItem() {
        return 1;
      },
      async removeItem(userId, externalId) {
        removedItems.push([userId, externalId]);
      },
    },
    {
      async findByExternalId() {
        return null;
      },
      async findByExternalIds() {
        return [];
      },
    },
    { async stocksFor() { return new Map(); } },
  );

  await service.removeItem(7, 3);

  assert.deepEqual(removedItems, [[7, 3]]);
});
