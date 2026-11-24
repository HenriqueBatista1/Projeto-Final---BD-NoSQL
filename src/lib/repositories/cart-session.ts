import { randomUUID } from "node:crypto";
import type Redis from "ioredis";
import type { CartAndSessionRepository as CartAndSessionRepositoryContract } from "./contracts";
import type { Session } from "../types";

const CART_TTL_SECONDS = 86_400;
const SESSION_TTL_SECONDS = 7_200;

function cartKey(userId: number): string {
  return `cart:${userId}`;
}

function sessionKey(token: string): string {
  return `session:${token}`;
}

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.userId === "number" &&
    Number.isInteger(candidate.userId) &&
    candidate.userId > 0 &&
    typeof candidate.name === "string" &&
    typeof candidate.email === "string"
  );
}

export class CartAndSessionRepository implements CartAndSessionRepositoryContract {
  constructor(private readonly client?: Redis) {}

  private async redis(): Promise<Redis> {
    return this.client ?? (await import("../db/redis")).redis;
  }

  async getCart(userId: number): Promise<Record<number, number>> {
    const client = await this.redis();
    const storedItems = await client.hgetall(cartKey(userId));
    const cart: Record<number, number> = {};

    for (const [storedExternalId, storedQuantity] of Object.entries(storedItems)) {
      const externalId = Number(storedExternalId);
      const quantity = Number(storedQuantity);
      if (
        Number.isInteger(externalId) &&
        externalId > 0 &&
        Number.isInteger(quantity) &&
        quantity > 0
      ) {
        cart[externalId] = quantity;
      }
    }

    return cart;
  }

  async addItem(
    userId: number,
    externalId: number,
    quantity = 1,
  ): Promise<number> {
    const client = await this.redis();
    const key = cartKey(userId);
    const updatedQuantity = await client.hincrby(key, String(externalId), quantity);

    if (updatedQuantity <= 0) {
      await client.hdel(key, String(externalId));
    }
    await client.expire(key, CART_TTL_SECONDS);

    return Math.max(updatedQuantity, 0);
  }

  async removeItem(userId: number, externalId: number): Promise<void> {
    const client = await this.redis();
    const key = cartKey(userId);
    await client.hdel(key, String(externalId));
    await client.expire(key, CART_TTL_SECONDS);
  }

  async clearCart(userId: number): Promise<void> {
    const client = await this.redis();
    await client.del(cartKey(userId));
  }

  async createSession(session: Session): Promise<string> {
    const client = await this.redis();
    const token = randomUUID();
    await client.set(
      sessionKey(token),
      JSON.stringify(session),
      "EX",
      SESSION_TTL_SECONDS,
    );
    return token;
  }

  async getSession(token: string): Promise<Session | null> {
    const client = await this.redis();
    const storedSession = await client.get(sessionKey(token));
    if (storedSession === null) {
      return null;
    }

    try {
      const session: unknown = JSON.parse(storedSession);
      return isSession(session) ? session : null;
    } catch {
      return null;
    }
  }

  async deleteSession(token: string): Promise<void> {
    const client = await this.redis();
    await client.del(sessionKey(token));
  }
}
