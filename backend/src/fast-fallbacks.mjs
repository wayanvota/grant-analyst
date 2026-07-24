function technicalReason(reason) {
  return reason instanceof Error ? reason.message : String(reason || "The timed analysis did not complete.");
}

export function fallbackProposalAssessment(workspace, documents, reason) {
  const explanation = technicalReason(reason);
  return {
    facts: {
      applicant_identity: workspace.organization || "Not supplied",
      requested_amount: workspace.requested_amount || "Not supplied",
      project_period: "Not established",
      geography: workspace.geography || "Not supplied",
      target_population: "Not established",
      proposed_activities: [],
      intended_outcomes: [],
      partners: [],
      staffing: [],
      budget_total: workspace.requested_amount || "Not established",
      funder_requirements: [],
      conflicts: [],
      missing_expected_documents: [
        `The timed proposal assessment was incomplete: ${explanation}`,
        ...(!documents.length ? ["No proposal documents were available."] : []),
      ],
    },
    due_diligence: {
      dimensions: [{
        name: "Evidence completeness",
        weight: 100,
        rating: 1,
        confidence: "low",
        rationale: "The timed assessment did not produce a complete evidence review.",
        evidence: ["[SOURCE NEEDED] Complete the proposal assessment before relying on this result."],
      }],
      findings: [{
        module: "Fast review safeguard",
        title: "Proposal assessment incomplete",
        finding: "The system could not complete the proposal assessment within its time budget.",
        severity: "blocker",
        confidence: "high",
        evidence: [`Technical limitation: ${explanation}`],
        required_fix: "Run the analysis again or complete a manual review before submission.",
        fix_category: "missing_evidence",
      }],
      claims: [],
      mandatory_penalties: [],
      evidence_coverage: {
        load_bearing_supported_percent: 0,
        high_importance_supported_percent: 0,
        contradicted_claims: 0,
        unverifiable_claims: 0,
        interpretation: "Evidence coverage was not calculated because the timed assessment was incomplete.",
      },
      specialist_reviews_required: ["Human proposal and eligibility review"],
    },
  };
}

export function fallbackFunderResearch(workspace, reason) {
  const explanation = technicalReason(reason);
  return {
    researched_at: new Date().toISOString(),
    data_period: "Not established",
    coverage_limitations: [
      `The timed public-source research was incomplete: ${explanation}`,
      "[SOURCE NEEDED] Verify all funder requirements against current primary materials.",
    ],
    profile: {
      mission: "[SOURCE NEEDED]",
      current_program_areas: [],
      geographic_focus: workspace.geography ? [workspace.geography] : [],
      typical_award_size: "[SOURCE NEEDED]",
      grant_duration: "[SOURCE NEEDED]",
      organization_types: [],
      selection_principles: [],
      exclusions: [],
      application_process: "[SOURCE NEEDED]",
    },
    comparable_grants: [],
    fit_strengths: [],
    fit_weaknesses: [],
    unknowns: [
      `Current requirements for ${workspace.funder || "the funder"} and ${workspace.opportunity || "the opportunity"}.`,
    ],
    suggested_positioning: ["Do not rely on funder-fit conclusions until current primary sources are reviewed."],
    opportunity_cost: {
      complexity: "Unknown",
      staff_effort: "Unknown",
      relationship_dependency: "Unknown",
      revision_burden: "Unknown",
    },
    sources: [],
    confidence: "low",
  };
}

export function fallbackDecision(assessment, funderResearch, reason) {
  const explanation = technicalReason(reason);
  const proposalIncomplete = assessment.due_diligence.findings.some(
    (finding) => finding.module === "Fast review safeguard",
  );
  const researchIncomplete = funderResearch.sources.length === 0;
  const blockers = [
    ...(proposalIncomplete ? ["Complete the proposal evidence assessment."] : []),
    ...(researchIncomplete ? ["Verify eligibility and funder fit against current primary sources."] : []),
  ];
  if (!blockers.length) blockers.push("Complete a human review of the generated assessment before submission.");
  return {
    reviewer_panel: {
      reviewers: [{
        persona: "Fast review safeguard",
        recommendation: "insufficient_information",
        positive_finding: "The proposal remains available for a complete rerun or human review.",
        rejection_reasons: blockers,
        questions: ["What evidence is required to complete the timed review?"],
        confidence: "high",
      }],
      rejection_memo: {
        recommendation: "Do not submit based on this incomplete automated review.",
        strongest_rejection_reasons: blockers,
        evidence_for_rejection: [`Technical limitation: ${explanation}`],
        evidence_that_could_change_recommendation: ["A complete evidence-backed proposal and funder review."],
        remaining_uncertainty: ["Proposal merit, eligibility, funder fit, and competitive readiness remain unresolved."],
      },
      five_damaging_questions: [
        "Does the applicant meet every current eligibility requirement?",
        "Which load-bearing proposal claims are supported by primary evidence?",
        "Does the budget support the proposed scope and delivery model?",
        "Are the proposed outcomes measurable and attributable?",
        "What current funder evidence establishes strategic fit?",
      ],
      reviewer_disagreement: [],
      failure_premortem: [{
        cause: "A submission decision was made from an incomplete timed review.",
        earliest_warning_sign: "Missing sources or unresolved eligibility requirements remain in the report.",
        preventive_action: "Complete a human review or rerun the analysis before submission.",
        owner: "Proposal lead",
        monitoring_indicator: "All blockers and [SOURCE NEEDED] items are resolved.",
      }],
    },
    adjudication: {
      eligibility: "unclear",
      eligibility_basis: "The timed decision layer did not establish eligibility.",
      proposal_merit: "borderline",
      funder_fit: "unknown",
      competitive_readiness: "not_ready",
      recommendation: "no_go",
      confidence: "low",
      diagnostic_score: 0,
      strongest_reason_to_fund: "A complete assessment may identify fundable strengths.",
      strongest_reason_to_reject: "The available result is incomplete and cannot support a submission decision.",
      submission_blockers: blockers,
      decision_logic: "The safe result is no_go until the missing assessment and source verification are completed.",
      revision_priorities: [{
        rank: 1,
        title: "Complete the evidence-backed review",
        decision_impact: "very_high",
        severity: "blocker",
        effort: "medium",
        feasible_before_deadline: "unclear",
        required_fix: "Rerun the analysis or complete a manual proposal, eligibility, and funder review.",
        fix_category: "missing_evidence",
        evidence_basis: [`Technical limitation: ${explanation}`],
      }],
      citation_audit: {
        passed: false,
        unsupported_final_claims: ["Eligibility, merit, funder fit, and readiness were not fully adjudicated."],
        weak_sources: researchIncomplete ? ["No current funder source was available in the timed result."] : [],
        conflicts: [],
        notes: ["This is a clearly marked safeguard result, not a complete grant assessment."],
      },
      limitations: [`The timed decision layer was incomplete: ${explanation}`],
    },
  };
}
