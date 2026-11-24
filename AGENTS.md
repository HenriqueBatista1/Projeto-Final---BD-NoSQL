# Repository Guidelines

## Project Structure

- `src/lib/db/` contains the shared PostgreSQL, MongoDB, and Redis clients. Reuse these `globalThis` singletons in persistence code.
- `init.sql` defines the PostgreSQL schema, indexes, and inventory audit trigger. `scripts/seed.ts` imports FakeStoreAPI data into MongoDB and PostgreSQL. Preserve seed idempotency so reruns keep existing inventory quantities.
- `tests/persistence/` contains the persistence tests. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for datastore responsibilities and the planned e-commerce application.

## Development Commands

- `npm ci` installs the dependencies pinned in `package-lock.json`.
- `npm run typecheck` checks TypeScript without emitting files.
- `npm test` runs the persistence suite through `tsx`.

To seed development databases, copy `.env.example` to `.env.local` and export the configured connection variables in your shell. Apply the PostgreSQL schema with `psql "$POSTGRES_URL" -v ON_ERROR_STOP=1 -f init.sql`, then run `npm run seed`. The seed needs access to PostgreSQL, MongoDB, and FakeStoreAPI. Keep real connection strings in ignored environment files or environment variables and commit only placeholders.

## Coding Style

Follow strict TypeScript and ES module conventions. Use two spaces, double quotes, and semicolons in TypeScript. Use `camelCase` for functions and variables, `PascalCase` for types, and `snake_case` for SQL identifiers. Match nearby code for formatting.

## Testing

Name test files `*.test.ts` and place them in `tests/persistence/`. Use `node:test` with `node:assert/strict` and name each case for the behavior it checks. Keep the default suite runnable without live services by using placeholder connection strings and testing validation independently of writes. Cover the behavior changed by your patch. The project has no configured coverage threshold.

## Commits and Pull Requests

Follow the dominant Git history pattern with short, imperative subjects such as `feat: add idempotent polyglot seed`, `fix: reject malformed seed payloads`, or `chore: add persistence environment configuration`. In pull requests, summarize the behavior change, link the relevant issue when available, and report which checks you ran. Call out schema changes, new environment variables, and any setup reviewers need to reproduce the result.
