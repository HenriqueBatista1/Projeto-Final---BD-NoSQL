import type { Pool } from "pg";
import { InsufficientStockError } from "../errors";
import type { OrderAndInventoryRepository as OrderAndInventoryRepositoryContract } from "./contracts";
import type { Order, PlacedOrderItem } from "../types";

type PlaceOrderInput = {
  userId: number;
  deliveryAddress: string;
  paymentMethod: string;
  items: PlacedOrderItem[];
};

type InventoryRow = {
  external_product_id: number;
  quantity: number;
};

type CreatedOrderRow = {
  id: number;
  created_at: Date | string;
};

type OrderHistoryRow = {
  order_id: number;
  total_amount: number | string;
  status: string;
  payment_method: string;
  delivery_address: string;
  created_at: Date | string;
  external_product_id: number;
  product_title: string;
  unit_price: number | string;
  quantity: number;
  subtotal: number | string;
};

function dateToString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export class InvalidOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOrderError";
  }
}

function validateOrderItems(items: PlacedOrderItem[]): void {
  if (items.length === 0) {
    throw new InvalidOrderError("Order must contain at least one item");
  }

  const externalIds = new Set<number>();
  for (const item of items) {
    if (!item || typeof item !== "object") {
      throw new InvalidOrderError("Order contains an invalid item");
    }
    if (externalIds.has(item.externalId)) {
      throw new InvalidOrderError(
        `Order contains duplicate product ${item.externalId}`,
      );
    }
    externalIds.add(item.externalId);
  }
}

export class OrderAndInventoryRepository
  implements OrderAndInventoryRepositoryContract {
  constructor(private readonly client?: Pool) {}

  private async database(): Promise<Pool> {
    return this.client ?? (await import("../db/postgres")).pool;
  }

  async stocksFor(ids: number[]): Promise<Map<number, number>> {
    const database = await this.database();
    const result = await database.query<InventoryRow>(
      `SELECT external_product_id, quantity
       FROM inventory
       WHERE external_product_id = ANY($1::int[])`,
      [ids],
    );

    return new Map(
      result.rows.map((row) => [row.external_product_id, row.quantity]),
    );
  }

  async placeOrder(
    input: PlaceOrderInput,
  ): Promise<{ orderId: number; createdAt: string }> {
    validateOrderItems(input.items);

    const database = await this.database();
    const client = await database.connect();
    const orderedItems = [...input.items].sort(
      (left, right) => left.externalId - right.externalId,
    );

    try {
      await client.query("BEGIN");

      for (const item of orderedItems) {
        const stockResult = await client.query<Pick<InventoryRow, "quantity">>(
          `SELECT quantity
           FROM inventory
           WHERE external_product_id = $1
           FOR UPDATE`,
          [item.externalId],
        );
        const stock = stockResult.rows[0]?.quantity;
        if (stock === undefined || stock < item.quantity) {
          throw new InsufficientStockError(item.externalId);
        }
      }

      for (const item of orderedItems) {
        await client.query(
          `UPDATE inventory
           SET quantity = quantity - $1
           WHERE external_product_id = $2`,
          [item.quantity, item.externalId],
        );
      }

      const totalAmount = orderedItems.reduce(
        (total, item) => total + item.unitPrice * item.quantity,
        0,
      );
      const orderResult = await client.query<CreatedOrderRow>(
        `INSERT INTO orders
           (user_id, total_amount, payment_method, status, delivery_address)
         VALUES ($1, $2, $3, 'PAGO', $4)
         RETURNING id, created_at`,
        [
          input.userId,
          totalAmount,
          input.paymentMethod,
          input.deliveryAddress,
        ],
      );
      const createdOrder = orderResult.rows[0];
      if (!createdOrder) {
        throw new Error("Order insert did not return a row");
      }

      for (const item of orderedItems) {
        await client.query(
          `INSERT INTO order_items
             (order_id, external_product_id, product_title, unit_price, quantity, subtotal)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            createdOrder.id,
            item.externalId,
            item.title,
            item.unitPrice,
            item.quantity,
            item.unitPrice * item.quantity,
          ],
        );
      }

      await client.query("COMMIT");
      return {
        orderId: createdOrder.id,
        createdAt: dateToString(createdOrder.created_at),
      };
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the transaction's original failure.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async history(userId: number): Promise<Order[]> {
    const database = await this.database();
    const result = await database.query<OrderHistoryRow>(
      `SELECT
         o.id AS order_id,
         o.total_amount,
         o.status,
         o.payment_method,
         o.delivery_address,
         o.created_at,
         oi.external_product_id,
         oi.product_title,
         oi.unit_price,
         oi.quantity,
         oi.subtotal
       FROM orders o
       INNER JOIN order_items oi ON oi.order_id = o.id
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC, oi.id ASC`,
      [userId],
    );

    const orders = new Map<number, Order>();
    for (const row of result.rows) {
      let order = orders.get(row.order_id);
      if (!order) {
        order = {
          id: row.order_id,
          totalAmount: Number(row.total_amount),
          status: row.status,
          paymentMethod: row.payment_method,
          deliveryAddress: row.delivery_address,
          createdAt: dateToString(row.created_at),
          items: [],
        };
        orders.set(row.order_id, order);
      }

      order.items.push({
        externalId: row.external_product_id,
        title: row.product_title,
        unitPrice: Number(row.unit_price),
        quantity: row.quantity,
        subtotal: Number(row.subtotal),
      });
    }

    return [...orders.values()];
  }
}
