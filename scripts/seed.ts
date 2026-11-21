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
  return [value.street, value.number, value.city, value.zipcode]
    .every((part) => part !== undefined && part !== null && String(part).length > 0)
    ? `${value.street}, ${value.number}, ${value.city}, ${value.zipcode}`
    : (() => {
        throw new Error("Invalid FakeStoreAPI address");
      })();
}

export function validateSeedArray(kind: "products" | "users", value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid FakeStoreAPI ${kind} response`);
  }

  if (kind === "products") {
    for (const product of value) {
      if (
        !product ||
        typeof product !== "object" ||
        typeof product.id !== "number" ||
        typeof product.title !== "string" ||
        typeof product.price !== "number" ||
        typeof product.description !== "string" ||
        typeof product.category !== "string" ||
        typeof product.image !== "string" ||
        !product.rating ||
        typeof product.rating.rate !== "number" ||
        typeof product.rating.count !== "number"
      ) {
        throw new Error("Invalid FakeStoreAPI products response");
      }
    }
  } else {
    for (const user of value) {
      if (
        !user ||
        typeof user !== "object" ||
        !user.name ||
        typeof user.name.firstname !== "string" ||
        typeof user.name.lastname !== "string" ||
        typeof user.email !== "string" ||
        !user.address
      ) {
        throw new Error("Invalid FakeStoreAPI users response");
      }
      formatAddress(user.address);
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
