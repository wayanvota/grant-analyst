import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { query } from "../src/db.mjs";
import { splitSqlStatements } from "./sql-statements.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`);

const files = (await readdir(join(root, "migrations"))).filter((name) => name.endsWith(".sql")).sort();
for (const filename of files) {
  const applied = await query("SELECT 1 FROM schema_migrations WHERE filename = $1", [filename]);
  if (applied.length) continue;
  const source = await readFile(join(root, "migrations", filename), "utf8");
  const statements = splitSqlStatements(source.replaceAll("-- statement-breakpoint", ""));
  for (const statement of statements) await query(statement);
  await query("INSERT INTO schema_migrations(filename) VALUES ($1)", [filename]);
  console.log(`Applied ${filename}`);
}
