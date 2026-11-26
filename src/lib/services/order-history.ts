import type {
  CatalogRepository,
  OrderAndInventoryRepository,
} from "../repositories/contracts";
import type { Order, OrderItem } from "../types";

type OrderHistoryReader = Pick<OrderAndInventoryRepository, "history">;
type CatalogReader = Pick<CatalogRepository, "findByExternalIds">;

export type EnrichedOrderItem = OrderItem & {
  image?: string;
};

export type EnrichedOrder = Omit<Order, "items"> & {
  items: EnrichedOrderItem[];
};

export class OrderHistoryService {
  constructor(
    private readonly repository: OrderHistoryReader,
    private readonly catalog?: CatalogReader,
  ) {}

  async getHistory(userId: number): Promise<EnrichedOrder[]> {
    const orders = await this.repository.history(userId);
    if (!this.catalog || orders.length === 0) {
      return orders;
    }

    const uniqueExternalIds = Array.from(
      new Set(
        orders.flatMap((order) => order.items.map((item) => item.externalId)),
      ),
    );

    if (uniqueExternalIds.length === 0) {
      return orders;
    }

    const catalogProducts =
      await this.catalog.findByExternalIds(uniqueExternalIds);
    const imagesByProductId = new Map(
      catalogProducts.map((product) => [product.externalId, product.image]),
    );

    return orders.map((order) => ({
      ...order,
      items: order.items.map((item) => ({
        ...item,
        image: imagesByProductId.get(item.externalId),
      })),
    }));
  }
}

