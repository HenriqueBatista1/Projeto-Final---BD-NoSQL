import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import test from "node:test";
import type { Pool } from "pg";
import {
  closeLiveConnections,
  connectLivePostgres,
  hasInventoryIdCollision,
  liveTestsEnabled,
  trackLiveWriteAttempt,
} from "./live-helpers";

const LIVE_TEST_ENABLED = liveTestsEnabled();
const LIVE_TEST_TIMEOUT_MS = 30_000;

async function allocateUnusedExternalId(database: Pool): Promise<number> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const externalId = randomInt(1, 2_147_483_647);
    if (!(await hasInventoryIdCollision(database, externalId))) {
      return externalId;
    }
  }
  throw new Error("Could not allocate a unique inventory audit test ID");
}

async function removeInventoryFixture(
  database: Pool,
  externalId: number,
): Promise<void> {
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "DELETE FROM inventory_logs WHERE external_product_id = $1",
      [externalId],
    );
    await client.query(
      "DELETE FROM inventory WHERE external_product_id = $1",
      [externalId],
    );
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Inventory audit fixture cleanup and rollback both failed",
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

test(
  "live inventory insert and update create exact audit records",
  { skip: !LIVE_TEST_ENABLED, timeout: LIVE_TEST_TIMEOUT_MS },
  async () => {
    let database: Pool | undefined;
    let externalId: number | undefined;
    let inventoryInsertAttempted = false;
    let failed = false;
    let primaryError: unknown;

    try {
      database = await connectLivePostgres();
      const postgresForWrites = database;
      externalId = await allocateUnusedExternalId(database);
      await trackLiveWriteAttempt(
        () => {
          inventoryInsertAttempted = true;
        },
        () =>
          postgresForWrites.query(
            "INSERT INTO inventory (external_product_id, quantity) VALUES ($1, $2)",
            [externalId, 15],
          ),
      );

      await database.query(
        "UPDATE inventory SET quantity = $1 WHERE external_product_id = $2",
        [9, externalId],
      );

      const audit = await database.query<{
        old_quantity: number;
        new_quantity: number;
        change_amount: number;
      }>(
        `SELECT old_quantity, new_quantity, change_amount
         FROM inventory_logs
         WHERE external_product_id = $1
         ORDER BY id ASC`,
        [externalId],
      );
      assert.deepEqual(audit.rows, [
        { old_quantity: 0, new_quantity: 15, change_amount: 15 },
        { old_quantity: 15, new_quantity: 9, change_amount: -6 },
      ]);
    } catch (error) {
      failed = true;
      primaryError = error;
    } finally {
      const cleanupErrors: unknown[] = [];
      if (database && inventoryInsertAttempted && externalId !== undefined) {
        try {
          await removeInventoryFixture(database, externalId);
        } catch (error) {
          cleanupErrors.push(error);
        }
      }

      try {
        await closeLiveConnections({ postgres: database });
      } catch (error) {
        cleanupErrors.push(error);
      }

      const errors = [...(failed ? [primaryError] : []), ...cleanupErrors];
      if (errors.length === 1) {
        throw errors[0];
      }
      if (errors.length > 1) {
        throw new AggregateError(
          errors,
          "Live inventory audit test, fixture cleanup, or pool shutdown failed",
        );
      }
    }
  },
);
