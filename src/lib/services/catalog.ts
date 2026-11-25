import type {
  CatalogRepository,
  OrderAndInventoryRepository,
} from "../repositories/contracts";
import type { Product, ProductRecord, SuggestedProduct } from "../types";

export class CatalogService {
  constructor(
    private readonly catalog: CatalogRepository,
    private readonly inventory: Pick<OrderAndInventoryRepository, "stocksFor">,
  ) {}

  private async hydrateStock(products: ProductRecord[]): Promise<Product[]> {
    if (products.length === 0) {
      return [];
    }

    const stocks = await this.inventory.stocksFor(
      products.map((product) => product.externalId),
    );

    return products.map((product) => ({
      ...product,
      stock: stocks.get(product.externalId) ?? 0,
    }));
  }

  async list(category?: string): Promise<Product[]> {
    return this.hydrateStock(await this.catalog.list(category));
  }

  async findByExternalId(id: number): Promise<Product | null> {
    const product = await this.catalog.findByExternalId(id);
    if (!product) {
      return null;
    }

    const [hydratedProduct] = await this.hydrateStock([product]);
    return hydratedProduct;
  }

  async listCategories(): Promise<string[]> {
    return this.catalog.listCategories();
  }

  async suggest(query: string): Promise<SuggestedProduct[]> {
    return this.catalog.suggest(query);
  }
}
