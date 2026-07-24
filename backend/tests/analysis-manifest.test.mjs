import test from "node:test";
import assert from "node:assert/strict";
import { createAnalysisManifest, promptManifest, snapshotId } from "../src/analysis-manifest.mjs";

const documents = [{
  id: "doc_fixture",
  filename: "proposal.md",
  category: "proposal",
  source_type: "user_supplied",
  content_sha256: "a".repeat(64),
}];

test("prompt and source hashes are deterministic and content-sensitive", () => {
  const firstPrompts = promptManifest();
  const secondPrompts = promptManifest();
  assert.deepEqual(firstPrompts, secondPrompts);
  for (const prompt of Object.values(firstPrompts)) {
    assert.match(prompt.sha256, /^[a-f0-9]{64}$/);
    assert.match(prompt.version, /^\d+\.\d+\.\d+$/);
  }
  assert.equal(snapshotId(documents), snapshotId([...documents]));
  assert.notEqual(snapshotId(documents), snapshotId([{
    ...documents[0],
    content_sha256: "b".repeat(64),
  }]));
});

test("analysis manifests pin configuration, modules, provider requests, and errors", () => {
  const manifest = createAnalysisManifest({
    reviewId: "rev_fixture",
    workspace: { id: "wrk_fixture", proposal_version: "2" },
    documents,
    correlationId: "req_fixture",
    startedAt: "2026-07-24T00:00:00.000Z",
    completedAt: "2026-07-24T00:00:30.000Z",
    completionState: "partial",
    moduleRuns: [{
      module_id: "proposal_assessment",
      status: "partial",
      started_at: "2026-07-24T00:00:00.000Z",
      completed_at: "2026-07-24T00:00:30.000Z",
      duration_ms: 30_000,
      error_code: "ANALYSIS_TIMEOUT",
    }],
    providerRequests: [{
      module_id: "proposal_assessment",
      provider_request_id: "req_openai_fixture",
      response_id: "resp_fixture",
      model: "fixture-model",
    }],
    errors: [{
      code: "ANALYSIS_TIMEOUT",
      module_id: "proposal_assessment",
      message: "The analysis stage exceeded its time budget.",
      retryable: true,
      provider_request_id: "req_openai_fixture",
    }],
  });
  assert.equal(manifest.manifest_version, "1.0");
  assert.equal(manifest.review_id, "rev_fixture");
  assert.equal(manifest.completion_state, "partial");
  assert.equal(manifest.modules[0].version, "1.0.0");
  assert.equal(manifest.provider.requests[0].provider_request_id, "req_openai_fixture");
  assert.equal(manifest.errors[0].code, "ANALYSIS_TIMEOUT");
  assert.equal(manifest.confirmed_fact_snapshot_id, null);
});
