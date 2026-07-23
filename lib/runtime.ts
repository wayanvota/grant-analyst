import { env } from "cloudflare:workers";

type RuntimeEnv = {
  DB: D1Database;
  DOCUMENTS: R2Bucket;
  OPENAI_API_KEY?: string;
  OPENAI_ANALYSIS_MODEL?: string;
  OPENAI_FAST_MODEL?: string;
};

export function runtimeEnv(): RuntimeEnv {
  return env as unknown as RuntimeEnv;
}

export function requireRuntimeEnv() {
  const current = runtimeEnv();
  if (!current.DB) throw new Error("D1 binding DB is unavailable.");
  if (!current.DOCUMENTS) throw new Error("R2 binding DOCUMENTS is unavailable.");
  if (!current.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");
  return current as Required<Pick<RuntimeEnv, "DB" | "DOCUMENTS" | "OPENAI_API_KEY">> & RuntimeEnv;
}
