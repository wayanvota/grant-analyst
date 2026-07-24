import { config } from "./config.mjs";
import { classifyAnalysisError } from "./analysis-errors.mjs";
import { createAnalysisManifest } from "./analysis-manifest.mjs";
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
  { workspace, documents, ownerHash, reviewId = null, correlationId = null, onStage },
  services = { parseStructured, getOrResearchFunder },
) {
  const totalStartedAt = Date.now();
  const analysisStartedAt = new Date(totalStartedAt).toISOString();
  const warnings = [];
  const errors = [];
  const moduleRuns = [];
  const providerRequests = [];
  const recordProviderResponse = (record) => providerRequests.push(record);
  const recordModuleError = (error, moduleId, startedAt, details = {}) => {
    const classified = classifyAnalysisError(error, moduleId);
    errors.push(classified.toRecord());
    moduleRuns.push({
      module_id: moduleId,
      status: "partial",
      started_at: new Date(startedAt).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: elapsed(startedAt),
      error_code: classified.code,
      ...details,
    });
    warnings.push(`${classified.code}: ${classified.message}`);
    return classified;
  };
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
  const assessmentStartedAt = Date.now();
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
    moduleId: "proposal_assessment",
    onProviderResponse: recordProviderResponse,
  }).then((assessment) => {
    moduleRuns.push({
      module_id: "proposal_assessment",
      status: "complete",
      started_at: new Date(assessmentStartedAt).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: elapsed(assessmentStartedAt),
      error_code: null,
    });
    return assessment;
  }).catch((error) => {
    const classified = recordModuleError(error, "proposal_assessment", assessmentStartedAt);
    return fallbackProposalAssessment(workspace, documents, classified);
  });

  const researchStartedAt = Date.now();
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
      moduleId: "funder_research",
      onProviderResponse: recordProviderResponse,
    }),
  }).then((envelope) => {
    moduleRuns.push({
      module_id: "funder_research",
      status: "complete",
      started_at: new Date(researchStartedAt).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: elapsed(researchStartedAt),
      error_code: null,
      cache_status: envelope.cacheStatus,
    });
    return envelope;
  }).catch((error) => {
    const classified = recordModuleError(error, "funder_research", researchStartedAt, {
      cache_status: "fallback",
    });
    return { result: fallbackFunderResearch(workspace, classified), cacheStatus: "fallback" };
  });

  const [assessment, researchEnvelope] = await Promise.all([assessmentPromise, researchPromise]);
  const layer1Ms = elapsed(layer1StartedAt);

  await onStage("making_decision");
  const layer2StartedAt = Date.now();
  const decisionStartedAt = Date.now();
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
    moduleId: "decision",
    onProviderResponse: recordProviderResponse,
  }).then((result) => {
    moduleRuns.push({
      module_id: "decision",
      status: "complete",
      started_at: new Date(decisionStartedAt).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: elapsed(decisionStartedAt),
      error_code: null,
    });
    return result;
  }).catch((error) => {
    const classified = recordModuleError(error, "decision", decisionStartedAt);
    return fallbackDecision(assessment, researchEnvelope.result, classified);
  });
  const layer2Ms = elapsed(layer2StartedAt);
  const completedAt = new Date().toISOString();
  const completionState = errors.length
    ? "partial"
    : warnings.length
      ? "complete_with_warnings"
      : "complete";

  const analysis = {
    schema_version: "2.0",
    generated_at: completedAt,
    models: { fast: config.fastModel, analysis: config.analysisModel },
    pipeline: {
      version: "two_layer_fast_v1",
      status: completionState,
      partial: completionState === "partial",
      warnings,
      errors,
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
  analysis.manifest = createAnalysisManifest({
    reviewId,
    workspace,
    documents,
    correlationId,
    startedAt: analysisStartedAt,
    completedAt,
    completionState,
    moduleRuns,
    providerRequests,
    errors,
  });
  return analysis;
}
