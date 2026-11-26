# Repository Guidelines

## Architecture

- Next.js 16 App Router separates the UI, server-side application logic, and persistence. Browser code must never connect to a database.
- `src/lib/db/` owns the shared PostgreSQL, MongoDB, and Redis singletons. Repositories in `src/lib/repositories/` accept injected clients for tests and default to these shared clients:
  - `catalog.ts`: product catalog in MongoDB.
  - `cart-session.ts`: per-user cart hashes and expiring Redis sessions.
  - `orders-inventory.ts`: PostgreSQL stock, orders, item snapshots, and audit trail.
  - `users.ts`: PostgreSQL user lookup for demo authentication.
- Services in `src/lib/services/` compose repositories: C1 catalog + stock, C2 cart hydration, C3 checkout, C4 authentication/session, and C5 order history. Keep business rules here, not in UI components or C6.
- C6 Server Actions and Route Handlers are thin server adapters: validate input (Zod), read/write the session cookie, call services, and return user-facing errors in Portuguese. Do not import database clients in actions or routes.
- App Router pages and components render the store UI and call server actions for mutations. Keep database access and authoritative prices on the server.
- `init.sql` defines the PostgreSQL schema and inventory audit trigger. `scripts/seed.ts` imports FakeStoreAPI data; preserve idempotency and existing inventory quantities when re-running it.

## Invariants

- **Checkout:** Use catalog prices from the server, sort product IDs before PostgreSQL row locks, and keep stock changes and order snapshots in one transaction. Roll back on failure. Clear a user's Redis cart only after PostgreSQL commit; if that cleanup fails, preserve the successful order result and report `cartCleared: false`.
- **Session:** The service stores sessions in Redis; only C6 manages the `polyglot_session` cookie (`HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=7200`, `Secure` in production). Never expose password hashes.
- **Isolation:** Keep cart keys scoped to the user and separate from session keys. `clearCart` must not delete sessions. Inject fakes in tests so the default suite needs no live databases; opt-in live tests use `RUN_LIVE_TESTS=1`.

## Tests

- Put repository tests in `tests/persistence/` and service tests in `tests/services/`. Use `node:test`, `node:assert/strict`, and injected fakes.
- Name tests `*.test.ts`; cover the changed behavior and keep `npm test` runnable without external services.
- Live integration/concurrency tests must be opt-in. E2E journeys use Playwright and `npm run test:e2e`.

## Day-to-day Commands

- `npm ci` — install the locked dependencies.
- `npm run dev` — run the app locally.
- `npm run typecheck` — type-check without emitting files.
- `npm test` — run the default test suite.
- `npm run build` — verify the production build.
- For database setup, configure `.env.local` from `.env.example`, apply `psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -f init.sql`, then run `npm run seed`. Keep real connection strings in ignored environment files or environment variables; commit placeholders only.

## Coding Style

Use strict TypeScript and ES modules, two spaces, double quotes, and semicolons. Use `camelCase` for values/functions, `PascalCase` for types, and `snake_case` for SQL identifiers. Match nearby patterns and keep changes focused.