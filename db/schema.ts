import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    ownerEmail: text("owner_email").notNull(),
    organization: text("organization").notNull(),
    funder: text("funder").notNull(),
    opportunity: text("opportunity").notNull(),
    deadline: text("deadline"),
    requestedAmount: text("requested_amount"),
    geography: text("geography"),
    programArea: text("program_area"),
    organizationType: text("organization_type"),
    proposalVersion: text("proposal_version").notNull().default("1"),
    status: text("status").notNull().default("draft"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("workspaces_owner_updated_idx").on(table.ownerEmail, table.updatedAt),
  ],
);

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    ownerEmail: text("owner_email").notNull(),
    category: text("category").notNull(),
    sourceType: text("source_type").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    r2Key: text("r2_key").notNull(),
    openaiFileId: text("openai_file_id"),
    processingStatus: text("processing_status").notNull().default("ready"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("documents_workspace_idx").on(table.workspaceId, table.createdAt),
  ],
);

export const facts = sqliteTable(
  "facts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    factKey: text("fact_key").notNull(),
    extractedValue: text("extracted_value"),
    confirmedValue: text("confirmed_value"),
    sourceRef: text("source_ref"),
    confidence: text("confidence").notNull().default("low"),
    confirmedBy: text("confirmed_by"),
    confirmedAt: text("confirmed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("facts_workspace_key_unique").on(table.workspaceId, table.factKey),
  ],
);

export const reviews = sqliteTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    ownerEmail: text("owner_email").notNull(),
    version: integer("version").notNull(),
    status: text("status").notNull(),
    stage: text("stage").notNull(),
    reviewType: text("review_type").notNull().default("full"),
    eligibilityResult: text("eligibility_result"),
    finalVerdict: text("final_verdict"),
    recommendation: text("recommendation"),
    confidence: text("confidence"),
    score: integer("score"),
    resultJson: text("result_json"),
    model: text("model").notNull(),
    configurationJson: text("configuration_json").notNull(),
    sourceSnapshotJson: text("source_snapshot_json"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    uniqueIndex("reviews_workspace_version_unique").on(table.workspaceId, table.version),
    index("reviews_workspace_created_idx").on(table.workspaceId, table.createdAt),
  ],
);

export const findings = sqliteTable(
  "findings",
  {
    id: text("id").primaryKey(),
    reviewId: text("review_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    module: text("module").notNull(),
    title: text("title").notNull(),
    finding: text("finding").notNull(),
    severity: text("severity").notNull(),
    confidence: text("confidence").notNull(),
    evidenceJson: text("evidence_json").notNull(),
    fixCategory: text("fix_category").notNull(),
    requiredFix: text("required_fix").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("findings_review_idx").on(table.reviewId)],
);

export const claims = sqliteTable(
  "claims",
  {
    id: text("id").primaryKey(),
    reviewId: text("review_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    claimText: text("claim_text").notNull(),
    claimType: text("claim_type").notNull(),
    locationJson: text("location_json").notNull(),
    importance: text("importance").notNull(),
    evidenceStatus: text("evidence_status").notNull(),
    supportingSourcesJson: text("supporting_sources_json").notNull(),
    contradictingSourcesJson: text("contradicting_sources_json").notNull(),
    sourceQuality: text("source_quality").notNull(),
    confidence: text("confidence").notNull(),
    issue: text("issue").notNull(),
    requiredFix: text("required_fix").notNull(),
    fixCategory: text("fix_category").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("claims_review_idx").on(table.reviewId)],
);

export const sources = sqliteTable(
  "sources",
  {
    id: text("id").primaryKey(),
    reviewId: text("review_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    title: text("title").notNull(),
    publisher: text("publisher").notNull(),
    publicationDate: text("publication_date"),
    accessedDate: text("accessed_date").notNull(),
    sourceType: text("source_type").notNull(),
    url: text("url"),
    documentId: text("document_id"),
    reliabilityTier: integer("reliability_tier").notNull(),
    notes: text("notes").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("sources_review_idx").on(table.reviewId)],
);

export const corrections = sqliteTable(
  "corrections",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    reviewId: text("review_id"),
    ownerEmail: text("owner_email").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    field: text("field").notNull(),
    previousValue: text("previous_value"),
    correctedValue: text("corrected_value").notNull(),
    reason: text("reason"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("corrections_workspace_idx").on(table.workspaceId, table.createdAt)],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id"),
    ownerEmail: text("owner_email").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    metadataJson: text("metadata_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("audit_events_workspace_idx").on(table.workspaceId, table.createdAt)],
);
