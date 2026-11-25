import type {
  CartAndSessionRepository,
  CatalogRepository,
  OrderAndInventoryRepository,
} from "../repositories/contracts";
import type { HydratedCartItem } from "../types";

type CartReader = Pick<CartAndSessionRepository, "getCart">;
type CatalogReader = Pick<CatalogRepository, "findByExternalIds">;
type InventoryReader = Pick<OrderAndInventoryRepository, "stocksFor">;

export class CartProductUnavailableError extends Error {
  readonly missingExternalIds: readonly number[];

  constructor(missingExternalIds: number[]) {
    super(
      `Cart products unavailable in catalog: ${missingExternalIds.join(", ")}`,
    );
    this.name = "CartProductUnavailableError";
    this.missingExternalIds = [...missingExternalIds];
  }
}

export class CartService {
  constructor(
    private readonly cartRepository: CartReader,
    private readonly catalogRepository: CatalogReader,
    private readonly inventoryRepository: InventoryReader,
  ) {}

  async getCart(userId: number): Promise<HydratedCartItem[]> {
    const cart = await this.cartRepository.getCart(userId);
    const externalIds = Object.keys(cart).map(Number);

    if (externalIds.length === 0) {
      return [];
    }

    const products = await this.catalogRepository.findByExternalIds(externalIds);
    const productsById = new Map(
      products.map((product) => [product.externalId, product]),
    );
    const missingExternalIds = externalIds.filter(
      (externalId) => !productsById.has(externalId),
    );
    if (missingExternalIds.length > 0) {
      throw new CartProductUnavailableError(missingExternalIds);
    }

    const stocks = await this.inventoryRepository.stocksFor(externalIds);

    return externalIds.map((externalId) => {
      const product = productsById.get(externalId)!;
      const quantity = cart[externalId];
      const stock = stocks.get(externalId) ?? 0;
      return {
        externalId,
        quantity,
        title: product.title,
        price: product.price,
        image: product.image,
        stock,
        available: quantity <= stock,
      };
    });
  }
}
