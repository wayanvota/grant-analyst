import test from "node:test";
import assert from "node:assert/strict";
process.env.NODE_ENV = "test";
process.env.SESSION_PEPPER = "test-session-pepper-that-is-long-enough";
process.env.MAX_DAILY_REVIEWS = "20";
process.env.MAX_SESSION_DAILY_REVIEWS = "2";

const { publicMeta } = await import("../src/server.mjs");

test("public metadata exposes limits without secrets", async () => {
  const metadata = publicMeta();
  assert.equal(metadata.service, "grant-analyst-api");
  assert.equal(metadata.sessionReviewLimit, 2);
  assert.equal("openaiApiKey" in metadata, false);
  assert.equal("databaseUrl" in metadata, false);
});
