import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("MongoDB and Redis modules report missing environment variables", () => {
  for (const [modulePath, variable] of [
    ["./src/lib/db/mongodb.ts", "MONGODB_URI"],
    ["./src/lib/db/redis.ts", "REDIS_URL"],
  ] as const) {
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", `delete process.env.${variable}; await import(${JSON.stringify(modulePath)})`],
      { encoding: "utf8" },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(`${variable} is required`));
  }
});

test("MongoDB and Redis are HMR-safe global singletons", async () => {
  process.env.MONGODB_URI = "mongodb://localhost:27017/demo";
  process.env.REDIS_URL = "rediss://default:demo@localhost:6379";

  const mongoFirst = await import("../../src/lib/db/mongodb");
  const mongoSecond = await import("../../src/lib/db/mongodb");
  const redisFirst = await import("../../src/lib/db/redis");
  const redisSecond = await import("../../src/lib/db/redis");

  assert.strictEqual(mongoFirst.mongoClient, mongoSecond.mongoClient);
  assert.strictEqual(redisFirst.redis, redisSecond.redis);
  assert.equal(redisFirst.redis.status, "wait");
  redisFirst.redis.disconnect();
});
