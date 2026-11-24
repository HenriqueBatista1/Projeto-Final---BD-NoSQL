import assert from "node:assert/strict";
import test from "node:test";
import type { CartItem, Order, Product } from "../../src/lib/types";

test("domain types preserve the Product, CartItem, and Order shapes", () => {
  const product = {
    externalId: 1,
    title: "Backpack",
    price: 109.95,
    description: "Everyday backpack",
    category: "men's clothing",
    image: "https://example.test/backpack.png",
    rating: { rate: 3.9, count: 120 },
    stock: 11,
  } satisfies Product;
  const cartItem = { externalId: 1, quantity: 2 } satisfies CartItem;
  const order = {
    id: 7,
    totalAmount: 219.9,
    status: "PAGO",
    paymentMethod: "credit_card",
    deliveryAddress: "Rua Central, 42",
    createdAt: "2026-01-10T12:00:00.000Z",
    items: [{
      externalId: 1,
      title: "Backpack",
      unitPrice: 109.95,
      quantity: 2,
      subtotal: 219.9,
    }],
  } satisfies Order;

  assert.deepEqual(Object.keys(product).sort(), [
    "category",
    "description",
    "externalId",
    "image",
    "price",
    "rating",
    "stock",
    "title",
  ]);
  assert.deepEqual(cartItem, { externalId: 1, quantity: 2 });
  assert.equal(order.items[0].subtotal, order.totalAmount);
});
