import test from "node:test";
import assert from "node:assert/strict";
import {
  apiRequest,
  createWorkspace,
  deleteWorkspace,
  newSession,
  responseJson,
  uploadTextDocument,
} from "./live-helpers.mjs";

const enabled = process.env.RUN_PAID_OPENAI_TESTS === "1";
const runCount = Number.parseInt(process.env.PAID_TEST_RUNS || "3", 10);
const pollIntervalMs = 5_000;
const maxWaitMs = 4 * 60 * 1_000;

const proposal = `SYNTHETIC TEST PROPOSAL

Organization: Grant Analyst Automated Test
Opportunity: Production Verification Grant
Location: Dili, Timor-Leste
Request: USD 10,000 for a six-month pilot

The project will distribute 100 solar lanterns to households and train 10
community volunteers in maintenance. The budget allocates USD 7,000 to
equipment, USD 2,000 to training, and USD 1,000 to monitoring. The proposal
targets 100 completed distributions and 10 trained volunteers. Baseline data,
procurement quotations, safeguarding procedures, and an independent evaluation
are not supplied. This text is synthetic and contains no confidential data.`;

async function startPaidRun(index) {
  const session = newSession();
  const workspace = await createWorkspace(session, {
    organization: `Grant Analyst paid test ${index}`,
    opportunity: "Paid production analysis",
  });
  try {
    await uploadTextDocument(session, workspace.id, {
      category: "proposal",
      filename: `synthetic-proposal-${index}.txt`,
      text: proposal,
    });
    const { response, data } = await responseJson(await apiRequest(
      `/api/workspaces/${workspace.id}/analyze`,
      { session, method: "POST" },
    ));
    assert.equal(response.status, 202, JSON.stringify(data));
    assert.equal(data.review.status, "running");
    return { session, workspaceId: workspace.id, reviewId: data.review.id, index };
  } catch (error) {
    await deleteWorkspace(session, workspace.id);
    throw error;
  }
}

async function waitForReview(run) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxWaitMs) {
    const { response, data } = await responseJson(await apiRequest(
      `/api/reviews/${run.reviewId}`,
      { session: run.session },
    ));
    assert.equal(response.status, 200, JSON.stringify(data));
    if (["complete", "complete_with_warnings", "partial", "completed"].includes(data.review.status)) {
      return data.review;
    }
    if (data.review.status === "failed") {
      throw new Error(`Paid analysis ${run.index} failed: ${data.review.error_message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`Paid analysis ${run.index} did not finish within ${maxWaitMs / 60_000} minutes.`);
}

test("three paid two-layer production analyses complete fully within 90 seconds", {
  skip: !enabled,
  timeout: maxWaitMs + 300_000,
}, async () => {
  assert.equal(runCount, 3, "This production verification is intentionally fixed at three paid runs.");
  const runs = [];
  try {
    for (let index = 1; index <= runCount; index += 1) {
      runs.push(await startPaidRun(index));
    }
    const reviews = await Promise.all(runs.map(waitForReview));
    for (const review of reviews) {
      assert.equal(review.status, "complete");
      assert.equal(review.stage, "complete");
      assert.equal(review.completion_state, "complete");
      assert.equal(review.model, "gpt-5.6-luna");
      assert.equal(review.result.schema_version, "2.0");
      assert.equal(review.result.pipeline.version, "two_layer_fast_v1");
      assert.equal(review.result.pipeline.partial, false,
        `Run ${review.id} was partial: ${review.result.pipeline.warnings.join(" | ")}`);
      assert.ok(review.result.pipeline.total_ms <= 90_000,
        `Run ${review.id} took ${review.result.pipeline.total_ms}ms`);
      assert.equal(review.result.models.analysis, "gpt-5.6-terra");
      assert.equal(review.result.models.fast, "gpt-5.6-luna");
      assert.ok(review.result.adjudication.recommendation);
      assert.ok(Number.isFinite(review.result.adjudication.diagnostic_score));
      assert.ok(review.completed_at);
      assert.equal(review.result.manifest.completion_state, "complete");
      assert.match(review.result.manifest.source_snapshot_id, /^ss_[a-f0-9]{64}$/);
    }
  } finally {
    await Promise.allSettled(runs.map((run) => deleteWorkspace(run.session, run.workspaceId)));
  }
});
