ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS correlation_id TEXT,
  ADD COLUMN IF NOT EXISTS completion_state TEXT NOT NULL DEFAULT 'awaiting_analysis',
  ADD COLUMN IF NOT EXISTS analysis_manifest JSONB,
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS analysis_started_at TIMESTAMPTZ;

UPDATE reviews
SET completion_state = CASE
  WHEN status = 'failed' THEN 'failed'
  WHEN result IS NOT NULL AND COALESCE((result->'pipeline'->>'partial')::boolean, false) THEN 'partial'
  WHEN result IS NOT NULL THEN 'complete'
  ELSE 'awaiting_analysis'
END
WHERE completion_state = 'awaiting_analysis';

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'reviews'::regclass
      AND conname = 'reviews_completion_state_valid'
  ) THEN
    ALTER TABLE reviews
      ADD CONSTRAINT reviews_completion_state_valid
      CHECK (completion_state IN (
        'awaiting_analysis', 'complete', 'complete_with_warnings', 'partial', 'failed'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'reviews'::regclass
      AND conname = 'reviews_manifest_matches_result'
  ) THEN
    ALTER TABLE reviews
      ADD CONSTRAINT reviews_manifest_matches_result
      CHECK (
        analysis_manifest IS NULL
        OR result IS NULL
        OR (result ? 'manifest' AND result->'manifest' = analysis_manifest)
      );
  END IF;
END;
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS reviews_correlation_id_idx
  ON reviews(correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION prevent_analysis_manifest_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.analysis_manifest IS NOT NULL
     AND NEW.analysis_manifest IS DISTINCT FROM OLD.analysis_manifest THEN
    RAISE EXCEPTION 'analysis_manifest is immutable once stored';
  END IF;
  IF NEW.analysis_manifest IS NOT NULL
     AND NEW.result IS NOT NULL
     AND NEW.result->'manifest' IS DISTINCT FROM NEW.analysis_manifest THEN
    RAISE EXCEPTION 'result manifest must match analysis_manifest';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reviews_analysis_manifest_immutable ON reviews;
CREATE TRIGGER reviews_analysis_manifest_immutable
BEFORE UPDATE OF analysis_manifest, result ON reviews
FOR EACH ROW
EXECUTE FUNCTION prevent_analysis_manifest_change();
