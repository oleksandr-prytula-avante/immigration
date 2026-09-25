import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { databaseUrl, loadLocalEnv } from "./db-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function applyPendingMigrations(db, migrations) {
  await db.query("select pg_advisory_lock(hashtext($1))", ["immigration-research:migrations"]);
  try {
    await db.query(`create table if not exists public.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`);
    await db.query("alter table public.schema_migrations enable row level security");
    await db.query("revoke all on public.schema_migrations from public, anon, authenticated");
    const previous = await db.query("select name from public.schema_migrations");
    const completed = new Set(previous.rows.map(row => row.name));
    const applied = [];
    for (const migration of [...migrations].sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      if (completed.has(migration.name)) continue;
      // Files remain independently usable in psql; the runner owns their outer
      // transaction so recording completion commits together with the DDL.
      const body = migration.sql.trim().replace(/^begin;\s*/i, "").replace(/\s*commit;\s*$/i, "");
      await db.query("begin");
      try {
        await db.query(body);
        await db.query("insert into public.schema_migrations (name) values ($1)", [migration.name]);
        await db.query("commit");
      } catch (error) {
        await db.query("rollback");
        throw error;
      }
      completed.add(migration.name);
      applied.push(migration.name);
    }
    return applied;
  } finally {
    await db.query("select pg_advisory_unlock(hashtext($1))", ["immigration-research:migrations"]);
  }
}

async function main() {
  await loadLocalEnv(root);
  const directory = path.join(root, "supabase", "migrations");
  const names = (await fs.readdir(directory)).filter(name => /^\d+_[a-z0-9_]+\.sql$/i.test(name));
  const migrations = await Promise.all(names.map(async name => ({ name, sql: await fs.readFile(path.join(directory, name), "utf8") })));
  const db = new pg.Client({
    connectionString: databaseUrl(),
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== "false" }
  });
  await db.connect();
  try {
    const applied = await applyPendingMigrations(db, migrations);
    console.log(applied.length ? `Applied migrations: ${applied.join(", ")}` : "Database schema is up to date.");
  } finally {
    await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
