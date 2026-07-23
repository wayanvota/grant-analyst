import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  AdjudicationSchema,
  DueDiligenceSchema,
  FactExtractionSchema,
  FunderResearchSchema,
  ReviewerPanelSchema,
  type Adjudication,
  type DueDiligence,
  type FactExtraction,
  type FunderResearch,
  type ReviewerPanel,
} from "./analysis-schemas";
import {
  ADJUDICATION_PROMPT,
  DUE_DILIGENCE_PROMPT,
  FACT_EXTRACTION_PROMPT,
  FUNDER_RESEARCH_PROMPT,
  REVIEWER_PROMPT,
} from "./prompts";
import { requireRuntimeEnv } from "./runtime";
import { safetyIdentifier } from "./server";

export type AnalysisDocument = {
  id: string;
  filename: string;
  category: string;
  sourceType: string;
  openaiFileId: string;
};

export type AnalysisWorkspace = {
  id: string;
  organization: string;
  funder: string;
  opportunity: string;
  deadline: string | null;
  requestedAmount: string | null;
  geography: string | null;
  programArea: string | null;
  organizationType: string | null;
  proposalVersion: string;
};

export type FullAnalysis = {
  schema_version: "1.0";
  generated_at: string;
  models: { fast: string; analysis: string };
  facts: FactExtraction;
  funder_research: FunderResearch;
  due_diligence: DueDiligence;
  reviewer_panel: ReviewerPanel;
  adjudication: Adjudication;
};

function client() {
  const env = requireRuntimeEnv();
  return new OpenAI({ apiKey: env.OPENAI_API_KEY });
}

function models() {
  const env = requireRuntimeEnv();
  return {
    fast: env.OPENAI_FAST_MODEL || "gpt-5.6-terra",
    analysis: env.OPENAI_ANALYSIS_MODEL || "gpt-5.6",
  };
}

function fileContent(documents: AnalysisDocument[], intro: string) {
  return [
    { type: "input_text" as const, text: intro },
    ...documents.flatMap((document) => [
      {
        type: "input_text" as const,
        text: `Document: ${document.filename}\nCategory: ${document.category}\nSource classification: ${document.sourceType}`,
      },
      { type: "input_file" as const, file_id: document.openaiFileId },
    ]),
  ];
}

async function parseStructured<T>({
  model,
  system,
  content,
  schema,
  schemaName,
  effort,
  safetyId,
  tools,
}: {
  model: string;
  system: string;
  content: Array<Record<string, unknown>>;
  schema: Parameters<typeof zodTextFormat>[0];
  schemaName: string;
  effort: "low" | "medium" | "high";
  safetyId: string;
  tools?: Array<Record<string, unknown>>;
}): Promise<T> {
  const openai = client();
  const response = await openai.responses.parse({
    model,
    instructions: system,
    input: [{ role: "user", content: content as never }],
    reasoning: { effort },
    text: { format: zodTextFormat(schema, schemaName) },
    safety_identifier: safetyId,
    tools: tools as never,
    store: false,
  });
  if (!response.output_parsed) {
    throw new Error(`${schemaName} returned no schema-validated output.`);
  }
  return response.output_parsed as T;
}

export async function uploadFileToOpenAI(file: File) {
  const openai = client();
  return openai.files.create({ file, purpose: "user_data" });
}

export async function deleteOpenAIFile(fileId: string) {
  try {
    await client().files.delete(fileId);
  } catch (error) {
    console.warn("OpenAI file deletion could not be confirmed", error instanceof Error ? error.message : "Unknown error");
  }
}

