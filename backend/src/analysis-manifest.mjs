import crypto from "node:crypto";
import { config } from "./config.mjs";
import {
  FAST_DECISION_PROMPT,
  FUNDER_RESEARCH_PROMPT,
  PROPOSAL_ASSESSMENT_PROMPT,
  PROMPT_VERSIONS,
  RUBRIC_VERSION,
} from "./prompts.mjs";

export const MANIFEST_VERSION = "1.0";
export const MODULE_VERSIONS = Object.freeze({
  orchestrator: "1.0.0",
  proposal_assessment: "1.0.0",
  funder_research: "1.0.0",
  decision: "1.0.0",
});

function hash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function snapshotId(documents) {
  const snapshot = documents.map((document) => ({
    id: document.id,
    filename: document.filename,
    category: document.category,
    source_type: document.source_type,
    content_sha256: document.content_sha256 || null,
  })).sort((left, right) => String(left.id).localeCompare(String(right.id)));
  return `ss_${hash(JSON.stringify(stable(snapshot)))}`;
}

export function promptManifest() {
  return {
    proposal_assessment: {
      version: PROMPT_VERSIONS.proposal_assessment,
      sha256: hash(PROPOSAL_ASSESSMENT_PROMPT),
    },
    funder_research: {
      version: PROMPT_VERSIONS.funder_research,
      sha256: hash(FUNDER_RESEARCH_PROMPT),
    },
    decision: {
      version: PROMPT_VERSIONS.decision,
      sha256: hash(FAST_DECISION_PROMPT),
    },
  };
}

export function createAnalysisManifest({
  reviewId,
  workspace,
  documents,
  correlationId,
  startedAt,
  completedAt,
  completionState,
  moduleRuns,
  providerRequests,
  errors,
}) {
  return {
    manifest_version: MANIFEST_VERSION,
    review_id: reviewId,
    workspace_id: workspace.id,
    proposal_version: workspace.proposal_version,
    confirmed_fact_snapshot_id: null,
    source_snapshot_id: snapshotId(documents),
    schema_version: "2.0",
    rubric_version: RUBRIC_VERSION,
    pipeline_version: "two_layer_fast_v1",
    correlation_id: correlationId,
    completion_state: completionState,
    started_at: startedAt,
    completed_at: completedAt,
    prompts: promptManifest(),
    modules: [...moduleRuns].sort((left, right) => (
      Object.keys(MODULE_VERSIONS).indexOf(left.module_id)
      - Object.keys(MODULE_VERSIONS).indexOf(right.module_id)
    )).map((run) => ({
      ...run,
      version: MODULE_VERSIONS[run.module_id],
    })),
    provider: {
      name: "openai",
      models: { fast: config.fastModel, analysis: config.analysisModel },
      requests: providerRequests,
      store_responses: false,
    },
    configuration: {
      proposal_timeout_ms: config.proposalTimeoutMs,
      funder_timeout_ms: config.funderTimeoutMs,
      decision_timeout_ms: config.decisionTimeoutMs,
      funder_cache_days: config.funderCacheDays,
    },
    errors,
  };
}
