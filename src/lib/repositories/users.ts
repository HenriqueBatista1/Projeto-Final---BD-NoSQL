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

  async create(
    { name, email, passwordHash }: Pick<UserRecord, "name" | "email" | "passwordHash">,
  ): Promise<PublicUser | null> {
    const database = await this.database();
    const result = await database.query<PublicUserRow>(
      `INSERT INTO users (name, email, password_hash)
       SELECT $1, $2::text, $3
       WHERE NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = $2::text)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, name, email`,
      [name, email, passwordHash],
    );
    const user = result.rows[0];
    return user ? toPublicUser(user) : null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const database = await this.database();
    const result = await database.query<UserRow>(
      `SELECT id, name, email, password_hash, address, is_active
       FROM users
       WHERE email IN ($1::text, lower($1::text))
       ORDER BY (email = $1::text) DESC
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
