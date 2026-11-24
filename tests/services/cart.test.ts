import assert from "node:assert/strict";
import test from "node:test";
import type {
  CartAndSessionRepository,
  CatalogRepository,
  OrderAndInventoryRepository,
} from "../../src/lib/repositories/contracts";
import type { ProductRecord } from "../../src/lib/types";
import {
  CartProductNotFoundError,
  CartService,
} from "../../src/lib/services/cart";

const RING: ProductRecord = {
  externalId: 7,
  title: "Silver Ring",
  price: 19.99,
  description: "A polished ring",
  category: "jewelery",
  image: "https://example.test/ring.png",
  rating: { rate: 4.2, count: 18 },
};

const BOOK: ProductRecord = {
  externalId: 11,
  title: "Everyday Backpack",
  price: 39.99,
  description: "A practical backpack",
  category: "men's clothing",
  image: "https://example.test/backpack.png",
  rating: { rate: 4.5, count: 25 },
};

type CartFakesOptions = {
  cart?: Record<number, number>;
  products?: ProductRecord[];
  stocks?: Map<number, number>;
  failure?: { repository: "cart" | "catalog" | "stock"; error: Error };
};

function cartFakes(options: CartFakesOptions = {}) {
  const calls = {
    cart: [] as number[],
    catalog: [] as number[][],
    stocks: [] as number[][],
  };

  const cartRepository: CartAndSessionRepository = {
    async getCart(userId) {
      calls.cart.push(userId);
      if (options.failure?.repository === "cart") {
        throw options.failure.error;
      }
      return options.cart ?? {};
    },
    async addItem() {
      throw new Error("addItem should not be called by CartService");
    },
    async removeItem() {
      throw new Error("removeItem should not be called by CartService");
    },
    async clearCart() {
      throw new Error("clearCart should not be called by CartService");
    },
    async createSession() {
      throw new Error("createSession should not be called by CartService");
    },
    async getSession() {
      throw new Error("getSession should not be called by CartService");
    },
    async deleteSession() {
      throw new Error("deleteSession should not be called by CartService");
    },
  };

  const catalogRepository: CatalogRepository = {
    async list() {
      throw new Error("list should not be called by CartService");
    },
    async findByExternalIds(ids) {
      calls.catalog.push([...ids]);
      if (options.failure?.repository === "catalog") {
        throw options.failure.error;
      }
      return options.products ?? [];
    },
    async findByExternalId() {
      throw new Error("findByExternalId should not be called by CartService");
    },
    async listCategories() {
      throw new Error("listCategories should not be called by CartService");
    },
    async suggest() {
      throw new Error("suggest should not be called by CartService");
    },
  };

  const inventoryRepository: OrderAndInventoryRepository = {
    async stocksFor(ids) {
      calls.stocks.push([...ids]);
      if (options.failure?.repository === "stock") {
        throw options.failure.error;
      }
      return options.stocks ?? new Map();
    },
    async placeOrder() {
      throw new Error("placeOrder should not be called by CartService");
    },
    async history() {
      throw new Error("history should not be called by CartService");
    },
  };

  return {
    calls,
    service: new CartService(
      cartRepository,
      catalogRepository,
      inventoryRepository,
    ),
  };
}

test("empty cart returns an empty list without querying other repositories", async () => {
  const fake = cartFakes({ cart: {} });

  assert.deepEqual(await fake.service.getCart(42), []);
  assert.deepEqual(fake.calls.cart, [42]);
  assert.deepEqual(fake.calls.catalog, []);
  assert.deepEqual(fake.calls.stocks, []);
});

test("cart hydrates items by external ID with one catalog and stock lookup", async () => {
  const fake = cartFakes({
    cart: { 7: 2, 11: 1 },
    products: [BOOK, RING],
    stocks: new Map([
      [7, 4],
      [11, 1],
    ]),
  });

  assert.deepEqual(await fake.service.getCart(42), [
    {
      externalId: 7,
      quantity: 2,
      title: RING.title,
      price: RING.price,
      image: RING.image,
      stock: 4,
      available: true,
    },
    {
      externalId: 11,
      quantity: 1,
      title: BOOK.title,
      price: BOOK.price,
      image: BOOK.image,
      stock: 1,
      available: true,
    },
  ]);
  assert.deepEqual(fake.calls.catalog, [[7, 11]]);
  assert.deepEqual(fake.calls.stocks, [[7, 11]]);
});

test("unavailable cart items reflect current and missing stock", async () => {
  const fake = cartFakes({
    cart: { 7: 3, 11: 1 },
    products: [RING, BOOK],
    stocks: new Map([[7, 2]]),
  });

  const items = await fake.service.getCart(42);

  assert.deepEqual(
    items.map(({ externalId, stock, available }) => ({
      externalId,
      stock,
      available,
    })),
    [
      { externalId: 7, stock: 2, available: false },
      { externalId: 11, stock: 0, available: false },
    ],
  );
});

test("missing catalog product rejects and skips stock lookup", async () => {
  const fake = cartFakes({
    cart: { 7: 1, 11: 1 },
    products: [RING],
  });

  await assert.rejects(
    fake.service.getCart(42),
    (error: unknown) =>
      error instanceof CartProductNotFoundError &&
      error.message === "Product 11 not found in catalog",
  );
  assert.deepEqual(fake.calls.catalog, [[7, 11]]);
  assert.deepEqual(fake.calls.stocks, []);
});

test("repository failures are propagated unchanged", async () => {
  const failure = new Error("inventory unavailable");
  const fake = cartFakes({
    cart: { 7: 1 },
    products: [RING],
    failure: { repository: "stock", error: failure },
  });

  await assert.rejects(fake.service.getCart(42), (error: unknown) => error === failure);
});
