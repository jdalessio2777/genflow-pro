-- =============================================================================
-- MIGRATION 0018 — first_managed_at flag + parts_usage_log (ADDITIVE ONLY)
--
-- first_managed_at: set the first time staff actively engage with a part —
-- either a real cost/default_price gets entered where none existed, or a
-- real in_stock count gets manually entered via the Catalog +/- steppers or
-- Bulk Count Entry. Once set, never cleared, never re-triggers. Used to:
--   - gate the buy-price -> sale-price (x1.35) auto-suggest (only offered
--     once, before a part is "managed")
--   - exclude legacy/never-touched parts (in_stock=0 by default, never
--     counted) from low-stock alerts and the Reorder List
--
-- parts_usage_log: one row per part added to a job (mirrors the existing
-- in_stock decrement trigger point in JobPartsTab.jsx), source data for the
-- weekly "what got used" report.
-- =============================================================================

ALTER TABLE parts
  ADD COLUMN IF NOT EXISTS first_managed_at timestamptz;

CREATE TABLE IF NOT EXISTS parts_usage_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  part_id    uuid REFERENCES parts (id) ON DELETE SET NULL,
  job_id     uuid REFERENCES jobs (id) ON DELETE SET NULL,
  quantity   integer NOT NULL DEFAULT 1,
  used_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS parts_usage_log_used_at_idx ON parts_usage_log (used_at DESC);
CREATE INDEX IF NOT EXISTS parts_usage_log_part_id_idx ON parts_usage_log (part_id);

ALTER TABLE parts_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full" ON parts_usage_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
