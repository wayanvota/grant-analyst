import { neon } from "@neondatabase/serverless";
import { config } from "./config.mjs";

let client;

export function db() {
  if (!config.databaseUrl) throw new Error("DATABASE_URL is not configured.");
  client ??= neon(config.databaseUrl, { fullResults: false });
  return client;
}

export async function query(text, params = []) {
  return db().query(text, params);
}

export async function healthcheck() {
  const rows = await query("SELECT 1 AS ok");
  return rows[0]?.ok === 1;
}
