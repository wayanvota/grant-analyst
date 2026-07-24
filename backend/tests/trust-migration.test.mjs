import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("the trust migration stores explicit states and makes completed manifests immutable", async () => {
  const sql = await readFile(
    new URL("../migrations/003_trust_manifest.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /correlation_id TEXT/);
  assert.match(sql, /completion_state TEXT/);
  assert.match(sql, /analysis_manifest JSONB/);
  assert.match(sql, /error_code TEXT/);
  assert.match(sql, /reviews_completion_state_valid/);
  assert.match(sql, /reviews_manifest_matches_result/);
  assert.match(sql, /prevent_analysis_manifest_change/);
  assert.match(sql, /OLD\.analysis_manifest IS NOT NULL/);
  assert.match(sql, /RAISE EXCEPTION 'analysis_manifest is immutable once stored'/);
  assert.match(sql, /result manifest must match analysis_manifest/);
  assert.match(sql, /BEFORE UPDATE OF analysis_manifest, result/);
});
