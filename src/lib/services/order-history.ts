import type { OrderAndInventoryRepository } from "../repositories/contracts";
import type { Order } from "../types";

type OrderHistoryReader = Pick<OrderAndInventoryRepository, "history">;

export class OrderHistoryService {
  constructor(private readonly repository: OrderHistoryReader) {}

  async getHistory(userId: number): Promise<Order[]> {
    return this.repository.history(userId);
  }
}
