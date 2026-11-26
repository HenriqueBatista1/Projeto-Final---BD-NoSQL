import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type {
  CartAndSessionRepository,
  UserRepository,
} from "../repositories/contracts";
import type { PublicUser, Session, UserRecord } from "../types";

const DEMO_PASSWORD_SALT = "polyglot-store-demo";
const DUMMY_PASSWORD_HASH = "00".repeat(64);
const derivePasswordKey = promisify<string, string, number, Buffer>(scrypt);

type SessionStore = Pick<
  CartAndSessionRepository,
  "createSession" | "deleteSession" | "getSession"
>;

function sessionFor(user: Pick<UserRecord, "id" | "name" | "email">): Session {
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
  };
}

async function matchesPassword(password: string, passwordHash: string): Promise<boolean> {
  const saltedHash = /^scrypt:([0-9a-f]{32}):([0-9a-f]{128})$/.exec(passwordHash);
  const salt = saltedHash?.[1] ?? DEMO_PASSWORD_SALT;
  const hash = saltedHash?.[2] ?? passwordHash;

  if (!/^[0-9a-f]{128}$/i.test(hash)) {
    return false;
  }

  const expected = Buffer.from(hash, "hex");
  const candidate = await derivePasswordKey(password, salt, expected.length);
  return timingSafeEqual(candidate, expected);
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super("Email is already registered");
    this.name = "EmailAlreadyRegisteredError";
  }
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionStore,
  ) {}

  async register({ name, email, password }: {
    name: string;
    email: string;
    password: string;
  }): Promise<void> {
    const salt = randomBytes(16).toString("hex");
    const key = await derivePasswordKey(password, salt, 64);
    const user = await this.users.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash: `scrypt:${salt}:${key.toString("hex")}`,
    });

    if (!user) {
      throw new EmailAlreadyRegisteredError();
    }
  }

  async login(email: string, password: string): Promise<string> {
    const user = await this.users.findByEmail(email.trim());
    const passwordMatches = await matchesPassword(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !passwordMatches || !user.isActive) {
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