export async function runAnalysisPipeline({
  workspace,
  documents,
  ownerEmail,
  onStage,
}: {
  workspace: AnalysisWorkspace;
  documents: AnalysisDocument[];
  ownerEmail: string;
  onStage: (stage: string) => Promise<void>;
}): Promise<FullAnalysis> {
  const selectedModels = models();
  const safetyId = await safetyIdentifier(ownerEmail);
  const context = {
    organization: workspace.organization,
    funder: workspace.funder,
    opportunity: workspace.opportunity,
    deadline: workspace.deadline ?? "not supplied",
    requested_amount: workspace.requestedAmount ?? "not supplied",
    geography: workspace.geography ?? "not supplied",
    program_area: workspace.programArea ?? "not supplied",
    organization_type: workspace.organizationType ?? "not supplied",
    proposal_version: workspace.proposalVersion,
  };

  await onStage("extracting_facts");
  const facts = await parseStructured<FactExtraction>({
    model: selectedModels.fast,
    system: FACT_EXTRACTION_PROMPT,
    content: fileContent(
      documents,
      `Workspace facts supplied by the user:\n${JSON.stringify(context, null, 2)}\nExtract facts from the attached materials.`,
    ),
    schema: FactExtractionSchema,
    schemaName: "grant_fact_extraction",
    effort: "low",
    safetyId,
  });

  await onStage("researching_funder");
  const funderResearch = await parseStructured<FunderResearch>({
    model: selectedModels.analysis,
    system: FUNDER_RESEARCH_PROMPT,
    content: [
      {
        type: "input_text",
        text: `Research only this public funder context:\n${JSON.stringify(
          {
            funder: workspace.funder,
            opportunity: workspace.opportunity,
            geography: workspace.geography,
            program_area: workspace.programArea,
            accessed_date: new Date().toISOString().slice(0, 10),
          },
          null,
          2,
        )}`,
      },
    ],
    schema: FunderResearchSchema,
    schemaName: "funder_intelligence",
    effort: "medium",
    safetyId,
    tools: [{ type: "web_search", search_context_size: "medium" }],
  });

  await onStage("running_due_diligence");
  const dueDiligence = await parseStructured<DueDiligence>({
    model: selectedModels.analysis,
    system: DUE_DILIGENCE_PROMPT,
    content: fileContent(
      documents,
      `Confirmed workspace context:\n${JSON.stringify(context, null, 2)}

Extracted facts and eligibility requirements:
${JSON.stringify(facts, null, 2)}

Public funder intelligence:
${JSON.stringify(funderResearch, null, 2)}

Conduct the full due diligence review.`,
    ),
    schema: DueDiligenceSchema,
    schemaName: "proposal_due_diligence",
    effort: "high",
    safetyId,
  });

  await onStage("simulating_reviewers");
  const reviewerPanel = await parseStructured<ReviewerPanel>({
    model: selectedModels.analysis,
    system: REVIEWER_PROMPT,
    content: [
      {
        type: "input_text",
        text: `Workspace:\n${JSON.stringify(context, null, 2)}

Extracted facts:
${JSON.stringify(facts, null, 2)}

Funder intelligence:
${JSON.stringify(funderResearch, null, 2)}

Due diligence:
${JSON.stringify(dueDiligence, null, 2)}`,
      },
    ],
    schema: ReviewerPanelSchema,
    schemaName: "skeptical_reviewer_panel",
    effort: "high",
    safetyId,
  });

  await onStage("adjudicating");
  const adjudication = await parseStructured<Adjudication>({
    model: selectedModels.analysis,
    system: ADJUDICATION_PROMPT,
    content: [
      {
        type: "input_text",
        text: `Workspace:\n${JSON.stringify(context, null, 2)}

Facts:
${JSON.stringify(facts, null, 2)}

Funder intelligence:
${JSON.stringify(funderResearch, null, 2)}

Due diligence:
${JSON.stringify(dueDiligence, null, 2)}

Reviewer panel:
${JSON.stringify(reviewerPanel, null, 2)}`,
      },
    ],
    schema: AdjudicationSchema,
    schemaName: "grant_adjudication",
    effort: "high",
    safetyId,
  });

  return {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    models: selectedModels,
    facts,
    funder_research: funderResearch,
    due_diligence: dueDiligence,
    reviewer_panel: reviewerPanel,
    adjudication,
  };
}
