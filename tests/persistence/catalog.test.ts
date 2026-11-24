import assert from "node:assert/strict";
import test from "node:test";
import type { MongoClient } from "mongodb";
import { CatalogRepository } from "../../src/lib/repositories/catalog";

const PRODUCT = {
  external_id: 7,
  title: "Silver Ring",
  price: 19.99,
  description: "A polished ring",
  category: "jewelery",
  image: "https://example.test/ring.png",
  rating: { rate: 4.2, count: 18 },
};

type FindCall = {
  filter: unknown;
  options: unknown;
  limit?: number;
};

function catalogFake(options: {
  documents?: typeof PRODUCT[];
  findOne?: typeof PRODUCT | null;
  categories?: string[];
} = {}) {
  const calls = {
    databases: [] as string[],
    collections: [] as string[],
    finds: [] as FindCall[],
    findOnes: [] as unknown[],
    distincts: [] as string[],
  };

  const collection = {
    find(filter: unknown, findOptions?: unknown) {
      const call: FindCall = { filter, options: findOptions };
      calls.finds.push(call);
      const cursor = {
        limit(value: number) {
          call.limit = value;
          return cursor;
        },
        async toArray() {
          return options.documents ?? [PRODUCT];
        },
      };
      return cursor;
    },
    async findOne(filter: unknown) {
      calls.findOnes.push(filter);
      return options.findOne === undefined ? PRODUCT : options.findOne;
    },
    async distinct(field: string) {
      calls.distincts.push(field);
      return options.categories ?? ["jewelery"];
    },
  };

  const client = {
    db(name: string) {
      calls.databases.push(name);
      return {
        collection(collectionName: string) {
          calls.collections.push(collectionName);
          return collection;
        },
      };
    },
  };

  return {
    calls,
    client: client as unknown as MongoClient,
  };
}

test("catalog lists products with an optional category filter", async () => {
  const fake = catalogFake();
  const repository = new CatalogRepository(fake.client);

  const products = await repository.list("jewelery");

  assert.deepEqual(fake.calls.databases, ["polyglot_store"]);
  assert.deepEqual(fake.calls.collections, ["products"]);
  assert.deepEqual(fake.calls.finds[0]?.filter, { category: "jewelery" });
  assert.deepEqual(products, [{
    externalId: 7,
    title: "Silver Ring",
    price: 19.99,
    description: "A polished ring",
    category: "jewelery",
    image: "https://example.test/ring.png",
    rating: { rate: 4.2, count: 18 },
  }]);

  await repository.list();
  assert.deepEqual(fake.calls.finds[1]?.filter, {});
});

test("catalog finds products by external identifiers and lists categories", async () => {
  const fake = catalogFake({ categories: ["electronics", "jewelery"] });
  const repository = new CatalogRepository(fake.client);

  const products = await repository.findByExternalIds([7, 11]);
  const product = await repository.findByExternalId(7);
  const categories = await repository.listCategories();

  assert.deepEqual(fake.calls.finds[0]?.filter, {
    external_id: { $in: [7, 11] },
  });
  assert.deepEqual(fake.calls.findOnes, [{ external_id: 7 }]);
  assert.equal(product?.externalId, 7);
  assert.equal(products[0]?.externalId, 7);
  assert.deepEqual(fake.calls.distincts, ["category"]);
  assert.deepEqual(categories, ["electronics", "jewelery"]);
});

test("catalog returns null when an external identifier is absent", async () => {
  const fake = catalogFake({ findOne: null });
  const repository = new CatalogRepository(fake.client);

  assert.equal(await repository.findByExternalId(999), null);
});

test("catalog suggestion skips short input and sanitizes regex searches", async () => {
  const fake = catalogFake();
  const repository = new CatalogRepository(fake.client);

  assert.deepEqual(await repository.suggest(" . "), []);
  assert.equal(fake.calls.finds.length, 0);

  const suggestions = await repository.suggest("  ring.*[x]  ");

  assert.deepEqual(fake.calls.finds[0], {
    filter: {
      title: { $regex: "ring\\.\\*\\[x\\]", $options: "i" },
    },
    options: {
      projection: {
        _id: 0,
        external_id: 1,
        title: 1,
        price: 1,
        image: 1,
      },
    },
    limit: 5,
  });
  assert.deepEqual(suggestions, [{
    externalId: 7,
    title: "Silver Ring",
    price: 19.99,
    image: "https://example.test/ring.png",
  }]);
});
