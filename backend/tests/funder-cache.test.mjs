import test from "node:test";
import assert from "node:assert/strict";
import { funderCacheKey, getOrResearchFunder } from "../src/funder-cache.mjs";

const workspace = {
  funder: "Example Foundation",
  opportunity: "Community Fund",
  geography: "Timor-Leste",
  program_area: "Energy access",
};

test("cache keys normalize inconsequential spacing and case", () => {
  assert.equal(
    funderCacheKey(workspace),
    funderCacheKey({
      funder: "  EXAMPLE foundation ",
      opportunity: "Community   Fund",
      geography: "timor-leste",
      program_area: "Energy Access",
    }),
  );
});

test("an unexpired cache entry avoids live research", async () => {
  let researchCalls = 0;
  const cached = { confidence: "high", sources: [{ url: "https://example.org" }] };
  const queryFn = async (sql) => sql.includes("SELECT result") ? [{ result: cached }] : [];
  const envelope = await getOrResearchFunder(workspace, {
    queryFn,
    research: async () => {
      researchCalls += 1;
      return {};
    },
  });
  assert.equal(envelope.cacheStatus, "hit");
  assert.deepEqual(envelope.result, cached);
  assert.equal(researchCalls, 0);
});

test("concurrent identical cache misses share one research request", async () => {
  let researchCalls = 0;
  const queryFn = async () => [];
  const research = async () => {
    researchCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 25));
    return { confidence: "medium", sources: [] };
  };
  const [first, second] = await Promise.all([
    getOrResearchFunder(workspace, { queryFn, research }),
    getOrResearchFunder(workspace, { queryFn, research }),
  ]);
  assert.equal(researchCalls, 1);
  assert.deepEqual(first.result, second.result);
  assert.deepEqual(new Set([first.cacheStatus, second.cacheStatus]), new Set(["miss", "shared"]));
});
