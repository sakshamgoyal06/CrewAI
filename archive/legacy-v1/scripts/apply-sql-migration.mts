/**
 * Apply a SQL migration file to Supabase Postgres.
 *
 * Requires direct DB access (not available from all hosts — use Supabase SQL Editor if this fails):
 *   SUPABASE_DB_PASSWORD=... npx tsx scripts/apply-sql-migration.mts supabase/migrations/....sql
 *
 * Optional overrides: SUPABASE_DB_HOST, SUPABASE_DB_PORT, SUPABASE_DB_USER, SUPABASE_DB_NAME
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const fileArg = process.argv[2];
if (!fileArg) {
  console.error("Usage: npx tsx scripts/apply-sql-migration.mts <path-to.sql>");
  process.exit(1);
}

const sqlPath = path.resolve(fileArg);
if (!fs.existsSync(sqlPath)) {
  console.error("File not found:", sqlPath);
  process.exit(1);
}

const password = process.env.SUPABASE_DB_PASSWORD?.trim();
if (!password) {
  console.error(
    "Set SUPABASE_DB_PASSWORD (Supabase → Project Settings → Database → password).",
  );
  process.exit(1);
}

const projectRef =
  process.env.SUPABASE_PROJECT_REF?.trim() ||
  process.env.SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ||
  "xdrpjfdhduskhzryevze";

const host =
  process.env.SUPABASE_DB_HOST?.trim() || `db.${projectRef}.supabase.co`;
const port = Number(process.env.SUPABASE_DB_PORT?.trim() || "5432");
const user = process.env.SUPABASE_DB_USER?.trim() || "postgres";
const database = process.env.SUPABASE_DB_NAME?.trim() || "postgres";

const sql = fs.readFileSync(sqlPath, "utf8");
const client = new pg.Client({
  host,
  port,
  user,
  password,
  database,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(sql);
  console.log("Applied:", sqlPath);
} catch (e) {
  console.error("Migration failed:", e);
  process.exit(1);
} finally {
  await client.end();
}
