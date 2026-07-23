import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

test("ships Grant Analyst product metadata and social preview", async () => {
  const [layout, page] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    access(new URL("../public/og.png", import.meta.url)),
  ]);
  assert.match(layout, /Grant Analyst \| Evidence-backed proposal review/);
  assert.match(layout, /generateMetadata/);
  assert.match(layout, /og\.png/);
  assert.match(page, /Find the rejection case before the funder does/);
  assert.doesNotMatch(page, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("connects the interface to the backend review workflow", async () => {
  const [page, analyzeRoute, uploadRoute, schema, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workspaces/[id]/analyze/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workspaces/[id]/documents/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    access(new URL("../drizzle/0000_absent_sabretooth.sql", import.meta.url)),
  ]);
  assert.match(page, /Five damaging questions/);
  assert.match(page, /Claim and evidence ledger|claims-list/);
  assert.match(page, /\/api\/workspaces/);
  assert.match(analyzeRoute, /runAnalysisPipeline/);
  assert.match(uploadRoute, /DOCUMENTS\.put/);
  assert.match(schema, /export const reviews/);
  assert.match(packageJson, /"openai"/);
  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  assert.equal(templateRoot.pathname.endsWith("/grant-analyst/"), true);
});
