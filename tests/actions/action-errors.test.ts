import assert from "node:assert/strict";
import test from "node:test";

const actionErrorsPath = "../../src/lib/action-errors";
const actionErrors = await import(actionErrorsPath).catch(() => null);

test("unexpected action errors return only the Portuguese fallback", () => {
  assert.ok(actionErrors, "action error helpers should be available");
  assert.equal(typeof actionErrors.toActionFailure, "function");

  const result = actionErrors.toActionFailure(
    new Error("database detail"),
    "test action",
    "Não foi possível concluir a operação.",
  );

  assert.deepEqual(result, {
    success: false,
    error: "Não foi possível concluir a operação.",
  });
  assert.equal(JSON.stringify(result).includes("database detail"), false);
});

test("cart product errors return a friendly Portuguese failure", async () => {
  assert.ok(actionErrors, "action error helpers should be available");
  assert.equal(typeof actionErrors.toCartActionFailure, "function");

  const cartServicePath = "../../src/lib/services/cart";
  const cartService = await import(cartServicePath);
  const result = actionErrors.toCartActionFailure(
    new cartService.CartProductUnavailableError([9]),
  );

  assert.equal(result.success, false);
  assert.match(result.error, /produto/i);
  assert.equal(result.error.includes("Cart products unavailable"), false);
});
