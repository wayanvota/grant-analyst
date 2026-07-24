import test from "node:test";
import assert from "node:assert/strict";
import {
  apiBase,
  apiRequest,
  createWorkspace,
  deleteWorkspace,
  frontendBase,
  newSession,
  responseJson,
} from "./live-helpers.mjs";

test("public frontend and its required static assets are reachable", async () => {
  const response = await fetch(frontendBase);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  const html = await response.text();
  assert.match(html, /<title>Grant Analyst(?: \|[^<]+)?<\/title>/);
  assert.match(html, /src="\.\/config\.js"/);

  const assetPaths = [...html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)]
    .map((match) => match[1])
    .filter((path) => !path.startsWith("./#"));
  assert.ok(assetPaths.length >= 3, "Expected runtime config and bundled assets.");

  const assetResponses = await Promise.all(
    assetPaths.map((path) => fetch(new URL(path, frontendBase))),
  );
  for (const assetResponse of assetResponses) {
    assert.equal(assetResponse.status, 200, `${assetResponse.url} should be reachable`);
  }

  const config = await (await fetch(new URL("./config.js", frontendBase))).text();
  assert.match(config, /https:\/\/grant-analyst-api\.onrender\.com/);
  assert.doesNotMatch(config, /OPENAI_API_KEY|DATABASE_URL/);
});

test("health, metadata, security headers, and allowed CORS origin are correct", async () => {
  const health = await responseJson(await fetch(new URL("/health", apiBase)));
  assert.equal(health.response.status, 200);
  assert.deepEqual(health.data, { ok: true, service: "grant-analyst-api" });
  assert.match(health.response.headers.get("content-security-policy") || "", /default-src/);
  assert.equal(health.response.headers.get("x-content-type-options"), "nosniff");

  const metadata = await responseJson(await fetch(new URL("/api/meta", apiBase), {
    headers: { origin: frontendBase.origin },
  }));
  assert.equal(metadata.response.status, 200);
  assert.equal(metadata.response.headers.get("access-control-allow-origin"), frontendBase.origin);
  assert.equal(metadata.data.sessionReviewLimit, 2);
  assert.equal(metadata.data.maxUploadMb, 15);
  assert.deepEqual(metadata.data.reviewStages, ["analyzing_inputs", "making_decision"]);
  assert.equal("openaiApiKey" in metadata.data, false);
  assert.equal("databaseUrl" in metadata.data, false);
});

test("session and CORS protections reject unauthorized requests", async () => {
  const missingSession = await responseJson(await apiRequest("/api/workspaces"));
  assert.equal(missingSession.response.status, 401);
  assert.match(missingSession.data.error, /private browser session/i);

  const weakSession = await responseJson(await apiRequest("/api/workspaces", {
    session: "short",
  }));
  assert.equal(weakSession.response.status, 401);

  const disallowedOrigin = await responseJson(await apiRequest("/api/workspaces", {
    session: newSession(),
    headers: { origin: "https://attacker.example" },
  }));
  assert.equal(disallowedOrigin.response.status, 403);
  assert.match(disallowedOrigin.data.error, /not allowed/i);
});

test("workspace CRUD, isolation, validation, and no-document review guard work", async () => {
  const ownerSession = newSession();
  const otherSession = newSession();
  const workspace = await createWorkspace(ownerSession);

  try {
    const bundle = await responseJson(await apiRequest(`/api/workspaces/${workspace.id}`, {
      session: ownerSession,
    }));
    assert.equal(bundle.response.status, 200);
    assert.equal(bundle.data.workspace.id, workspace.id);
    assert.deepEqual(bundle.data.documents, []);

    const isolated = await responseJson(await apiRequest(`/api/workspaces/${workspace.id}`, {
      session: otherSession,
    }));
    assert.equal(isolated.response.status, 404);

    const updated = await responseJson(await apiRequest(`/api/workspaces/${workspace.id}`, {
      session: ownerSession,
      method: "PATCH",
      body: { requestedAmount: "USD 12,500" },
    }));
    assert.equal(updated.response.status, 200);
    assert.equal(updated.data.workspace.requested_amount, "USD 12,500");

    const unsupportedPatch = await responseJson(await apiRequest(`/api/workspaces/${workspace.id}`, {
      session: ownerSession,
      method: "PATCH",
      body: { owner_hash: "should-not-change" },
    }));
    assert.equal(unsupportedPatch.response.status, 400);

    const invalidFile = new FormData();
    invalidFile.set("category", "proposal");
    invalidFile.set("file", new Blob(["not executable"], { type: "application/octet-stream" }), "test.exe");
    const rejectedUpload = await responseJson(await apiRequest(
      `/api/workspaces/${workspace.id}/documents`,
      { session: ownerSession, method: "POST", body: invalidFile },
    ));
    assert.equal(rejectedUpload.response.status, 400);

    const guardedReview = await responseJson(await apiRequest(
      `/api/workspaces/${workspace.id}/analyze`,
      { session: ownerSession, method: "POST" },
    ));
    assert.equal(guardedReview.response.status, 400);
    assert.match(guardedReview.data.error, /proposal/i);
  } finally {
    await deleteWorkspace(ownerSession, workspace.id);
  }

  const removed = await responseJson(await apiRequest(`/api/workspaces/${workspace.id}`, {
    session: ownerSession,
  }));
  assert.equal(removed.response.status, 404);
});
