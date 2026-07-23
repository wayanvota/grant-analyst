CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  organization TEXT NOT NULL,
  funder TEXT NOT NULL,
  opportunity TEXT NOT NULL,
  deadline TEXT,
  requested_amount TEXT,
  geography TEXT,
  program_area TEXT,
  organization_type TEXT,
  proposal_version TEXT NOT NULL DEFAULT '1',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS workspaces_owner_updated_idx ON workspaces(owner_hash, updated_at DESC);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_hash TEXT NOT NULL,
  category TEXT NOT NULL,
  source_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content_sha256 TEXT NOT NULL,
  openai_file_id TEXT NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'ready',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS documents_workspace_idx ON documents(workspace_id, created_at DESC);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_hash TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  review_type TEXT NOT NULL DEFAULT 'full',
  eligibility_result TEXT,
  final_verdict TEXT,
  recommendation TEXT,
  confidence TEXT,
  score INTEGER,
  result JSONB,
  model TEXT NOT NULL,
  configuration JSONB NOT NULL,
  source_snapshot JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(workspace_id, version)
);
CREATE INDEX IF NOT EXISTS reviews_workspace_created_idx ON reviews(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_owner_created_idx ON reviews(owner_hash, created_at DESC);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  fact_key TEXT NOT NULL,
  extracted_value TEXT,
  confirmed_value TEXT,
  source_ref TEXT,
  confidence TEXT NOT NULL DEFAULT 'low',
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, fact_key)
);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  title TEXT NOT NULL,
  finding TEXT NOT NULL,
  severity TEXT NOT NULL,
  confidence TEXT NOT NULL,
  evidence JSONB NOT NULL,
  fix_category TEXT NOT NULL,
  required_fix TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS findings_review_idx ON findings(review_id);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  claim_text TEXT NOT NULL,
  claim_type TEXT NOT NULL,
  location JSONB NOT NULL,
  importance TEXT NOT NULL,
  evidence_status TEXT NOT NULL,
  supporting_sources JSONB NOT NULL,
  contradicting_sources JSONB NOT NULL,
  source_quality TEXT NOT NULL,
  confidence TEXT NOT NULL,
  issue TEXT NOT NULL,
  required_fix TEXT NOT NULL,
  fix_category TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS claims_review_idx ON claims(review_id);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  publisher TEXT NOT NULL,
  publication_date TEXT,
  accessed_date TEXT NOT NULL,
  source_type TEXT NOT NULL,
  url TEXT,
  reliability_tier INTEGER NOT NULL,
  notes TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sources_review_idx ON sources(review_id);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS corrections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  review_id TEXT REFERENCES reviews(id) ON DELETE SET NULL,
  owner_hash TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  field TEXT NOT NULL,
  previous_value TEXT,
  corrected_value TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS corrections_workspace_idx ON corrections(workspace_id, created_at DESC);
-- statement-breakpoint
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_hash TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_events_workspace_idx ON audit_events(workspace_id, created_at DESC);
