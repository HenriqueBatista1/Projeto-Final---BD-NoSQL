import assert from "node:assert/strict";
import test from "node:test";

const sessionCookiePath = "../../src/lib/session-cookie";
const sessionCookie = await import(sessionCookiePath).catch(() => null);

test("session cookie is scoped for two hours in development", () => {
  assert.ok(sessionCookie, "session cookie helper should be available");

  assert.deepEqual(sessionCookie.getSessionCookieOptions(false), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7200,
    secure: false,
  });
});

test("session cookie is secure in production", () => {
  assert.ok(sessionCookie, "session cookie helper should be available");

  assert.deepEqual(sessionCookie.getSessionCookieOptions(true), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7200,
    secure: true,
  });
});
