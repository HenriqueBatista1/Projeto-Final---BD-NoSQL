import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("PostgreSQL pool is a conservative global singleton", async () => {
  process.env.POSTGRES_URL = "postgresql://demo:demo@localhost:5432/demo";
  const first = await import("../../src/lib/db/postgres.ts");
  const second = await import("../../src/lib/db/postgres.ts");

  assert.strictEqual(first.pool, second.pool);
  assert.equal(first.pool.options.max, 5);
  assert.deepEqual(first.pool.options.ssl, { rejectUnauthorized: false });
  await first.pool.end();
});

test("PostgreSQL initialization schema is complete and rerunnable", async () => {
  const sql = await readFile("init.sql", "utf8");

  for (const table of ["users", "inventory", "orders", "order_items", "inventory_logs"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  }
  assert.match(sql, /CREATE OR REPLACE FUNCTION fn_audit_inventory_changes/);
  assert.match(sql, /DROP TRIGGER IF EXISTS trg_audit_inventory ON inventory/);
  assert.match(sql, /CREATE TRIGGER trg_audit_inventory/);
});
