import type { Pool } from "pg";
import type { UserRepository as UserRepositoryContract } from "./contracts";
import type { PublicUser, UserRecord } from "../types";

type UserRow = {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  address: string | null;
  is_active: boolean;
};

type PublicUserRow = Pick<UserRow, "id" | "name" | "email">;

function toUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    address: row.address,
    isActive: row.is_active,
  };
}

function toPublicUser(row: PublicUserRow): PublicUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
  };
}

export class UserRepository implements UserRepositoryContract {
  constructor(private readonly client?: Pool) {}

  private async database(): Promise<Pool> {
    return this.client ?? (await import("../db/postgres")).pool;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const database = await this.database();
    const result = await database.query<UserRow>(
      `SELECT id, name, email, password_hash, address, is_active
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email],
    );
    const user = result.rows[0];
    return user ? toUser(user) : null;
  }

  async findActiveById(id: number): Promise<PublicUser | null> {
    const database = await this.database();
    const result = await database.query<PublicUserRow>(
      `SELECT id, name, email
       FROM users
       WHERE id = $1 AND is_active = TRUE
       LIMIT 1`,
      [id],
    );
    const user = result.rows[0];
    return user ? toPublicUser(user) : null;
  }

  async listActive(): Promise<PublicUser[]> {
    const database = await this.database();
    const result = await database.query<PublicUserRow>(
      `SELECT id, name, email
       FROM users
       WHERE is_active = TRUE
       ORDER BY name ASC, id ASC`,
    );
    return result.rows.map(toPublicUser);
  }
}
