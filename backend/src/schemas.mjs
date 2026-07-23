import { z } from "zod";

export const confidence = z.enum(["high", "medium", "low"]);
export const severity = z.enum(["blocker", "high", "medium", "low"]);
export const fixCategory = z.enum([
  "writing_or_framing", "missing_evidence", "program_design", "partnership", "budget",
  "staffing_or_capacity", "monitoring_and_evaluation", "governance_or_risk",
  "funder_mismatch", "eligibility_or_compliance",
]);

export const FactExtractionSchema = z.object({
  applicant_identity: z.string(),
  requested_amount: z.string(),
  project_period: z.string(),
  geography: z.string(),
  target_population: z.string(),
  proposed_activities: z.array(z.string()),
  intended_outcomes: z.array(z.string()),
  partners: z.array(z.string()),
  staffing: z.array(z.string()),
  budget_total: z.string(),
  funder_requirements: z.array(z.object({
    requirement: z.string(), governing_quote: z.string(), source_document: z.string(),
    status: z.enum(["satisfied", "likely_satisfied", "unclear", "likely_unmet", "unmet"]),
    explanation: z.string(),
  })),
  conflicts: z.array(z.object({
    field: z.string(), values: z.array(z.string()), source_locations: z.array(z.string()),
  })),
  missing_expected_documents: z.array(z.string()),
});

export const FunderResearchSchema = z.object({
  researched_at: z.string(),
  data_period: z.string(),
  coverage_limitations: z.array(z.string()),
  profile: z.object({
    mission: z.string(), current_program_areas: z.array(z.string()), geographic_focus: z.array(z.string()),
    typical_award_size: z.string(), grant_duration: z.string(), organization_types: z.array(z.string()),
    selection_principles: z.array(z.string()), exclusions: z.array(z.string()), application_process: z.string(),
  }),
  comparable_grants: z.array(z.object({
    grantee: z.string(), amount: z.string(), year: z.string(), purpose: z.string(),
    similarity: z.string(), source_url: z.string(),
  })),
  fit_strengths: z.array(z.string()),
  fit_weaknesses: z.array(z.string()),
  unknowns: z.array(z.string()),
  suggested_positioning: z.array(z.string()),
  opportunity_cost: z.object({
    complexity: z.string(), staff_effort: z.string(), relationship_dependency: z.string(), revision_burden: z.string(),
  }),
  sources: z.array(z.object({
    title: z.string(), publisher: z.string(), publication_date: z.string(), accessed_date: z.string(),
    source_type: z.enum(["funder_primary", "external_primary", "institutional_secondary", "reporting", "commentary"]),
    url: z.string(), reliability_tier: z.number().int().min(1).max(7), notes: z.string(),
  })),
  confidence,
});

const FindingSchema = z.object({
  module: z.string(), title: z.string(), finding: z.string(), severity, confidence,
  evidence: z.array(z.string()), required_fix: z.string(), fix_category: fixCategory,
});

const ClaimSchema = z.object({
  claim_id: z.string(), claim_text: z.string(), claim_type: z.string(),
  proposal_location: z.object({ document: z.string(), page_or_section: z.string() }),
  importance: z.enum(["load_bearing", "high", "medium", "low"]),
  evidence_status: z.enum(["supported", "partially_supported", "unsupported", "contradicted", "unverifiable", "aspirational", "not_material"]),
  supporting_sources: z.array(z.string()), contradicting_sources: z.array(z.string()),
  source_quality: z.enum(["high", "medium", "low", "none"]), confidence,
  issue: z.string(), required_fix: z.string(), fix_category: fixCategory,
});

export const DueDiligenceSchema = z.object({
  dimensions: z.array(z.object({
    name: z.string(), weight: z.number().int(), rating: z.number().int().min(1).max(5),
    confidence, rationale: z.string(), evidence: z.array(z.string()),
  })),
  findings: z.array(FindingSchema),
  claims: z.array(ClaimSchema),
  mandatory_penalties: z.array(z.object({ penalty: z.string(), points: z.number().int(), evidence: z.string() })),
  evidence_coverage: z.object({
    load_bearing_supported_percent: z.number().min(0).max(100),
    high_importance_supported_percent: z.number().min(0).max(100),
    contradicted_claims: z.number().int(), unverifiable_claims: z.number().int(), interpretation: z.string(),
  }),
  specialist_reviews_required: z.array(z.string()),
});

export const ReviewerPanelSchema = z.object({
  reviewers: z.array(z.object({
    persona: z.string(),
    recommendation: z.enum(["fund", "fund_with_conditions", "decline", "insufficient_information"]),
    positive_finding: z.string(), rejection_reasons: z.array(z.string()), questions: z.array(z.string()), confidence,
  })),
  rejection_memo: z.object({
    recommendation: z.string(), strongest_rejection_reasons: z.array(z.string()),
    evidence_for_rejection: z.array(z.string()), evidence_that_could_change_recommendation: z.array(z.string()),
    remaining_uncertainty: z.array(z.string()),
  }),
  five_damaging_questions: z.array(z.string()).length(5),
  reviewer_disagreement: z.array(z.string()),
  failure_premortem: z.array(z.object({
    cause: z.string(), earliest_warning_sign: z.string(), preventive_action: z.string(),
    owner: z.string(), monitoring_indicator: z.string(),
  })),
});

export const AdjudicationSchema = z.object({
  eligibility: z.enum(["eligible", "likely_eligible", "unclear", "likely_ineligible", "ineligible"]),
  eligibility_basis: z.string(),
  proposal_merit: z.enum(["deserves_to_win", "competitive_with_fixable_weaknesses", "borderline", "does_not_yet_deserve_funding", "do_not_submit_to_this_funder"]),
  funder_fit: z.enum(["high", "medium", "low", "unknown"]),
  competitive_readiness: z.enum(["ready", "conditional", "not_ready"]),
  recommendation: z.enum(["go", "conditional_go", "no_go"]),
  confidence,
  diagnostic_score: z.number().int().min(0).max(100),
  strongest_reason_to_fund: z.string(),
  strongest_reason_to_reject: z.string(),
  submission_blockers: z.array(z.string()),
  decision_logic: z.string(),
  revision_priorities: z.array(z.object({
    rank: z.number().int(), title: z.string(), decision_impact: z.enum(["very_high", "high", "medium", "low"]),
    severity, effort: z.enum(["low", "medium", "high"]), feasible_before_deadline: z.enum(["yes", "no", "unclear"]),
    required_fix: z.string(), fix_category: fixCategory, evidence_basis: z.array(z.string()),
  })),
  citation_audit: z.object({
    passed: z.boolean(), unsupported_final_claims: z.array(z.string()), weak_sources: z.array(z.string()),
    conflicts: z.array(z.string()), notes: z.array(z.string()),
  }),
  limitations: z.array(z.string()),
});
