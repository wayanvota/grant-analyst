CREATE TABLE IF NOT EXISTS funder_research_cache (
  cache_key TEXT PRIMARY KEY,
  funder TEXT NOT NULL,
  opportunity TEXT NOT NULL,
  geography TEXT,
  program_area TEXT,
  result JSONB NOT NULL,
  model TEXT NOT NULL,
  researched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS funder_research_cache_expiry_idx
  ON funder_research_cache(expires_at);
