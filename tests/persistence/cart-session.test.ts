import assert from "node:assert/strict";
import test from "node:test";
import type Redis from "ioredis";
import { CartAndSessionRepository } from "../../src/lib/repositories/cart-session";

function redisFake(initialHashes: Record<string, Record<string, string>> = {}) {
  const hashes = new Map(
    Object.entries(initialHashes).map(([key, value]) => [key, { ...value }]),
  );
  const strings = new Map<string, string>();
  const calls: Array<{ command: string; args: unknown[] }> = [];

  const client = {
    async hgetall(key: string) {
      calls.push({ command: "hgetall", args: [key] });
      return { ...(hashes.get(key) ?? {}) };
    },
    async hincrby(key: string, field: string, increment: number) {
      calls.push({ command: "hincrby", args: [key, field, increment] });
      const hash = hashes.get(key) ?? {};
      const quantity = Number(hash[field] ?? "0") + increment;
      hash[field] = String(quantity);
      hashes.set(key, hash);
      return quantity;
    },
    async hdel(key: string, field: string) {
      calls.push({ command: "hdel", args: [key, field] });
      const hash = hashes.get(key);
      const existed = hash && field in hash ? 1 : 0;
      if (hash) {
        delete hash[field];
      }
      return existed;
    },
    async expire(key: string, seconds: number) {
      calls.push({ command: "expire", args: [key, seconds] });
      return hashes.has(key) || strings.has(key) ? 1 : 0;
    },
    async del(key: string) {
      calls.push({ command: "del", args: [key] });
      const existed = hashes.delete(key) || strings.delete(key);
      return existed ? 1 : 0;
    },
    async set(key: string, value: string, mode: string, seconds: number) {
      calls.push({ command: "set", args: [key, value, mode, seconds] });
      strings.set(key, value);
      return "OK";
    },
    async get(key: string) {
      calls.push({ command: "get", args: [key] });
      return strings.get(key) ?? null;
    },
  };

  return {
    calls,
    hashes,
    strings,
    client: client as unknown as Redis,
  };
}

test("cart converts stored values and discards invalid entries", async () => {
  const fake = redisFake({
    "cart:3": {
      "1": "2",
      "0": "4",
      "not-an-id": "1",
      "4": "0",
      "5": "-1",
      "6": "1.5",
      "7.2": "3",
    },
  });
  const repository = new CartAndSessionRepository(fake.client);

  assert.deepEqual(await repository.getCart(3), { 1: 2 });
  assert.deepEqual(fake.calls, [{ command: "hgetall", args: ["cart:3"] }]);
});

test("cart increments, decrements and renews its TTL on item writes", async () => {
  const fake = redisFake({ "cart:3": { "7": "2" } });
  const repository = new CartAndSessionRepository(fake.client);

  assert.equal(await repository.addItem(3, 7), 3);
  assert.equal(await repository.addItem(3, 7, -3), 0);
  assert.equal(fake.hashes.get("cart:3")?.["7"], undefined);
  assert.deepEqual(fake.calls, [
    { command: "hincrby", args: ["cart:3", "7", 1] },
    { command: "expire", args: ["cart:3", 86_400] },
    { command: "hincrby", args: ["cart:3", "7", -3] },
    { command: "hdel", args: ["cart:3", "7"] },
    { command: "expire", args: ["cart:3", 86_400] },
  ]);
});

test("cart removes individual items with TTL renewal", async () => {
  const fake = redisFake({ "cart:9": { "2": "1", "3": "1" } });
  const repository = new CartAndSessionRepository(fake.client);

  await repository.removeItem(9, 2);

  assert.deepEqual(fake.hashes.get("cart:9"), { "3": "1" });
  assert.deepEqual(fake.calls, [
    { command: "hdel", args: ["cart:9", "2"] },
    { command: "expire", args: ["cart:9", 86_400] },
  ]);
});

test("clearing a cart never touches session keys", async () => {
  const fake = redisFake({ "cart:5": { "8": "2" } });
  fake.strings.set("session:keep-me", "payload");
  const repository = new CartAndSessionRepository(fake.client);

  await repository.clearCart(5);

  assert.equal(fake.hashes.has("cart:5"), false);
  assert.equal(fake.strings.get("session:keep-me"), "payload");
  assert.deepEqual(fake.calls, [{ command: "del", args: ["cart:5"] }]);
});

test("sessions use opaque tokens, JSON and a two-hour TTL", async () => {
  const fake = redisFake();
  const repository = new CartAndSessionRepository(fake.client);
  const session = { userId: 4, name: "Ana", email: "ana@example.test" };

  const token = await repository.createSession(session);

  assert.match(token, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.deepEqual(fake.calls[0], {
    command: "set",
    args: [`session:${token}`, JSON.stringify(session), "EX", 7_200],
  });
  assert.deepEqual(await repository.getSession(token), session);

  await repository.deleteSession(token);
  assert.equal(await repository.getSession(token), null);
});

test("missing or malformed sessions are treated as expired", async () => {
  const fake = redisFake();
  fake.strings.set("session:bad-json", "{");
  fake.strings.set("session:bad-shape", JSON.stringify({ userId: "1" }));
  const repository = new CartAndSessionRepository(fake.client);

  assert.equal(await repository.getSession("missing"), null);
  assert.equal(await repository.getSession("bad-json"), null);
  assert.equal(await repository.getSession("bad-shape"), null);
});
