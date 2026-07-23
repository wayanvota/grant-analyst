import type { FullAnalysis } from "./openai";
import { id, now } from "./server";
import { runtimeEnv } from "./runtime";

export async function persistFullAnalysis(
  reviewId: string,
  workspaceId: string,
  analysis: FullAnalysis,
) {
  const env = runtimeEnv();
  const timestamp = now();
  const findings = analysis.due_diligence.findings.map((finding) =>
    env.DB.prepare(
      `INSERT INTO findings
       (id, review_id, workspace_id, module, title, finding, severity, confidence,
        evidence_json, fix_category, required_fix, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id("fnd"),
      reviewId,
      workspaceId,
      finding.module,
      finding.title,
      finding.finding,
      finding.severity,
      finding.confidence,
      JSON.stringify(finding.evidence),
      finding.fix_category,
      finding.required_fix,
      timestamp,
    ),
  );

  const claims = analysis.due_diligence.claims.map((claim) =>
    env.DB.prepare(
      `INSERT INTO claims
       (id, review_id, workspace_id, claim_text, claim_type, location_json, importance,
        evidence_status, supporting_sources_json, contradicting_sources_json,
        source_quality, confidence, issue, required_fix, fix_category, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id("clm"),
      reviewId,
      workspaceId,
      claim.claim_text,
      claim.claim_type,
      JSON.stringify(claim.proposal_location),
      claim.importance,
      claim.evidence_status,
      JSON.stringify(claim.supporting_sources),
      JSON.stringify(claim.contradicting_sources),
      claim.source_quality,
      claim.confidence,
      claim.issue,
      claim.required_fix,
      claim.fix_category,
      timestamp,
    ),
  );

  const sources = analysis.funder_research.sources.map((source) =>
    env.DB.prepare(
      `INSERT INTO sources
       (id, review_id, workspace_id, title, publisher, publication_date, accessed_date,
        source_type, url, document_id, reliability_tier, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id("src"),
      reviewId,
      workspaceId,
      source.title,
      source.publisher,
      source.publication_date || null,
      source.accessed_date,
      source.source_type,
      source.url,
      null,
      source.reliability_tier,
      source.notes,
      timestamp,
    ),
  );

  const factEntries = Object.entries(analysis.facts).filter(
    ([, value]) => typeof value === "string",
  );
  const facts = factEntries.map(([key, value]) =>
    env.DB.prepare(
      `INSERT INTO facts
       (id, workspace_id, fact_key, extracted_value, confirmed_value, source_ref,
        confidence, confirmed_by, confirmed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(workspace_id, fact_key) DO UPDATE SET
         extracted_value = excluded.extracted_value,
         updated_at = excluded.updated_at`,
    ).bind(
      id("fac"),
      workspaceId,
      key,
      String(value),
      null,
      "analysis extraction",
      "medium",
      null,
      null,
      timestamp,
      timestamp,
    ),
  );

  const statements = [...findings, ...claims, ...sources, ...facts];
  for (let offset = 0; offset < statements.length; offset += 80) {
    await env.DB.batch(statements.slice(offset, offset + 80));
  }
}

export function markdownReport(workspace: Record<string, unknown>, analysis: FullAnalysis) {
  const final = analysis.adjudication;
  const due = analysis.due_diligence;
  const research = analysis.funder_research;
  const reviewers = analysis.reviewer_panel;
  return `# Grant Analyst Decision Memo

## ${workspace.organization} → ${workspace.funder}

**Opportunity:** ${workspace.opportunity}  
**Generated:** ${analysis.generated_at}  
**Recommendation:** ${final.recommendation.replaceAll("_", " ").toUpperCase()}  
**Proposal merit:** ${final.proposal_merit.replaceAll("_", " ")}  
**Eligibility:** ${final.eligibility.replaceAll("_", " ")}  
**Funder fit:** ${final.funder_fit}  
**Competitive readiness:** ${final.competitive_readiness.replaceAll("_", " ")}  
**Confidence:** ${final.confidence}  

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

${final.revision_priorities
  .sort((a, b) => a.rank - b.rank)
  .map((item) => `${item.rank}. **${item.title}** (${item.severity}, ${item.fix_category})\n   ${item.required_fix}`)
  .join("\n")}

## Reviewer panel

${reviewers.reviewers
  .map((reviewer) => `### ${reviewer.persona}\n\n**Recommendation:** ${reviewer.recommendation}\n\n${reviewer.rejection_reasons.map((reason) => `- ${reason}`).join("\n")}`)
  .join("\n\n")}

## Five damaging questions

${reviewers.five_damaging_questions.map((question, index) => `${index + 1}. ${question}`).join("\n")}

## Claim and evidence ledger

${due.claims
  .map(
    (claim) => `### ${claim.claim_id}: ${claim.evidence_status}

${claim.claim_text}

- Importance: ${claim.importance}
- Location: ${claim.proposal_location.document}, ${claim.proposal_location.page_or_section}
- Issue: ${claim.issue}
- Required fix: ${claim.required_fix}`,
  )
  .join("\n\n")}

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
