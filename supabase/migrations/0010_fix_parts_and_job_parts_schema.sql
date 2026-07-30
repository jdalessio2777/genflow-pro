-- =============================================================================
-- MIGRATION 0010 — Fix parts/job_parts schema drift (ADDITIVE ONLY)
-- Bug found in pre-launch audit: JobPartsTab.jsx/Catalog.jsx/Parts.jsx/
-- Dashboard.jsx write/read `default_price`/`cost`/`in_stock`/`reorder_flagged`
-- on the `parts` table, and `description`/`part_id` on `job_parts` — none of
-- which exist. Every "Add Part" attempt fails with a silent PGRST204 (no
-- onError handler), so parts can never be added to a job or billed.
--
-- The existing `order_price`/`sale_price`/`order_quantity`/`min_stock_quantity`
-- columns on `parts` are used in exactly one place in the entire codebase
-- (Catalog.jsx:753, a fallback that's never hit) — confirmed dead, not
-- rewriting 10+ call sites across 4 files to rename onto them. Instead: add
-- the columns the code actually uses, backfilled from the existing seeded
-- price data so the 433 real parts keep their real prices.
-- =============================================================================

ALTER TABLE parts
  ADD COLUMN IF NOT EXISTS default_price    numeric,
  ADD COLUMN IF NOT EXISTS cost             numeric,
  ADD COLUMN IF NOT EXISTS in_stock         integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reorder_flagged  boolean NOT NULL DEFAULT false;

UPDATE parts SET
  default_price = COALESCE(default_price, sale_price, 0),
  cost          = COALESCE(cost, order_price, 0)
WHERE default_price IS NULL OR cost IS NULL;

ALTER TABLE job_parts
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS part_id     uuid REFERENCES parts (id) ON DELETE SET NULL;
