import { scryptSync } from "node:crypto";
import { pathToFileURL } from "node:url";
import { mongoClient } from "../src/lib/db/mongodb";
import { pool } from "../src/lib/db/postgres";

type FakeStoreProduct = {
  id: number;
  title: string;
  price: number;
  description: string;
  category: string;
  image: string;
  rating: { rate: number; count: number };
};

type FakeStoreUser = {
  name: { firstname: string; lastname: string };
  email: string;
  address: { street: string; number: number; city: string; zipcode: string };
};

export function inventoryQuantity(externalId: number): number {
  return 10 + (externalId % 41);
}

export function hashDemoPassword(password: string): string {
  return scryptSync(password, "polyglot-store-demo", 64).toString("hex");
}

export function formatAddress(address: unknown): string {
  if (!address || typeof address !== "object") {
    throw new Error("Invalid FakeStoreAPI address");
  }
  const value = address as Record<string, unknown>;
  if (
    typeof value.street !== "string" ||
    value.street.trim().length === 0 ||
    (typeof value.number !== "number" && typeof value.number !== "string") ||
    String(value.number).trim().length === 0 ||
    typeof value.city !== "string" ||
    value.city.trim().length === 0 ||
    typeof value.zipcode !== "string" ||
    value.zipcode.trim().length === 0
  ) {
    throw new Error("Invalid FakeStoreAPI address");
  }
  return `${value.street.trim()}, ${String(value.number).trim()}, ${value.city.trim()}, ${value.zipcode.trim()}`;
}

export function validateSeedArray(kind: "products" | "users", value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid FakeStoreAPI ${kind} response`);
  }

  if (kind === "products") {
    for (const product of value) {
      const candidate = product as Record<string, unknown>;
      const rating =
        candidate.rating && typeof candidate.rating === "object"
          ? candidate.rating as Record<string, unknown>
          : undefined;
      if (
        !product ||
        typeof product !== "object" ||
        typeof candidate.id !== "number" ||
        !Number.isInteger(candidate.id) ||
        candidate.id <= 0 ||
        typeof candidate.title !== "string" ||
        candidate.title.trim().length === 0 ||
        typeof candidate.price !== "number" ||
        !Number.isFinite(candidate.price) ||
        candidate.price < 0 ||
        typeof candidate.description !== "string" ||
        candidate.description.trim().length === 0 ||
        typeof candidate.category !== "string" ||
        candidate.category.trim().length === 0 ||
        typeof candidate.image !== "string" ||
        candidate.image.trim().length === 0 ||
        !rating ||
        typeof rating.rate !== "number" ||
        !Number.isFinite(rating.rate) ||
        rating.rate < 0 ||
        rating.rate > 5 ||
        typeof rating.count !== "number" ||
        !Number.isInteger(rating.count) ||
        rating.count < 0
      ) {
        throw new Error("Invalid FakeStoreAPI products response");
      }
    }
  } else {
    for (const user of value) {
      const candidate = user as Record<string, unknown>;
      const name =
        candidate.name && typeof candidate.name === "object"
          ? candidate.name as Record<string, unknown>
          : undefined;
      if (
        !user ||
        typeof user !== "object" ||
        !name ||
        typeof name.firstname !== "string" ||
        name.firstname.trim().length === 0 ||
        typeof name.lastname !== "string" ||
        name.lastname.trim().length === 0 ||
        typeof candidate.email !== "string" ||
        candidate.email.trim().length === 0 ||
        !candidate.address
      ) {
        throw new Error("Invalid FakeStoreAPI users response");
      }
      formatAddress(candidate.address);
    }
  }

  return value;
}

async function fetchSeedArray(kind: "products" | "users"): Promise<unknown[]> {
  const response = await fetch(`https://fakestoreapi.com/${kind}`);
  if (!response.ok) {
    throw new Error(`FakeStoreAPI ${kind} request failed: ${response.status}`);
  }
  return validateSeedArray(kind, await response.json()) as unknown[];
}

export async function seed(): Promise<void> {
  try {
    const [products, users] = await Promise.all([
      fetchSeedArray("products"),
      fetchSeedArray("users"),
    ]);

    await mongoClient.connect();
    const productsCollection = mongoClient.db("polyglot_store").collection("products");

    await productsCollection.bulkWrite(
      (products as FakeStoreProduct[]).map((product) => ({
        updateOne: {
          filter: { external_id: product.id },
          update: {
            $set: {
              external_id: product.id,
              title: product.title,
              price: product.price,
              description: product.description,
              category: product.category,
              image: product.image,
              rating: product.rating,
            },
          },
          upsert: true,
        },
      })),
    );

    await productsCollection.createIndex({ external_id: 1 }, { unique: true });
    await productsCollection.createIndex({ category: 1 });
    await productsCollection.createIndex(
      { title: "text", description: "text", category: "text" },
    );

    for (const product of products as FakeStoreProduct[]) {
      await pool.query(
        "INSERT INTO inventory (external_product_id, quantity) VALUES ($1, $2) ON CONFLICT (external_product_id) DO NOTHING",
        [product.id, inventoryQuantity(product.id)],
      );
    }

    const passwordHash = hashDemoPassword("123456");
    for (const user of users as FakeStoreUser[]) {
      await pool.query(
        "INSERT INTO users (name, email, password_hash, address) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING",
        [
          `${user.name.firstname} ${user.name.lastname}`,
          user.email,
          passwordHash,
          formatAddress(user.address),
        ],
      );
    }
  } finally {
    await mongoClient.close();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
