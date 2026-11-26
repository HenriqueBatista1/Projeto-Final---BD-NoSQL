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

test("order history enriches items with catalog images in a single batch query", async () => {
  const orders: Order[] = [
    {
      id: 1,
      totalAmount: 100,
      status: "PAGO",
      paymentMethod: "PIX",
      deliveryAddress: "Rua A",
      createdAt: "2026-11-25T10:00:00.000Z",
      items: [
        { externalId: 10, title: "Item 10", unitPrice: 50, quantity: 1, subtotal: 50 },
        { externalId: 20, title: "Item 20", unitPrice: 50, quantity: 1, subtotal: 50 },
      ],
    },
    {
      id: 2,
      totalAmount: 50,
      status: "PAGO",
      paymentMethod: "CARTAO_CREDITO",
      deliveryAddress: "Rua A",
      createdAt: "2026-11-25T11:00:00.000Z",
      items: [
        { externalId: 10, title: "Item 10", unitPrice: 50, quantity: 1, subtotal: 50 },
      ],
    },
  ];

  const batchCalls: number[][] = [];
  const catalog = {
    async findByExternalIds(ids: number[]) {
      batchCalls.push(ids);
      return [
        { externalId: 10, image: "https://example.com/10.png" },
        { externalId: 20, image: "https://example.com/20.png" },
      ] as any;
    },
  };

  const repository: OrderHistoryReader = {
    async history() {
      return orders;
    },
  };

  const service = new OrderHistoryService(repository, catalog);
  const result = await service.getHistory(1);

  // Deve fazer uma única chamada em lote com os IDs únicos [10, 20]
  assert.equal(batchCalls.length, 1);
  assert.deepEqual(batchCalls[0].sort(), [10, 20]);

  // Deve ter enriquecido os itens preservando o snapshot original
  assert.equal(result[0].items[0].image, "https://example.com/10.png");
  assert.equal(result[0].items[1].image, "https://example.com/20.png");
  assert.equal(result[1].items[0].image, "https://example.com/10.png");
});

