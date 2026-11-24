import type {
  CartAndSessionRepository as CartAndSessionRepositoryContract,
  CatalogRepository as CatalogRepositoryContract,
  OrderAndInventoryRepository as OrderAndInventoryRepositoryContract,
} from "../repositories/contracts";
import { CartAndSessionRepository } from "../repositories/cart-session";
import { CatalogRepository } from "../repositories/catalog";
import { OrderAndInventoryRepository } from "../repositories/orders-inventory";
import type { HydratedCartItem, ProductRecord } from "../types";

export class CartProductNotFoundError extends Error {
  constructor(externalId: number) {
    super(`Product ${externalId} not found in catalog`);
    this.name = "CartProductNotFoundError";
  }
}

export class CartService {
  constructor(
    private readonly cartRepository: CartAndSessionRepositoryContract =
      new CartAndSessionRepository(),
    private readonly catalogRepository: CatalogRepositoryContract =
      new CatalogRepository(),
    private readonly inventoryRepository: OrderAndInventoryRepositoryContract =
      new OrderAndInventoryRepository(),
  ) {}

  async getCart(userId: number): Promise<HydratedCartItem[]> {
    const cart = await this.cartRepository.getCart(userId);
    const externalIds = Object.keys(cart).map(Number);
    if (externalIds.length === 0) {
      return [];
    }

    const productRecords =
      await this.catalogRepository.findByExternalIds(externalIds);
    const productsById = new Map<number, ProductRecord>(
      productRecords.map((product) => [product.externalId, product]),
    );
    const products = externalIds.map((externalId) => {
      const product = productsById.get(externalId);
      if (!product) {
        throw new CartProductNotFoundError(externalId);
      }
      return product;
    });

    const stocks = await this.inventoryRepository.stocksFor(externalIds);

    return products.map((product) => {
      const quantity = cart[product.externalId];
      const stock = stocks.get(product.externalId) ?? 0;

      return {
        externalId: product.externalId,
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
