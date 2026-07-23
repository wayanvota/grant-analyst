export function markdownReport(workspace, analysis) {
  const final = analysis.adjudication;
  const due = analysis.due_diligence;
  const research = analysis.funder_research;
  const reviewers = analysis.reviewer_panel;
  return `# Grant Analyst Decision Memo

## ${workspace.organization} to ${workspace.funder}

**Opportunity:** ${workspace.opportunity}  
**Generated:** ${analysis.generated_at}  
**Recommendation:** ${final.recommendation.replaceAll("_", " ").toUpperCase()}  
**Proposal merit:** ${final.proposal_merit.replaceAll("_", " ")}  
**Eligibility:** ${final.eligibility.replaceAll("_", " ")}  
**Funder fit:** ${final.funder_fit}  
**Competitive readiness:** ${final.competitive_readiness.replaceAll("_", " ")}  
**Confidence:** ${final.confidence}  
**Diagnostic score:** ${final.diagnostic_score}/100

> This is an evidence-based merit and fit assessment, not a prediction of funding.

## Decision

${final.decision_logic}

**Strongest reason to fund:** ${final.strongest_reason_to_fund}

**Strongest reason to reject:** ${final.strongest_reason_to_reject}

## Eligibility

${final.eligibility_basis}

## Submission blockers

${final.submission_blockers.length ? final.submission_blockers.map((item) => `- ${item}`).join("\n") : "- No confirmed blocker identified"}

## Merit scorecard

| Dimension | Rating | Weight | Confidence | Rationale |
|---|---:|---:|---|---|
${due.dimensions.map((item) => `| ${item.name} | ${item.rating}/5 | ${item.weight} | ${item.confidence} | ${item.rationale} |`).join("\n")}

## Revision priorities

${[...final.revision_priorities].sort((a, b) => a.rank - b.rank).map((item) =>
  `${item.rank}. **${item.title}** (${item.severity}, ${item.fix_category})\n   ${item.required_fix}`).join("\n")}

## Reviewer panel

${reviewers.reviewers.map((reviewer) =>
  `### ${reviewer.persona}\n\n**Recommendation:** ${reviewer.recommendation}\n\n${reviewer.rejection_reasons.map((reason) => `- ${reason}`).join("\n")}`).join("\n\n")}

## Five damaging questions

${reviewers.five_damaging_questions.map((question, index) => `${index + 1}. ${question}`).join("\n")}

## Claim and evidence ledger

${due.claims.map((claim) => `### ${claim.claim_id}: ${claim.evidence_status}

${claim.claim_text}

- Importance: ${claim.importance}
- Location: ${claim.proposal_location.document}, ${claim.proposal_location.page_or_section}
- Issue: ${claim.issue}
- Required fix: ${claim.required_fix}`).join("\n\n")}

## Funder intelligence sources

${research.sources.map((source) => `- [${source.title}](${source.url}) (${source.publisher}, ${source.publication_date || "date unavailable"})`).join("\n")}

## Citation audit

**Passed:** ${final.citation_audit.passed ? "Yes" : "No"}

${final.citation_audit.unsupported_final_claims.map((claim) => `- Unsupported: ${claim}`).join("\n")}
${final.citation_audit.conflicts.map((conflict) => `- Conflict: ${conflict}`).join("\n")}

## Limitations

${final.limitations.map((item) => `- ${item}`).join("\n")}
`;
}
