import { HttpError, ownedWorkspace } from "./server";
import { runtimeEnv } from "./runtime";

export const WORKSPACE_FIELDS = [
  "organization",
  "funder",
  "opportunity",
  "deadline",
  "requested_amount",
  "geography",
  "program_area",
  "organization_type",
  "proposal_version",
] as const;

export type WorkspaceRow = {
  id: string;
  owner_email: string;
  organization: string;
  funder: string;
  opportunity: string;
  deadline: string | null;
  requested_amount: string | null;
  geography: string | null;
  program_area: string | null;
  organization_type: string | null;
  proposal_version: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export async function workspaceBundle(workspaceId: string, ownerEmail: string) {
  const env = runtimeEnv();
  const workspace = await ownedWorkspace(workspaceId, ownerEmail) as WorkspaceRow;
  const [documents, reviews, facts, corrections] = await Promise.all([
    env.DB.prepare(
      `SELECT id, category, source_type, filename, mime_type, size_bytes,
              processing_status, created_at
       FROM documents WHERE workspace_id = ? AND owner_email = ? ORDER BY created_at DESC`,
    ).bind(workspaceId, ownerEmail).all(),
    env.DB.prepare(
      `SELECT id, version, status, stage, review_type, eligibility_result, final_verdict,
              recommendation, confidence, score, error_message, created_at, completed_at
       FROM reviews WHERE workspace_id = ? AND owner_email = ? ORDER BY version DESC`,
    ).bind(workspaceId, ownerEmail).all(),
    env.DB.prepare(
      `SELECT id, fact_key, extracted_value, confirmed_value, source_ref, confidence,
              confirmed_by, confirmed_at, updated_at
       FROM facts WHERE workspace_id = ? ORDER BY fact_key`,
    ).bind(workspaceId).all(),
    env.DB.prepare(
      `SELECT id, review_id, target_type, target_id, field, previous_value,
              corrected_value, reason, created_at
       FROM corrections WHERE workspace_id = ? AND owner_email = ? ORDER BY created_at DESC`,
    ).bind(workspaceId, ownerEmail).all(),
  ]);
  return {
    workspace,
    documents: documents.results,
    reviews: reviews.results,
    facts: facts.results,
    corrections: corrections.results,
  };
}

export function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, `${label} is required.`);
  }
  return value.trim();
}

export function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
