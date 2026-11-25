import assert from "node:assert/strict";
import test from "node:test";
import type { OrderAndInventoryRepository } from "../../src/lib/repositories/contracts";
import type { Order } from "../../src/lib/types";
import { OrderHistoryService } from "../../src/lib/services/order-history";

type OrderHistoryReader = Pick<OrderAndInventoryRepository, "history">;

test("order history delegates grouped orders without a catalog dependency", async () => {
  const orders: Order[] = [{
    id: 12,
    totalAmount: 18.5,
    status: "PAGO",
    paymentMethod: "PIX",
    deliveryAddress: "Rua B",
    createdAt: "2026-11-24T12:00:00.000Z",
    items: [
      { externalId: 3, title: "Three", unitPrice: 4, quantity: 1, subtotal: 4 },
      { externalId: 9, title: "Nine", unitPrice: 7.25, quantity: 2, subtotal: 14.5 },
    ],
  }];
  const calls: number[] = [];
  const repository: OrderHistoryReader = {
    async history(userId) {
      calls.push(userId);
      return orders;
    },
  };
  const service = new OrderHistoryService(repository);

  assert.strictEqual(await service.getHistory(5), orders);
  assert.deepEqual(calls, [5]);
});
