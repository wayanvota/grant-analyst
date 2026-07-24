import test from "node:test";
import assert from "node:assert/strict";
import { fallbackDecision, fallbackFunderResearch, fallbackProposalAssessment } from "../src/fast-fallbacks.mjs";
import { runAnalysisPipeline } from "../src/review-pipeline.mjs";
import { FastDecisionSchema, FunderResearchSchema, ProposalAssessmentSchema } from "../src/schemas.mjs";

const workspace = {
  id: "wrk_test",
  organization: "Test Applicant",
  funder: "Test Foundation",
  opportunity: "Test Opportunity",
  deadline: "2026-08-01",
  requested_amount: "USD 10,000",
  geography: "Timor-Leste",
  program_area: "Energy access",
  organization_type: "Nonprofit",
  proposal_version: "1",
};
const documents = [{
  filename: "proposal.txt",
  category: "proposal",
  source_type: "user_supplied",
  openai_file_id: "file_test",
}];

test("fallback results always satisfy the production schemas", () => {
  const assessment = fallbackProposalAssessment(workspace, documents, new Error("timeout"));
  const funder = fallbackFunderResearch(workspace, new Error("timeout"));
  const decision = fallbackDecision(assessment, funder, new Error("timeout"));
  assert.doesNotThrow(() => ProposalAssessmentSchema.parse(assessment));
  assert.doesNotThrow(() => FunderResearchSchema.parse(funder));
  assert.doesNotThrow(() => FastDecisionSchema.parse(decision));
});

test("the pipeline runs assessment and funder research in parallel, then decides", async () => {
  const assessment = fallbackProposalAssessment(workspace, documents, "fixture");
  const funder = fallbackFunderResearch(workspace, "fixture");
  const decision = fallbackDecision(assessment, funder, "fixture");
  const started = {};
  const stages = [];
  let parseCalls = 0;
  const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  const result = await runAnalysisPipeline({
    workspace,
    documents,
    ownerHash: "owner",
    reviewId: "rev_test",
    correlationId: "req_test",
    onStage: async (stage) => stages.push(stage),
  }, {
    parseStructured: async ({ schemaName, moduleId, onProviderResponse }) => {
      parseCalls += 1;
      onProviderResponse({
        module_id: moduleId,
        provider_request_id: `provider_${moduleId}`,
        response_id: `response_${moduleId}`,
        model: "fixture-model",
      });
      if (schemaName === "proposal_assessment_fast") {
        started.assessment = Date.now();
        await pause(35);
        return assessment;
      }
      assert.equal(schemaName, "grant_fast_decision");
      started.decision = Date.now();
      await pause(10);
      return decision;
    },
    getOrResearchFunder: async () => {
      started.research = Date.now();
      await pause(35);
      return { result: funder, cacheStatus: "miss" };
    },
  });

  assert.ok(Math.abs(started.assessment - started.research) < 15, "Layer-one work should start together.");
  assert.ok(started.decision >= started.assessment + 30, "Decision should wait for layer one.");
  assert.equal(parseCalls, 2);
  assert.deepEqual(stages, ["analyzing_inputs", "making_decision"]);
  assert.equal(result.schema_version, "2.0");
  assert.equal(result.pipeline.version, "two_layer_fast_v1");
  assert.equal(result.pipeline.status, "complete");
  assert.equal(result.pipeline.partial, false);
  assert.equal(result.pipeline.funder_cache, "miss");
  assert.equal(result.manifest.review_id, "rev_test");
  assert.equal(result.manifest.correlation_id, "req_test");
  assert.equal(result.manifest.completion_state, "complete");
  assert.equal(result.manifest.modules.length, 3);
  assert.equal(result.manifest.provider.requests.length, 2);
  assert.ok(result.pipeline.total_ms < 100);
});

test("a failed layer returns a marked, safe partial result", async () => {
  const funder = fallbackFunderResearch(workspace, "fixture");
  const result = await runAnalysisPipeline({
    workspace,
    documents,
    ownerHash: "owner",
    onStage: async () => {},
  }, {
    parseStructured: async () => {
      throw new Error("timed out");
    },
    getOrResearchFunder: async () => ({ result: funder, cacheStatus: "hit" }),
  });
  assert.equal(result.pipeline.partial, true);
  assert.equal(result.pipeline.status, "partial");
  assert.equal(result.manifest.completion_state, "partial");
  assert.ok(result.manifest.errors.every((error) => error.code));
  assert.equal(result.adjudication.recommendation, "no_go");
  assert.ok(result.pipeline.warnings.length >= 2);
  assert.doesNotThrow(() => FastDecisionSchema.parse({
    reviewer_panel: result.reviewer_panel,
    adjudication: result.adjudication,
  }));
});
