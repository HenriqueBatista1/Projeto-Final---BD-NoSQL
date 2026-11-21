import Redis from "ioredis";

declare global {
  var __redisClient: Redis | undefined;
}

const url = process.env.REDIS_URL;

if (!url) {
  throw new Error("REDIS_URL is required");
}

export const redis =
  globalThis.__redisClient ??
  (globalThis.__redisClient = new Redis(url, { lazyConnect: true }));
