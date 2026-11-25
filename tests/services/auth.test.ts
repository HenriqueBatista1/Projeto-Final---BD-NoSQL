import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import test from "node:test";
import type {
  CartAndSessionRepository,
  UserRepository,
} from "../../src/lib/repositories/contracts";
import { AuthenticationError, AuthService } from "../../src/lib/services/auth";
import type { PublicUser, Session, UserRecord } from "../../src/lib/types";

type SessionStore = Pick<
  CartAndSessionRepository,
  "createSession" | "deleteSession" | "getSession"
>;
type UserReader = Pick<
  UserRepository,
  "findActiveById" | "findByEmail" | "listActive"
>;

const PASSWORD_HASH = scryptSync(
  "123456",
  "polyglot-store-demo",
  64,
).toString("hex");

const USER: UserRecord = {
  id: 7,
  name: "Ana",
  email: "ana@example.test",
  passwordHash: PASSWORD_HASH,
  address: "Rua A, 1",
  isActive: true,
};

function authFakes(options: {
  user?: UserRecord | null;
  activeUsers?: PublicUser[];
  storedSession?: Session | null;
} = {}) {
  const calls = {
    emails: [] as string[],
    ids: [] as number[],
    createdSessions: [] as Session[],
    deletedTokens: [] as string[],
    readTokens: [] as string[],
  };
  const user = options.user === undefined ? USER : options.user;
  const users: UserReader = {
    async findByEmail(email) {
      calls.emails.push(email);
      return user;
    },
    async findActiveById(id) {
      calls.ids.push(id);
      if (!user?.isActive) {
        return null;
      }
      return { id: user.id, name: user.name, email: user.email };
    },
    async listActive() {
      return options.activeUsers ?? [];
    },
  };
  const sessions: SessionStore = {
    async createSession(session) {
      calls.createdSessions.push(session);
      return "demo-token";
    },
    async getSession(token) {
      calls.readTokens.push(token);
      return options.storedSession ?? null;
    },
    async deleteSession(token) {
      calls.deletedTokens.push(token);
    },
  };

  return { calls, users, sessions };
}

test("password login creates a hash-free session for active users", async () => {
  const fake = authFakes();
  const service = new AuthService(fake.users, fake.sessions);

  assert.equal(await service.login(" ana@example.test ", "123456"), "demo-token");
  assert.deepEqual(fake.calls.emails, ["ana@example.test"]);
  assert.deepEqual(fake.calls.createdSessions, [{
    userId: 7,
    name: "Ana",
    email: "ana@example.test",
  }]);
  assert.equal("passwordHash" in fake.calls.createdSessions[0], false);
});

test("missing users, wrong passwords and inactive users share a generic error", async () => {
  const invalidCredentials = (error: unknown) =>
    error instanceof AuthenticationError &&
    error.message === "Invalid email or password";
  const missingUser = authFakes({ user: null });
  await assert.rejects(
    new AuthService(missingUser.users, missingUser.sessions).login(
      "missing@example.test",
      "123456",
    ),
    invalidCredentials,
  );
  assert.deepEqual(missingUser.calls.createdSessions, []);

  const wrongPassword = authFakes();
  await assert.rejects(
    new AuthService(wrongPassword.users, wrongPassword.sessions).login(
      "ana@example.test",
      "wrong",
    ),
    invalidCredentials,
  );
  assert.deepEqual(wrongPassword.calls.createdSessions, []);

  const inactive = authFakes({ user: { ...USER, isActive: false } });
  await assert.rejects(
    new AuthService(inactive.users, inactive.sessions).login(
      "ana@example.test",
      "123456",
    ),
    invalidCredentials,
  );
  assert.deepEqual(inactive.calls.createdSessions, []);
});

test("malformed password hashes fail closed without creating sessions", async () => {
  const fake = authFakes({ user: { ...USER, passwordHash: "not-a-hash" } });
  const service = new AuthService(fake.users, fake.sessions);

  await assert.rejects(
    service.login("ana@example.test", "123456"),
    (error: unknown) =>
      error instanceof AuthenticationError &&
      error.message === "Invalid email or password",
  );
  assert.deepEqual(fake.calls.createdSessions, []);
});

test("quick login selects an active user by id", async () => {
  const fake = authFakes();
  const service = new AuthService(fake.users, fake.sessions);

  assert.equal(await service.quickLogin(7), "demo-token");
  assert.deepEqual(fake.calls.ids, [7]);
  assert.deepEqual(fake.calls.createdSessions, [{
    userId: 7,
    name: "Ana",
    email: "ana@example.test",
  }]);
});

test("quick login rejects missing and inactive users", async () => {
  for (const user of [null, { ...USER, isActive: false }]) {
    const fake = authFakes({ user });
    const service = new AuthService(fake.users, fake.sessions);

    await assert.rejects(service.quickLogin(7), AuthenticationError);
    assert.deepEqual(fake.calls.createdSessions, []);
  }
});

test("active user selection never returns password hashes", async () => {
  const publicUser: PublicUser = {
    id: 7,
    name: "Ana",
    email: "ana@example.test",
  };
  const repositoryValue = { ...publicUser, passwordHash: "must-not-leak" };
  const fake = authFakes({ activeUsers: [repositoryValue] });
  const service = new AuthService(fake.users, fake.sessions);

  const users = await service.listActiveUsers();

  assert.deepEqual(users, [publicUser]);
  assert.equal("passwordHash" in users[0], false);
});

test("session reads and logout delegate to the session repository", async () => {
  const session: Session = {
    userId: 7,
    name: "Ana",
    email: "ana@example.test",
  };
  const existing = authFakes({ storedSession: session });
  const existingService = new AuthService(existing.users, existing.sessions);
  assert.deepEqual(await existingService.getSession("known"), session);
  await existingService.logout("known");
  assert.deepEqual(existing.calls.readTokens, ["known"]);
  assert.deepEqual(existing.calls.deletedTokens, ["known"]);

  const missing = authFakes({ storedSession: null });
  assert.equal(
    await new AuthService(missing.users, missing.sessions).getSession("missing"),
    null,
  );
});
