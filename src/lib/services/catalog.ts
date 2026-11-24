import type {
  CatalogRepository as CatalogRepositoryContract,
  OrderAndInventoryRepository as OrderAndInventoryRepositoryContract,
} from "../repositories/contracts";
import { CatalogRepository } from "../repositories/catalog";
import { OrderAndInventoryRepository } from "../repositories/orders-inventory";
import type {
  Product,
  ProductRecord,
  SuggestedProduct,
} from "../types";

export class CatalogService {
  constructor(
    private readonly catalogRepository: CatalogRepositoryContract =
      new CatalogRepository(),
    private readonly inventoryRepository: OrderAndInventoryRepositoryContract =
      new OrderAndInventoryRepository(),
  ) {}

  async list(category?: string): Promise<Product[]> {
    const products = await this.catalogRepository.list(category);
    return this.withStock(products);
  }

  async findByExternalId(externalId: number): Promise<Product | null> {
    const product =
      await this.catalogRepository.findByExternalId(externalId);
    if (!product) {
      return null;
    }

    const [enrichedProduct] = await this.withStock([product]);
    return enrichedProduct ?? null;
  }

  async listCategories(): Promise<string[]> {
    return this.catalogRepository.listCategories();
  }

  async suggest(query: string): Promise<SuggestedProduct[]> {
    return this.catalogRepository.suggest(query);
  }

  private async withStock(products: ProductRecord[]): Promise<Product[]> {
    if (products.length === 0) {
      return [];
    }

    const externalIds = products.map(({ externalId }) => externalId);
    const stocks = await this.inventoryRepository.stocksFor(externalIds);

    return products.map((product) => ({
      ...product,
      stock: stocks.get(product.externalId) ?? 0,
    }));
  }
}
