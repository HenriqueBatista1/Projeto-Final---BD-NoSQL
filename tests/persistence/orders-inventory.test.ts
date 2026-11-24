import assert from "node:assert/strict";
import test from "node:test";
import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

const {
  InsufficientStockError,
  InvalidOrderError,
  OrderAndInventoryRepository,
} = await import("../../src/lib/repositories/orders-inventory");

type QueryCall = { sql: string; values?: unknown[] };

function normalized(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function result<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return { rows, rowCount: rows.length } as QueryResult<Row>;
}

test("stocksFor loads all inventory quantities with one ANY query", async () => {
  const calls: QueryCall[] = [];
  const database = {
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql: normalized(sql), values });
      return result([
        { external_product_id: 4, quantity: 11 },
        { external_product_id: 9, quantity: 3 },
      ]);
    },
  } as unknown as Pool;
  const repository = new OrderAndInventoryRepository(database);

  const stocks = await repository.stocksFor([4, 9]);

  assert.deepEqual([...stocks], [[4, 11], [9, 3]]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /external_product_id = ANY\(\$1::int\[\]\)/);
  assert.deepEqual(calls[0].values, [[4, 9]]);
});

test("placeOrder rejects empty and duplicate items before connecting", async () => {
  let connections = 0;
  const database = {
    async connect() {
      connections += 1;
      throw new Error("should not connect");
    },
  } as unknown as Pool;
  const repository = new OrderAndInventoryRepository(database);
  const baseInput = {
    userId: 1,
    deliveryAddress: "Rua A",
    paymentMethod: "PIX",
  };

  await assert.rejects(
    repository.placeOrder({ ...baseInput, items: [] }),
    (error: unknown) =>
      error instanceof InvalidOrderError &&
      error.message === "Order must contain at least one item",
  );
  await assert.rejects(
    repository.placeOrder({
      ...baseInput,
      items: [
        { externalId: 2, title: "Two", unitPrice: 3, quantity: 1 },
        { externalId: 2, title: "Two", unitPrice: 3, quantity: 2 },
      ],
    }),
    (error: unknown) =>
      error instanceof InvalidOrderError &&
      error.message === "Order contains duplicate product 2",
  );
  assert.equal(connections, 0);
});

test("placeOrder rejects null and non-object items before connecting", async () => {
  let connections = 0;
  const database = {
    async connect() {
      connections += 1;
      throw new Error("should not connect");
    },
  } as unknown as Pool;
  const repository = new OrderAndInventoryRepository(database);
  const baseInput = {
    userId: 1,
    deliveryAddress: "Rua A",
    paymentMethod: "PIX",
  };

  for (const item of [null, undefined, "product", 42]) {
    await assert.rejects(
      repository.placeOrder({ ...baseInput, items: [item] as never }),
      (error: unknown) =>
        error instanceof InvalidOrderError &&
        error.message === "Order contains an invalid item",
    );
  }
  assert.equal(connections, 0);
});

test("placeOrder locks in product order and persists server snapshots", async () => {
  const calls: QueryCall[] = [];
  let released = false;
  const client = {
    async query(sql: string, values?: unknown[]) {
      const statement = normalized(sql);
      calls.push({ sql: statement, values });
      if (statement.startsWith("SELECT quantity")) {
        return result([{ quantity: values?.[0] === 3 ? 8 : 5 }]);
      }
      if (statement.startsWith("INSERT INTO orders")) {
        return result([{
          id: 41,
          created_at: new Date("2026-11-24T13:00:00.000Z"),
        }]);
      }
      return result([]);
    },
    release() {
      released = true;
    },
  } as unknown as PoolClient;
  const database = {
    async connect() {
      return client;
    },
  } as unknown as Pool;
  const repository = new OrderAndInventoryRepository(database);

  const placed = await repository.placeOrder({
    userId: 7,
    deliveryAddress: "Rua dos Testes, 10",
    paymentMethod: "PIX",
    items: [
      { externalId: 9, title: "Nine", unitPrice: 12.5, quantity: 2 },
      { externalId: 3, title: "Three", unitPrice: 4, quantity: 1 },
    ],
  });

  assert.deepEqual(placed, {
    orderId: 41,
    createdAt: "2026-11-24T13:00:00.000Z",
  });
  assert.equal(released, true);

  const lockCalls = calls.filter((call) => call.sql.startsWith("SELECT quantity"));
  assert.deepEqual(lockCalls.map((call) => call.values), [[3], [9]]);
  const updateCalls = calls.filter((call) => call.sql.startsWith("UPDATE inventory"));
  assert.deepEqual(updateCalls.map((call) => call.values), [[1, 3], [2, 9]]);

  const orderInsert = calls.find((call) => call.sql.startsWith("INSERT INTO orders"));
  assert.deepEqual(orderInsert?.values, [7, 29, "PIX", "Rua dos Testes, 10"]);
  const itemInserts = calls.filter((call) => call.sql.startsWith("INSERT INTO order_items"));
  assert.deepEqual(itemInserts.map((call) => call.values), [
    [41, 3, "Three", 4, 1, 4],
    [41, 9, "Nine", 12.5, 2, 25],
  ]);
  assert.equal(calls.at(-1)?.sql, "COMMIT");
});

