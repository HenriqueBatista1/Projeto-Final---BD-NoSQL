import { MongoClient } from "mongodb";

declare global {
  var __mongoClient: MongoClient | undefined;
}

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB_URI is required");
}

export const mongoClient =
  globalThis.__mongoClient ??
  (globalThis.__mongoClient = new MongoClient(uri));
