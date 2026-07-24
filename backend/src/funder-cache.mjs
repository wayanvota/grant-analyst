import crypto from "node:crypto";
import { config } from "./config.mjs";
import { query } from "./db.mjs";

const inflightResearch = new Map();

function normalized(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function funderCacheKey(workspace) {
  return crypto.createHash("sha256").update([
    workspace.funder,
    workspace.opportunity,
    workspace.geography,
    workspace.program_area,
  ].map(normalized).join("|")).digest("hex");
}

function asObject(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

export async function getOrResearchFunder(workspace, {
  research,
  queryFn = query,
  cacheDays = config.funderCacheDays,
  model = config.analysisModel,
} = {}) {
  const cacheKey = funderCacheKey(workspace);
  try {
    const cached = await queryFn(
      `SELECT result FROM funder_research_cache
       WHERE cache_key=$1 AND expires_at > NOW()`,
      [cacheKey],
    );
    if (cached[0]?.result) {
      await queryFn(
        `UPDATE funder_research_cache
         SET hit_count=hit_count+1, updated_at=NOW() WHERE cache_key=$1`,
        [cacheKey],
      ).catch(() => {});
      return { result: asObject(cached[0].result), cacheStatus: "hit" };
    }
  } catch (error) {
    console.warn("Funder cache lookup failed; continuing with live research",
      error instanceof Error ? error.message : "Unknown error");
  }

  if (inflightResearch.has(cacheKey)) {
    return { result: await inflightResearch.get(cacheKey), cacheStatus: "shared" };
  }

  const researchPromise = Promise.resolve().then(research);
  inflightResearch.set(cacheKey, researchPromise);
  try {
    const result = await researchPromise;
    const expiresAt = new Date(Date.now() + cacheDays * 24 * 60 * 60 * 1000).toISOString();
    await queryFn(
      `INSERT INTO funder_research_cache
       (cache_key,funder,opportunity,geography,program_area,result,model,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
       ON CONFLICT(cache_key) DO UPDATE SET
         result=EXCLUDED.result, model=EXCLUDED.model, researched_at=NOW(),
         expires_at=EXCLUDED.expires_at, updated_at=NOW()`,
      [cacheKey, workspace.funder, workspace.opportunity, workspace.geography,
        workspace.program_area, JSON.stringify(result), model, expiresAt],
    ).catch((error) => console.warn("Funder research could not be cached",
      error instanceof Error ? error.message : "Unknown error"));
    return { result, cacheStatus: "miss" };
  } finally {
    inflightResearch.delete(cacheKey);
  }
}
