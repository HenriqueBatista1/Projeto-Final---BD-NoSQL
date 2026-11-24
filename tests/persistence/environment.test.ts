import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("environment declares all persistence placeholders and gitignore protects secrets", async () => {
  const envExample = await readFile(".env.example", "utf8");
  assert.equal(
    envExample,
    'POSTGRES_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"\n' +
      'MONGODB_URI="mongodb+srv://[USER]:[PASSWORD]@cluster0.[ID].mongodb.net/polyglot_store?retryWrites=true&w=majority"\n' +
      'REDIS_URL="rediss://default:[PASSWORD]@[ENDPOINT].upstash.io:6379"\n',
  );

  const gitignore = await readFile(".gitignore", "utf8");
  for (const rule of [".env", ".env.*", ".env.local", "node_modules/", ".next/", "!.env.example"]) {
    assert.ok(gitignore.split(/\r?\n/).includes(rule), `missing ${rule} in .gitignore`);
  }
});
