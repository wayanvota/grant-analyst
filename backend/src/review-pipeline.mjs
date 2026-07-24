import { config } from "./config.mjs";
import { parseStructured } from "./openai-client.mjs";
import {
  AdjudicationSchema, DueDiligenceSchema, FactExtractionSchema, FunderResearchSchema, ReviewerPanelSchema,
} from "./schemas.mjs";
import {
  ADJUDICATION_PROMPT, DUE_DILIGENCE_PROMPT, FACT_EXTRACTION_PROMPT, FUNDER_RESEARCH_PROMPT, REVIEWER_PROMPT,
} from "./prompts.mjs";

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

export async function runAnalysisPipeline({ workspace, documents, ownerHash, onStage }) {
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

  await onStage("extracting_facts");
  const facts = await parseStructured({
    model: config.fastModel,
    instructions: FACT_EXTRACTION_PROMPT,
    content: fileContent(documents, `Workspace facts:\n${JSON.stringify(context, null, 2)}\nExtract facts from the attached materials.`),
    schema: FactExtractionSchema,
    schemaName: "grant_fact_extraction",
    effort: "low",
    ownerHash,
  });

  await onStage("researching_funder");
  const funderResearch = await parseStructured({
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
    schemaName: "funder_intelligence",
    effort: "medium",
    ownerHash,
    tools: [{ type: "web_search", search_context_size: "medium" }],
  });

  await onStage("running_due_diligence");
  const dueDiligence = await parseStructured({
    model: config.analysisModel,
    instructions: DUE_DILIGENCE_PROMPT,
    content: fileContent(documents, `Workspace:\n${JSON.stringify(context, null, 2)}

Extracted facts:\n${JSON.stringify(facts, null, 2)}

Public funder intelligence:\n${JSON.stringify(funderResearch, null, 2)}

Conduct the full due diligence review.`),
    schema: DueDiligenceSchema,
    schemaName: "proposal_due_diligence",
    effort: "medium",
    ownerHash,
  });

  await onStage("simulating_reviewers");
  const reviewerPanel = await parseStructured({
    model: config.analysisModel,
    instructions: REVIEWER_PROMPT,
    content: [{
      type: "input_text",
      text: `Workspace:\n${JSON.stringify(context, null, 2)}
Facts:\n${JSON.stringify(facts, null, 2)}
Funder intelligence:\n${JSON.stringify(funderResearch, null, 2)}
Due diligence:\n${JSON.stringify(dueDiligence, null, 2)}`,
    }],
    schema: ReviewerPanelSchema,
    schemaName: "skeptical_reviewer_panel",
    effort: "medium",
    ownerHash,
  });

  await onStage("adjudicating");
  const adjudication = await parseStructured({
    model: config.analysisModel,
    instructions: ADJUDICATION_PROMPT,
    content: [{
      type: "input_text",
      text: `Workspace:\n${JSON.stringify(context, null, 2)}
Facts:\n${JSON.stringify(facts, null, 2)}
Funder intelligence:\n${JSON.stringify(funderResearch, null, 2)}
Due diligence:\n${JSON.stringify(dueDiligence, null, 2)}
Reviewer panel:\n${JSON.stringify(reviewerPanel, null, 2)}`,
    }],
    schema: AdjudicationSchema,
    schemaName: "grant_adjudication",
    effort: "medium",
    ownerHash,
  });

  return {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    models: { fast: config.fastModel, analysis: config.analysisModel },
    facts,
    funder_research: funderResearch,
    due_diligence: dueDiligence,
    reviewer_panel: reviewerPanel,
    adjudication,
  };
}
