import type { Collection, MongoClient } from "mongodb";
import type { CatalogRepository as CatalogRepositoryContract } from "./contracts";
import type { ProductRecord, SuggestedProduct } from "../types";

type ProductDocument = {
  external_id: number;
  title: string;
  price: number;
  description: string;
  category: string;
  image: string;
  rating: { rate: number; count: number };
};

type SuggestedProductDocument = Pick<
  ProductDocument,
  "external_id" | "title" | "price" | "image"
>;

function toProduct(document: ProductDocument): ProductRecord {
  return {
    externalId: document.external_id,
    title: document.title,
    price: document.price,
    description: document.description,
    category: document.category,
    image: document.image,
    rating: document.rating,
  };
}

function toSuggestion(document: SuggestedProductDocument): SuggestedProduct {
  return {
    externalId: document.external_id,
    title: document.title,
    price: document.price,
    image: document.image,
  };
}

export class CatalogRepository implements CatalogRepositoryContract {
  constructor(private readonly client?: MongoClient) {}

  private async products(): Promise<Collection<ProductDocument>> {
    const client = this.client ?? (await import("../db/mongodb")).mongoClient;
    return client.db("polyglot_store").collection<ProductDocument>("products");
  }

  async list(category?: string): Promise<ProductRecord[]> {
    const collection = await this.products();
    const documents = await collection.find(category ? { category } : {}).toArray();
    return documents.map(toProduct);
  }

  async findByExternalIds(ids: number[]): Promise<ProductRecord[]> {
    const collection = await this.products();
    const documents = await collection
      .find({ external_id: { $in: ids } })
      .toArray();
    return documents.map(toProduct);
  }

  async findByExternalId(id: number): Promise<ProductRecord | null> {
    const collection = await this.products();
    const document = await collection.findOne({ external_id: id });
    return document ? toProduct(document) : null;
  }

  async listCategories(): Promise<string[]> {
    const collection = await this.products();
    return collection.distinct("category");
  }

  async suggest(query: string): Promise<SuggestedProduct[]> {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      return [];
    }

    const safeQuery = trimmedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const collection = await this.products();
    const documents = await collection
      .find(
        { title: { $regex: safeQuery, $options: "i" } },
        {
          projection: {
            _id: 0,
            external_id: 1,
            title: 1,
            price: 1,
            image: 1,
          },
        },
      )
      .limit(5)
      .toArray() as unknown as SuggestedProductDocument[];

    return documents.map(toSuggestion);
  }
}
