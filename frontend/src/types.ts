export type Workspace = {
  id: string;
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
  document_count?: number;
  review_count?: number;
};

export type DocumentRow = {
  id: string; filename: string; category: string; source_type: string; size_bytes: number;
};
export type ReviewRow = {
  id: string; version: number; status: string; stage: string; recommendation: string | null;
  completion_state?: string | null; score: number | null; error_code?: string | null;
  error_message?: string | null; correlation_id?: string | null; created_at: string;
};
export type FactRow = {
  id: string; fact_key: string; extracted_value: string | null; confirmed_value: string | null;
  confidence: string; updated_at: string;
};
export type Bundle = {
  workspace: Workspace; documents: DocumentRow[]; reviews: ReviewRow[]; facts: FactRow[];
};
export type Analysis = {
  generated_at: string;
  manifest?: {
    manifest_version: string; correlation_id: string | null; completion_state: string;
    source_snapshot_id: string; rubric_version: string;
    prompts: Record<string, { version: string; sha256: string }>;
    modules: Array<{ module_id: string; version: string; status: string; error_code: string | null }>;
    errors: Array<{ code: string; module_id: string; message: string }>;
  };
  pipeline?: {
    version: string; status?: string; partial: boolean; warnings: string[];
    errors?: Array<{ code: string; module_id: string; message: string }>; funder_cache: string;
    layer_1_ms: number; layer_2_ms: number; total_ms: number;
  };
  adjudication: {
    recommendation: string; proposal_merit: string; eligibility: string; eligibility_basis: string;
    funder_fit: string; competitive_readiness: string; confidence: string; diagnostic_score: number;
    decision_logic: string; strongest_reason_to_fund: string; strongest_reason_to_reject: string;
    submission_blockers: string[];
    revision_priorities: Array<{
      rank: number; title: string; severity: string; fix_category: string; required_fix: string;
    }>;
    limitations: string[];
  };
  due_diligence: {
    dimensions: Array<{ name: string; rating: number; weight: number; confidence: string; rationale: string }>;
    claims: Array<{
      claim_id: string; claim_text: string; importance: string; evidence_status: string;
      source_quality: string; confidence: string; issue: string; required_fix: string;
    }>;
  };
  reviewer_panel: {
    five_damaging_questions: string[];
    reviewers: Array<{ persona: string; recommendation: string; rejection_reasons: string[] }>;
  };
  funder_research: {
    sources: Array<{
      title: string; publisher: string; publication_date: string; url: string; reliability_tier: number;
    }>;
  };
};
