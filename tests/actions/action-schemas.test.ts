import assert from "node:assert/strict";
import test from "node:test";

const actionSchemasPath = "../../src/lib/action-schemas";
const actionSchemas = await import(actionSchemasPath).catch(() => null);

test("suggestions trim input and reject queries shorter than two characters", () => {
  assert.ok(actionSchemas, "action schemas should be available");

  assert.deepEqual(
    actionSchemas.suggestProductsSchema.safeParse(" ab "),
    { success: true, data: "ab" },
  );
  assert.equal(actionSchemas.suggestProductsSchema.safeParse(" a ").success, false);
});

test("cart schemas reject invalid IDs and zero or fractional quantities", () => {
  assert.ok(actionSchemas, "action schemas should be available");

  assert.equal(
    actionSchemas.updateCartSchema.safeParse({ externalId: 0, quantity: 1 }).success,
    false,
  );
  assert.equal(
    actionSchemas.updateCartSchema.safeParse({ externalId: 3, quantity: 0 }).success,
    false,
  );
  assert.equal(
    actionSchemas.updateCartSchema.safeParse({ externalId: 3, quantity: 1.5 }).success,
    false,
  );
  assert.equal(actionSchemas.removeCartSchema.safeParse({ externalId: -1 }).success, false);
});

test("login and checkout schemas reject invalid form values", () => {
  assert.ok(actionSchemas, "action schemas should be available");

  assert.equal(
    actionSchemas.loginSchema.safeParse({ email: "not-an-email", password: "x" }).success,
    false,
  );
  assert.equal(
    actionSchemas.checkoutSchema.safeParse({
      deliveryAddress: "Rua A",
      paymentMethod: "BOLETO",
    }).success,
    false,
  );
});
