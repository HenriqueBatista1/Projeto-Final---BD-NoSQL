import assert from "node:assert/strict";
import test from "node:test";
import { suggestProductsAction } from "../../app/actions/catalog";

test("short suggestion queries return an empty successful result", async () => {
  assert.deepEqual(await suggestProductsAction(" x "), {
    success: true,
    data: [],
  });
});
