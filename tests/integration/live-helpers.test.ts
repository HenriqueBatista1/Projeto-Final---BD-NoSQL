import assert from "node:assert/strict";
import test from "node:test";
import {
  hasInventoryIdCollision,
  liveTestsEnabled,
  requiredEnvironment,
  trackLiveWriteAttempt,
} from "./live-helpers";

test("an audit log row reserves an otherwise unused fixture ID", async () => {
  const statements: Array<{ text: string; values: number[] }> = [];
  const database = {
    async query(
      text: string,
      values: number[],
    ): Promise<{ rows: unknown[] }> {
      statements.push({ text, values });
      return {
        rows: text.includes("inventory_logs") ? [{ external_product_id: 42 }] : [],
      };
    },
  };

  assert.equal(await hasInventoryIdCollision(database, 42), true);
  assert.deepEqual(statements, [
    {
      text: "SELECT 1 FROM inventory WHERE external_product_id = $1",
      values: [42],
    },
    {
      text: "SELECT 1 FROM inventory_logs WHERE external_product_id = $1",
      values: [42],
    },
  ]);
});

test("an ID with no inventory or audit rows is available", async () => {
  const database = {
    async query() {
      return { rows: [] };
    },
  };

  assert.equal(await hasInventoryIdCollision(database, 42), false);
});

test("live tests are enabled only when RUN_LIVE_TESTS is exactly 1", () => {
  const original = process.env.RUN_LIVE_TESTS;

  try {
    for (const value of [undefined, "", "0", "true"]) {
      if (value === undefined) {
        delete process.env.RUN_LIVE_TESTS;
      } else {
        process.env.RUN_LIVE_TESTS = value;
      }
      assert.equal(liveTestsEnabled(), false);
    }

    process.env.RUN_LIVE_TESTS = "1";
    assert.equal(liveTestsEnabled(), true);
  } finally {
    if (original === undefined) {
      delete process.env.RUN_LIVE_TESTS;
    } else {
      process.env.RUN_LIVE_TESTS = original;
    }
  }
});

test("requiredEnvironment names a missing variable", () => {
  const name = "E3_TEST_REQUIRED_MISSING";
  const original = process.env[name];
  delete process.env[name];

  try {
    assert.throws(
      () => requiredEnvironment(name),
      new RegExp(`${name} is required when RUN_LIVE_TESTS=1`),
    );
  } finally {
    if (original !== undefined) {
      process.env[name] = original;
    }
  }
});

test("trackLiveWriteAttempt marks the attempt before a write can reject", async () => {
  let writeAttempted = false;
  const writeError = new Error("write acknowledgement lost");

  await assert.rejects(
    trackLiveWriteAttempt(
      () => {
        writeAttempted = true;
      },
      async () => {
        assert.equal(writeAttempted, true);
        throw writeError;
      },
    ),
    writeError,
  );

  assert.equal(writeAttempted, true);
});
