import assert from "node:assert/strict";
import test from "node:test";
import type { Pool, QueryResult, QueryResultRow } from "pg";
import { UserRepository } from "../../src/lib/repositories/users";

type QueryCall = { sql: string; values?: unknown[] };

function normalized(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function result<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return { rows, rowCount: rows.length } as QueryResult<Row>;
}

test("user repository finds internal records by email and active public users by id", async () => {
  const calls: QueryCall[] = [];
  const row = {
    id: 7,
    name: "Ana",
    email: "ana@example.test",
    password_hash: "a".repeat(128),
    address: "Rua A, 1",
    is_active: true,
  };
  const database = {
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql: normalized(sql), values });
      return result([row]);
    },
  } as unknown as Pool;
  const repository = new UserRepository(database);

  assert.deepEqual(await repository.findByEmail("ana@example.test"), {
    id: 7,
    name: "Ana",
    email: "ana@example.test",
    passwordHash: "a".repeat(128),
    address: "Rua A, 1",
    isActive: true,
  });
  assert.deepEqual(await repository.findActiveById(7), {
    id: 7,
    name: "Ana",
    email: "ana@example.test",
  });
  assert.match(calls[0].sql, /WHERE email IN \(\$1::text, lower\(\$1::text\)\)/);
  assert.match(calls[0].sql, /ORDER BY \(email = \$1::text\) DESC LIMIT 1/);
  assert.deepEqual(calls[0].values, ["ana@example.test"]);
  assert.doesNotMatch(calls[1].sql, /password_hash|address/);
  assert.match(calls[1].sql, /WHERE id = \$1 AND is_active = TRUE LIMIT 1/);
  assert.deepEqual(calls[1].values, [7]);
});

test("user creation returns public fields and handles an email conflict", async () => {
  const calls: QueryCall[] = [];
  const user = { id: 7, name: "Ana", email: "ana@example.test" };
  const database = {
    async query(sql: string, values: unknown[]) {
      calls.push({ sql: normalized(sql), values });
      return result(calls.length === 1 ? [{ ...user, password_hash: "private" }] : []);
    },
  } as unknown as Pool;
  const repository = new UserRepository(database);
  const input = { name: user.name, email: user.email, passwordHash: "private" };

  assert.deepEqual(await repository.create(input), user);
  assert.equal(await repository.create(input), null);
  assert.deepEqual(calls[0].values, [user.name, user.email, input.passwordHash]);
  assert.match(
    calls[0].sql,
    /SELECT \$1, \$2::text, \$3 WHERE NOT EXISTS \(SELECT 1 FROM users WHERE lower\(email\) = \$2::text\)/,
  );
  assert.match(calls[0].sql, /ON CONFLICT \(email\) DO NOTHING RETURNING id, name, email$/);
});

test("user repository returns null for missing records", async () => {
  const database = {
    async query() {
      return result([]);
    },
  } as unknown as Pool;
  const repository = new UserRepository(database);

  assert.equal(await repository.findByEmail("missing@example.test"), null);
  assert.equal(await repository.findActiveById(999), null);
});

test("active user listing never selects or exposes password hashes", async () => {
  const calls: QueryCall[] = [];
  const database = {
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql: normalized(sql), values });
      return result([{
        id: 7,
        name: "Ana",
        email: "ana@example.test",
      }]);
    },
  } as unknown as Pool;
  const repository = new UserRepository(database);

  const users = await repository.listActive();

  assert.deepEqual(users, [{
    id: 7,
    name: "Ana",
    email: "ana@example.test",
  }]);
  assert.doesNotMatch(calls[0].sql, /password_hash/);
  assert.match(calls[0].sql, /WHERE is_active = TRUE/);
  assert.match(calls[0].sql, /ORDER BY name ASC, id ASC/);
});
