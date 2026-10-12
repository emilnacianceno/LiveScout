// Creates the database if missing, then applies database/schema.sql and database/updates/*.sql.
// Same ledger + advisory-lock approach as gf360-nextjs: each component runs once and is recorded
// in db_component_runs; everything happens in one transaction.
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';

const root = resolve(import.meta.dir, '..');
const url = new URL(process.env.DATABASE_URL ?? '');
const dbName = url.pathname.slice(1);
if (!/^[a-z0-9_]+$/i.test(dbName)) throw new Error(`Unsafe database name: "${dbName}"`);
const DATABASE_LOCK = 7_319_042;
const UPDATE_NAME = /^\d{3,}-[a-z0-9][a-z0-9-]*\.sql$/;
const checksum = (text: string) => createHash('sha256').update(text).digest('hex');

// 1. Create the database if needed (connect to the maintenance DB)
const adminUrl = new URL(url);
adminUrl.pathname = '/postgres';
const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
const [exists] = await admin`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
if (!exists) {
  await admin.unsafe(`CREATE DATABASE "${dbName}"`);
  console.log(`Created database ${dbName}`);
}
await admin.end();

// 2. Apply schema + updates
const sql = postgres(url.toString(), { max: 1, onnotice: () => {} });
const files = (await readdir(resolve(root, 'database/updates'))).filter((f) => UPDATE_NAME.test(f)).sort();

await sql.begin(async (tx) => {
  await tx`SELECT pg_advisory_xact_lock(${DATABASE_LOCK})`;
  await tx.unsafe(`CREATE TABLE IF NOT EXISTS db_component_runs (
    component text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await tx`SELECT component FROM db_component_runs`).map((r) => r.component as string));

  const components = [
    { name: 'schema', file: 'database/schema.sql', always: true },
    ...files.map((f) => ({ name: `update:${f}`, file: `database/updates/${f}`, always: false })),
  ];
  for (const c of components) {
    const text = await readFile(resolve(root, c.file), 'utf8');
    // schema.sql is idempotent, so it is re-applied when its checksum changes; updates run once
    if (done.has(c.name) && !c.always) continue;
    const [prev] = await tx`SELECT checksum FROM db_component_runs WHERE component = ${c.name}`;
    if (prev?.checksum === checksum(text)) continue;
    await tx.unsafe(text);
    await tx`INSERT INTO db_component_runs (component, checksum) VALUES (${c.name}, ${checksum(text)})
      ON CONFLICT (component) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = now()`;
    console.log(`Applied ${c.name}`);
  }
});
await sql.end();
console.log('Database up to date.');
