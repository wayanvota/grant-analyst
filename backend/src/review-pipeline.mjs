import { config } from "./config.mjs";
import { fallbackDecision, fallbackFunderResearch, fallbackProposalAssessment } from "./fast-fallbacks.mjs";
import { getOrResearchFunder } from "./funder-cache.mjs";
import { parseStructured } from "./openai-client.mjs";
import { FastDecisionSchema, FunderResearchSchema, ProposalAssessmentSchema } from "./schemas.mjs";
import { FAST_DECISION_PROMPT, FUNDER_RESEARCH_PROMPT, PROPOSAL_ASSESSMENT_PROMPT } from "./prompts.mjs";

function fileContent(documents, intro) {
  return [
    { type: "input_text", text: intro },
    ...documents.flatMap((document) => [
      {
        type: "input_text",
        text: `Document: ${document.filename}\nCategory: ${document.category}\nSource classification: ${document.source_type}`,
      },
      { type: "input_file", file_id: document.openai_file_id },
    ]),
  ];
}

function elapsed(startedAt) {
  return Date.now() - startedAt;
}

export async function runAnalysisPipeline(
  { workspace, documents, ownerHash, onStage },
  services = { parseStructured, getOrResearchFunder },
) {
  const totalStartedAt = Date.now();
  const warnings = [];
  const context = {
    organization: workspace.organization,
    funder: workspace.funder,
    opportunity: workspace.opportunity,
    deadline: workspace.deadline || "not supplied",
    requested_amount: workspace.requested_amount || "not supplied",
    geography: workspace.geography || "not supplied",
    program_area: workspace.program_area || "not supplied",
    organization_type: workspace.organization_type || "not supplied",
    proposal_version: workspace.proposal_version,
  };

  await onStage("analyzing_inputs");
  const layer1StartedAt = Date.now();
  const assessmentPromise = services.parseStructured({
    model: config.fastModel,
    instructions: PROPOSAL_ASSESSMENT_PROMPT,
    content: fileContent(
      documents,
      `Workspace facts:\n${JSON.stringify(context, null, 2)}\nComplete the factual extraction and proposal assessment.`,
    ),
    schema: ProposalAssessmentSchema,
    schemaName: "proposal_assessment_fast",
    effort: "low",
    ownerHash,
    timeoutMs: config.proposalTimeoutMs,
    maxOutputTokens: 5_000,
  }).catch((error) => {
    warnings.push(`Proposal assessment used a safeguard result: ${error instanceof Error ? error.message : "timed analysis failed"}`);
    return fallbackProposalAssessment(workspace, documents, error);
  });

  const researchPromise = services.getOrResearchFunder(workspace, {
    research: () => services.parseStructured({
      model: config.analysisModel,
      instructions: FUNDER_RESEARCH_PROMPT,
      content: [{
        type: "input_text",
        text: `Research only this public funder context:\n${JSON.stringify({
          funder: workspace.funder,
          opportunity: workspace.opportunity,
          geography: workspace.geography,
          program_area: workspace.program_area,
          accessed_date: new Date().toISOString().slice(0, 10),
        }, null, 2)}`,
      }],
      schema: FunderResearchSchema,
      schemaName: "funder_intelligence_fast",
      effort: "low",
      ownerHash,
      tools: [{ type: "web_search", search_context_size: "low" }],
      timeoutMs: config.funderTimeoutMs,
      maxOutputTokens: 4_000,
    }),
  }).catch((error) => {
    warnings.push(`Funder research used a safeguard result: ${error instanceof Error ? error.message : "timed research failed"}`);
    return { result: fallbackFunderResearch(workspace, error), cacheStatus: "fallback" };
  });

  const [assessment, researchEnvelope] = await Promise.all([assessmentPromise, researchPromise]);
  const layer1Ms = elapsed(layer1StartedAt);

  await onStage("making_decision");
  const layer2StartedAt = Date.now();
  const decision = await services.parseStructured({
    model: config.fastModel,
    instructions: FAST_DECISION_PROMPT,
    content: [{
      type: "input_text",
      text: `Workspace:\n${JSON.stringify(context, null, 2)}
Proposal assessment:\n${JSON.stringify(assessment, null, 2)}
Public funder intelligence:\n${JSON.stringify(researchEnvelope.result, null, 2)}
Complete the skeptical review and final adjudication.`,
    }],
    schema: FastDecisionSchema,
    schemaName: "grant_fast_decision",
    effort: "low",
    ownerHash,
    timeoutMs: config.decisionTimeoutMs,
    maxOutputTokens: 5_000,
  }).catch((error) => {
    warnings.push(`Decision layer used a safeguard result: ${error instanceof Error ? error.message : "timed decision failed"}`);
    return fallbackDecision(assessment, researchEnvelope.result, error);
  });
  const layer2Ms = elapsed(layer2StartedAt);

  return {
    schema_version: "2.0",
    generated_at: new Date().toISOString(),
    models: { fast: config.fastModel, analysis: config.analysisModel },
    pipeline: {
      version: "two_layer_fast_v1",
      partial: warnings.length > 0,
      warnings,
      funder_cache: researchEnvelope.cacheStatus,
      layer_1_ms: layer1Ms,
      layer_2_ms: layer2Ms,
      total_ms: elapsed(totalStartedAt),
    },
    facts: assessment.facts,
    funder_research: researchEnvelope.result,
    due_diligence: assessment.due_diligence,
    reviewer_panel: decision.reviewer_panel,
    adjudication: decision.adjudication,
  };
}
