import { scryptSync, timingSafeEqual } from "node:crypto";
import type {
  CartAndSessionRepository,
  UserRepository,
} from "../repositories/contracts";
import type { PublicUser, Session, UserRecord } from "../types";

const DEMO_PASSWORD_SALT = "polyglot-store-demo";
const DUMMY_PASSWORD_HASH = "00".repeat(64);

type SessionStore = Pick<
  CartAndSessionRepository,
  "createSession" | "deleteSession" | "getSession"
>;
type UserReader = Pick<
  UserRepository,
  "findActiveById" | "findByEmail" | "listActive"
>;

function sessionFor(user: Pick<UserRecord, "id" | "name" | "email">): Session {
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
  };
}

function matchesDemoPassword(password: string, passwordHash: string): boolean {
  if (!/^[0-9a-f]{128}$/i.test(passwordHash)) {
    return false;
  }

  const expected = Buffer.from(passwordHash, "hex");
  const candidate = scryptSync(password, DEMO_PASSWORD_SALT, expected.length);
  return timingSafeEqual(candidate, expected);
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthService {
  constructor(
    private readonly users: UserReader,
    private readonly sessions: SessionStore,
  ) {}

  async login(email: string, password: string): Promise<string> {
    const user = await this.users.findByEmail(email.trim());
    const passwordMatches = matchesDemoPassword(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (
      !user ||
      !passwordMatches ||
      !user.isActive
    ) {
      throw new AuthenticationError("Invalid email or password");
    }

    return this.sessions.createSession(sessionFor(user));
  }

  async quickLogin(userId: number): Promise<string> {
    const user = await this.users.findActiveById(userId);
    if (!user) {
      throw new AuthenticationError("User is unavailable");
    }

    return this.sessions.createSession(sessionFor(user));
  }

  async listActiveUsers(): Promise<PublicUser[]> {
    const users = await this.users.listActive();
    return users.map(({ id, name, email }) => ({
      id,
      name,
      email,
    }));
  }

  async getSession(token: string): Promise<Session | null> {
    return this.sessions.getSession(token);
  }

  async logout(token: string): Promise<void> {
    await this.sessions.deleteSession(token);
  }
}
