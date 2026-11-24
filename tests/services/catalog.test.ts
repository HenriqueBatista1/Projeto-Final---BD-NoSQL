import assert from "node:assert/strict";
import test from "node:test";
import type {
  CatalogRepository,
  OrderAndInventoryRepository,
} from "../../src/lib/repositories/contracts";
import type { ProductRecord, SuggestedProduct } from "../../src/lib/types";
import { CatalogService } from "../../src/lib/services/catalog";

const RING: ProductRecord = {
  externalId: 7,
  title: "Silver Ring",
  price: 19.99,
  description: "A polished ring",
  category: "jewelery",
  image: "https://example.test/ring.png",
  rating: { rate: 4.2, count: 18 },
};

const BOOK: ProductRecord = {
  externalId: 11,
  title: "Everyday Backpack",
  price: 39.99,
  description: "A practical backpack",
  category: "men's clothing",
  image: "https://example.test/backpack.png",
  rating: { rate: 4.5, count: 25 },
};

type CatalogFakesOptions = {
  products?: ProductRecord[];
  detail?: ProductRecord | null;
  categories?: string[];
  suggestions?: SuggestedProduct[];
  stocks?: Map<number, number>;
};

function catalogFakes(options: CatalogFakesOptions = {}) {
  const calls = {
    list: [] as Array<string | undefined>,
    details: [] as number[],
    categories: 0,
    suggestions: [] as string[],
    stockRequests: [] as number[][],
  };

  const catalogRepository: CatalogRepository = {
    async list(category) {
      calls.list.push(category);
      return options.products ?? [];
    },
    async findByExternalIds() {
      return [];
    },
    async findByExternalId(externalId) {
      calls.details.push(externalId);
      return options.detail === undefined ? RING : options.detail;
    },
    async listCategories() {
      calls.categories += 1;
      return options.categories ?? [];
    },
    async suggest(query) {
      calls.suggestions.push(query);
      return options.suggestions ?? [];
    },
  };

  const inventoryRepository: OrderAndInventoryRepository = {
    async stocksFor(ids) {
      calls.stockRequests.push([...ids]);
      return options.stocks ?? new Map();
    },
    async placeOrder() {
      throw new Error("placeOrder should not be called by CatalogService");
    },
    async history() {
      throw new Error("history should not be called by CatalogService");
    },
  };

  return {
    calls,
    service: new CatalogService(catalogRepository, inventoryRepository),
  };
}

test("catalog list enriches products with one batched stock lookup", async () => {
  const fake = catalogFakes({
    products: [RING, BOOK],
    stocks: new Map([
      [7, 4],
      [11, 9],
    ]),
  });

  const products = await fake.service.list("jewelery");

  assert.deepEqual(fake.calls.list, ["jewelery"]);
  assert.deepEqual(fake.calls.stockRequests, [[7, 11]]);
  assert.deepEqual(products, [
    { ...RING, stock: 4 },
    { ...BOOK, stock: 9 },
  ]);
});

test("catalog list uses zero when a product is absent from the stock map", async () => {
  const fake = catalogFakes({
    products: [RING, BOOK],
    stocks: new Map([[7, 4]]),
  });

  const products = await fake.service.list();

  assert.deepEqual(
    products.map(({ externalId, stock }) => ({ externalId, stock })),
    [
      { externalId: 7, stock: 4 },
      { externalId: 11, stock: 0 },
    ],
  );
});

test("empty catalog list skips the stock lookup", async () => {
  const fake = catalogFakes({ products: [] });

  assert.deepEqual(await fake.service.list(), []);
  assert.deepEqual(fake.calls.list, [undefined]);
  assert.deepEqual(fake.calls.stockRequests, []);
});

test("catalog detail enriches an existing product and skips stock for a miss", async () => {
  const existing = catalogFakes({
    detail: BOOK,
    stocks: new Map([[11, 6]]),
  });
  const missing = catalogFakes({ detail: null });

  assert.deepEqual(await existing.service.findByExternalId(11), {
    ...BOOK,
    stock: 6,
  });
  assert.deepEqual(existing.calls.details, [11]);
  assert.deepEqual(existing.calls.stockRequests, [[11]]);

  assert.equal(await missing.service.findByExternalId(999), null);
  assert.deepEqual(missing.calls.details, [999]);
  assert.deepEqual(missing.calls.stockRequests, []);
});

test("catalog categories are delegated to the repository", async () => {
  const fake = catalogFakes({ categories: ["electronics", "jewelery"] });

  assert.deepEqual(await fake.service.listCategories(), [
    "electronics",
    "jewelery",
  ]);
  assert.equal(fake.calls.categories, 1);
});

test("catalog suggestions are delegated without changing the query", async () => {
  const suggestions: SuggestedProduct[] = [
    {
      externalId: 7,
      title: RING.title,
      price: RING.price,
      image: RING.image,
    },
  ];
  const fake = catalogFakes({ suggestions });

  assert.deepEqual(await fake.service.suggest(" ring "), suggestions);
  assert.deepEqual(fake.calls.suggestions, [" ring "]);
});
