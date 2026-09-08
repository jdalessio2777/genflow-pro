-- =============================================================================
-- MIGRATION 0017 — quotes: add scope_notes (ADDITIVE ONLY)
--
-- Customer-facing "Scope of Work" text for a quote, distinct from the
-- existing `notes` column (which is internal-only and never sent to the
-- customer). When present, it's rendered in the quote email and shown on
-- the Quote Detail view; when null/empty, no section renders anywhere.
-- =============================================================================

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS scope_notes text;
