import { query } from "./db.mjs";
import { newId } from "./http.mjs";

export async function audit(ownerHash, action, entityType, entityId, workspaceId, metadata = {}) {
  await query(
    `INSERT INTO audit_events(id, workspace_id, owner_hash, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [newId("aud"), workspaceId, ownerHash, action, entityType, entityId, JSON.stringify(metadata)],
  );
}

export async function ownedWorkspace(workspaceId, ownerHash) {
  const rows = await query("SELECT * FROM workspaces WHERE id = $1 AND owner_hash = $2", [workspaceId, ownerHash]);
  return rows[0] || null;
}

export async function persistAnalysis(reviewId, workspaceId, analysis) {
  for (const finding of analysis.due_diligence.findings) {
    await query(
      `INSERT INTO findings
       (id, review_id, workspace_id, module, title, finding, severity, confidence, evidence, fix_category, required_fix)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`,
      [newId("fnd"), reviewId, workspaceId, finding.module, finding.title, finding.finding,
        finding.severity, finding.confidence, JSON.stringify(finding.evidence), finding.fix_category, finding.required_fix],
    );
  }
  for (const claim of analysis.due_diligence.claims) {
    await query(
      `INSERT INTO claims
       (id, review_id, workspace_id, claim_text, claim_type, location, importance, evidence_status,
        supporting_sources, contradicting_sources, source_quality, confidence, issue, required_fix, fix_category)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15)`,
      [newId("clm"), reviewId, workspaceId, claim.claim_text, claim.claim_type,
        JSON.stringify(claim.proposal_location), claim.importance, claim.evidence_status,
        JSON.stringify(claim.supporting_sources), JSON.stringify(claim.contradicting_sources),
        claim.source_quality, claim.confidence, claim.issue, claim.required_fix, claim.fix_category],
    );
  }
  for (const source of analysis.funder_research.sources) {
    await query(
      `INSERT INTO sources
       (id, review_id, workspace_id, title, publisher, publication_date, accessed_date,
        source_type, url, reliability_tier, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [newId("src"), reviewId, workspaceId, source.title, source.publisher,
        source.publication_date || null, source.accessed_date, source.source_type,
        source.url || null, source.reliability_tier, source.notes],
    );
  }
  for (const [key, value] of Object.entries(analysis.facts).filter(([, value]) => typeof value === "string")) {
    await query(
      `INSERT INTO facts(id, workspace_id, fact_key, extracted_value, source_ref, confidence)
       VALUES ($1,$2,$3,$4,'analysis extraction','medium')
       ON CONFLICT(workspace_id, fact_key) DO UPDATE SET
         extracted_value = EXCLUDED.extracted_value, updated_at = NOW()`,
      [newId("fac"), workspaceId, key, value],
    );
  }
}