test("placeOrder rolls back before debiting when any product lacks stock", async () => {
  const calls: QueryCall[] = [];
  let released = false;
  const client = {
    async query(sql: string, values?: unknown[]) {
      const statement = normalized(sql);
      calls.push({ sql: statement, values });
      if (statement.startsWith("SELECT quantity")) {
        return result([{ quantity: values?.[0] === 2 ? 6 : 1 }]);
      }
      return result([]);
    },
    release() {
      released = true;
    },
  } as unknown as PoolClient;
  const database = {
    async connect() {
      return client;
    },
  } as unknown as Pool;
  const repository = new OrderAndInventoryRepository(database);

  await assert.rejects(
    repository.placeOrder({
      userId: 1,
      deliveryAddress: "Rua A",
      paymentMethod: "CARD",
      items: [
        { externalId: 8, title: "Eight", unitPrice: 2, quantity: 3 },
        { externalId: 2, title: "Two", unitPrice: 3, quantity: 2 },
      ],
    }),
    (error: unknown) =>
      error instanceof InsufficientStockError &&
      error.message === "Insufficient stock for product 8",
  );

  assert.equal(released, true);
  assert.equal(calls.some((call) => call.sql.startsWith("UPDATE inventory")), false);
  assert.equal(calls.some((call) => call.sql.startsWith("INSERT INTO")), false);
  assert.equal(calls.at(-1)?.sql, "ROLLBACK");
});

test("placeOrder rolls back and releases the client when a write fails", async () => {
  const calls: QueryCall[] = [];
  let released = false;
  const writeFailure = new Error("inventory write failed");
  const client = {
    async query(sql: string, values?: unknown[]) {
      const statement = normalized(sql);
      calls.push({ sql: statement, values });
      if (statement.startsWith("SELECT quantity")) {
        return result([{ quantity: 5 }]);
      }
      if (statement.startsWith("UPDATE inventory")) {
        throw writeFailure;
      }
      return result([]);
    },
    release() {
      released = true;
    },
  } as unknown as PoolClient;
  const database = {
    async connect() {
      return client;
    },
  } as unknown as Pool;
  const repository = new OrderAndInventoryRepository(database);

  await assert.rejects(
    repository.placeOrder({
      userId: 1,
      deliveryAddress: "Rua A",
      paymentMethod: "PIX",
      items: [
        { externalId: 2, title: "Two", unitPrice: 3, quantity: 1 },
      ],
    }),
    (error: unknown) => error === writeFailure,
  );

  assert.equal(released, true);
  assert.equal(calls.some((call) => call.sql.startsWith("INSERT INTO")), false);
  assert.equal(calls.at(-1)?.sql, "ROLLBACK");
});

test("history groups joined item rows into orders", async () => {
  const calls: QueryCall[] = [];
  const database = {
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql: normalized(sql), values });
      return result([
        {
          order_id: 12,
          total_amount: "18.50",
          status: "PAGO",
          payment_method: "PIX",
          delivery_address: "Rua B",
          created_at: new Date("2026-11-24T12:00:00.000Z"),
          external_product_id: 3,
          product_title: "Three",
          unit_price: "4.00",
          quantity: 1,
          subtotal: "4.00",
        },
        {
          order_id: 12,
          total_amount: "18.50",
          status: "PAGO",
          payment_method: "PIX",
          delivery_address: "Rua B",
          created_at: new Date("2026-11-24T12:00:00.000Z"),
          external_product_id: 9,
          product_title: "Nine",
          unit_price: "7.25",
          quantity: 2,
          subtotal: "14.50",
        },
        {
          order_id: 10,
          total_amount: "2.00",
          status: "PAGO",
          payment_method: "CARD",
          delivery_address: "Rua C",
          created_at: "2026-11-23 10:00:00",
          external_product_id: 1,
          product_title: "One",
          unit_price: "2.00",
          quantity: 1,
          subtotal: "2.00",
        },
      ]);
    },
  } as unknown as Pool;
  const repository = new OrderAndInventoryRepository(database);

  const orders = await repository.history(5);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].values, [5]);
  assert.match(calls[0].sql, /ORDER BY o\.created_at DESC, oi\.id ASC/);
  assert.deepEqual(orders, [
    {
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
    },
    {
      id: 10,
      totalAmount: 2,
      status: "PAGO",
      paymentMethod: "CARD",
      deliveryAddress: "Rua C",
      createdAt: "2026-11-23 10:00:00",
      items: [
        { externalId: 1, title: "One", unitPrice: 2, quantity: 1, subtotal: 2 },
      ],
    },
  ]);
});
