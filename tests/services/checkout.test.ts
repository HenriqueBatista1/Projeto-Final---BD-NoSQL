import assert from "node:assert/strict";
import test from "node:test";
import type {
  CartAndSessionRepository,
  CatalogRepository,
  OrderAndInventoryRepository,
} from "../../src/lib/repositories/contracts";
import { InsufficientStockError } from "../../src/lib/errors";
import {
  CheckoutError,
  CheckoutService,
  type CheckoutInput,
} from "../../src/lib/services/checkout";
import type { ProductRecord } from "../../src/lib/types";

const PRODUCTS: ProductRecord[] = [
  {
    externalId: 3,
    title: "Three",
    price: 4,
    description: "Product three",
    category: "test",
    image: "https://example.test/three.png",
    rating: { rate: 4, count: 10 },
  },
  {
    externalId: 9,
    title: "Nine",
    price: 12.5,
    description: "Product nine",
    category: "test",
    image: "https://example.test/nine.png",
    rating: { rate: 4.5, count: 20 },
  },
];

const INPUT: CheckoutInput = {
  userId: 7,
  deliveryAddress: "Rua dos Testes, 10",
  paymentMethod: "PIX",
};

type CheckoutFakeOptions = {
  cart?: Record<number, number>;
  products?: ProductRecord[];
  catalogError?: Error;
  placeOrderError?: Error;
  clearCartError?: Error;
};

function checkoutFake(options: CheckoutFakeOptions = {}) {
  const events: string[] = [];
  const placedInputs: Parameters<OrderAndInventoryRepository["placeOrder"]>[0][] = [];
  const cart: Pick<CartAndSessionRepository, "getCart" | "clearCart"> = {
    async getCart(userId: number) {
      events.push(`cart.get:${userId}`);
      return options.cart ?? { 9: 2, 3: 1 };
    },
    async clearCart(userId: number) {
      events.push(`cart.clear:${userId}`);
      if (options.clearCartError) {
        throw options.clearCartError;
      }
    },
  };
  const catalog: Pick<CatalogRepository, "findByExternalIds"> = {
    async findByExternalIds(ids: number[]) {
      events.push(`catalog.find:${ids.join(",")}`);
      if (options.catalogError) {
        throw options.catalogError;
      }
      return options.products ?? PRODUCTS;
    },
  };
  const orders: Pick<OrderAndInventoryRepository, "placeOrder"> = {
    async placeOrder(input) {
      events.push("orders.place");
      placedInputs.push(input);
      if (options.placeOrderError) {
        throw options.placeOrderError;
      }
      return {
        orderId: 41,
        createdAt: "2026-11-24T13:00:00.000Z",
      };
    },
  };

  return {
    events,
    placedInputs,
    service: new CheckoutService(cart, catalog, orders),
  };
}

test("checkout uses official product snapshots and clears only after commit", async () => {
  const fake = checkoutFake();

  const result = await fake.service.checkout({
    ...INPUT,
    price: 0.01,
  } as CheckoutInput & { price: number });

  assert.deepEqual(result, {
    orderId: 41,
    createdAt: "2026-11-24T13:00:00.000Z",
    cartCleared: true,
  });
  assert.deepEqual(fake.events, [
    "cart.get:7",
    "catalog.find:3,9",
    "orders.place",
    "cart.clear:7",
  ]);
  assert.deepEqual(fake.placedInputs, [{
    userId: 7,
    deliveryAddress: "Rua dos Testes, 10",
    paymentMethod: "PIX",
    items: [
      { externalId: 3, title: "Three", unitPrice: 4, quantity: 1 },
      { externalId: 9, title: "Nine", unitPrice: 12.5, quantity: 2 },
    ],
  }]);
});

test("checkout rejects an empty cart without reading other stores", async () => {
  const fake = checkoutFake({ cart: {} });

  await assert.rejects(
    fake.service.checkout(INPUT),
    (error: unknown) =>
      error instanceof CheckoutError &&
      error.code === "EMPTY_CART" &&
      error.message === "Seu carrinho está vazio.",
  );
  assert.deepEqual(fake.events, ["cart.get:7"]);
});

test("checkout rejects missing catalog products and preserves the cart", async () => {
  const fake = checkoutFake({ products: [PRODUCTS[0]] });

  await assert.rejects(
    fake.service.checkout(INPUT),
    (error: unknown) =>
      error instanceof CheckoutError &&
      error.code === "MISSING_PRODUCT" &&
      error.message === "O produto 9 não está disponível no catálogo.",
  );
  assert.deepEqual(fake.events, ["cart.get:7", "catalog.find:3,9"]);
  assert.deepEqual(fake.placedInputs, []);
});

test("checkout reports insufficient stock without clearing the cart", async () => {
  const stockError = new InsufficientStockError(9);
  const fake = checkoutFake({ placeOrderError: stockError });

  await assert.rejects(
    fake.service.checkout(INPUT),
    (error: unknown) =>
      error instanceof CheckoutError &&
      error.code === "INSUFFICIENT_STOCK" &&
      error.message === "Estoque insuficiente para o produto 9." &&
      error.cause === stockError,
  );
  assert.deepEqual(fake.events, [
    "cart.get:7",
    "catalog.find:3,9",
    "orders.place",
  ]);
});

test("checkout propagates catalog failures without placing or clearing", async () => {
  const catalogError = new Error("MongoDB unavailable");
  const fake = checkoutFake({ catalogError });

  await assert.rejects(
    fake.service.checkout(INPUT),
    (error: unknown) => error === catalogError,
  );
  assert.deepEqual(fake.events, ["cart.get:7", "catalog.find:3,9"]);
  assert.deepEqual(fake.placedInputs, []);
});

test("checkout propagates generic order failures without clearing", async () => {
  const orderError = new Error("PostgreSQL unavailable");
  const fake = checkoutFake({ placeOrderError: orderError });

  await assert.rejects(
    fake.service.checkout(INPUT),
    (error: unknown) => error === orderError,
  );
  assert.deepEqual(fake.events, [
    "cart.get:7",
    "catalog.find:3,9",
    "orders.place",
  ]);
});

test("checkout returns committed order when post-commit cleanup fails", async () => {
  const fake = checkoutFake({ clearCartError: new Error("Redis unavailable") });

  assert.deepEqual(await fake.service.checkout(INPUT), {
    orderId: 41,
    createdAt: "2026-11-24T13:00:00.000Z",
    cartCleared: false,
  });
  assert.deepEqual(fake.events, [
    "cart.get:7",
    "catalog.find:3,9",
    "orders.place",
    "cart.clear:7",
  ]);
});
