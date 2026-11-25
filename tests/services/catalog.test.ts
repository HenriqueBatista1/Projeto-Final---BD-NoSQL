import assert from "node:assert/strict";
import test from "node:test";
import type {
  CatalogRepository,
  OrderAndInventoryRepository,
} from "../../src/lib/repositories/contracts";
import { CatalogService } from "../../src/lib/services/catalog";
import type { ProductRecord, SuggestedProduct } from "../../src/lib/types";

const PRODUCTS: ProductRecord[] = [
  {
    externalId: 9,
    title: "Nine",
    price: 12.5,
    description: "Product nine",
    category: "test",
    image: "https://example.test/nine.png",
    rating: { rate: 4.5, count: 20 },
  },
  {
    externalId: 3,
    title: "Three",
    price: 4,
    description: "Product three",
    category: "test",
    image: "https://example.test/three.png",
    rating: { rate: 4, count: 10 },
  },
];

function catalogFake(products = PRODUCTS) {
  const calls = {
    lists: [] as Array<string | undefined>,
    details: [] as number[],
    categories: 0,
    suggestions: [] as string[],
  };
  const suggestions: SuggestedProduct[] = [{
    externalId: 9,
    title: "Nine",
    price: 12.5,
    image: "https://example.test/nine.png",
  }];

  const repository: CatalogRepository = {
    async list(category?: string) {
      calls.lists.push(category);
      return products;
    },
    async findByExternalIds(ids: number[]) {
      return products.filter((product) => ids.includes(product.externalId));
    },
    async findByExternalId(id: number) {
      calls.details.push(id);
      return products.find((product) => product.externalId === id) ?? null;
    },
    async listCategories() {
      calls.categories += 1;
      return ["test"];
    },
    async suggest(query: string) {
      calls.suggestions.push(query);
      return suggestions;
    },
  };

  return { calls, repository, suggestions };
}

function inventoryFake(stocks: Map<number, number>) {
  const calls: number[][] = [];
  const repository: Pick<OrderAndInventoryRepository, "stocksFor"> = {
    async stocksFor(ids: number[]) {
      calls.push(ids);
      return stocks;
    },
  };

  return { calls, repository };
}

test("catalog service hydrates products with one stock lookup and preserves order", async () => {
  const catalog = catalogFake();
  const inventory = inventoryFake(new Map([[9, 7]]));
  const service = new CatalogService(catalog.repository, inventory.repository);

  const products = await service.list("test");

  assert.deepEqual(catalog.calls.lists, ["test"]);
  assert.deepEqual(inventory.calls, [[9, 3]]);
  assert.deepEqual(products.map(({ externalId, stock }) => ({ externalId, stock })), [
    { externalId: 9, stock: 7 },
    { externalId: 3, stock: 0 },
  ]);
});

test("catalog service avoids inventory reads for an empty catalog", async () => {
  const catalog = catalogFake([]);
  const inventory = inventoryFake(new Map());
  const service = new CatalogService(catalog.repository, inventory.repository);

  assert.deepEqual(await service.list(), []);
  assert.deepEqual(inventory.calls, []);
});

test("catalog service hydrates product details and preserves missing products", async () => {
  const catalog = catalogFake();
  const inventory = inventoryFake(new Map([[3, 6]]));
  const service = new CatalogService(catalog.repository, inventory.repository);

  assert.deepEqual(await service.findByExternalId(3), {
    ...PRODUCTS[1],
    stock: 6,
  });
  assert.equal(await service.findByExternalId(404), null);
  assert.deepEqual(catalog.calls.details, [3, 404]);
  assert.deepEqual(inventory.calls, [[3]]);
});

test("catalog service delegates categories and suggestions", async () => {
  const catalog = catalogFake();
  const inventory = inventoryFake(new Map());
  const service = new CatalogService(catalog.repository, inventory.repository);

  assert.deepEqual(await service.listCategories(), ["test"]);
  assert.deepEqual(await service.suggest(" ni "), catalog.suggestions);
  assert.equal(catalog.calls.categories, 1);
  assert.deepEqual(catalog.calls.suggestions, [" ni "]);
  assert.deepEqual(inventory.calls, []);
});
