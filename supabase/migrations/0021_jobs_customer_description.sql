-- =============================================================================
-- MIGRATION 0021 — jobs: add customer_description (ADDITIVE ONLY)
--
-- Optional customer-facing job description, distinct from the existing
-- `notes` column (internal-only, never sent to the customer). Entered on the
-- job form; when present it's rendered in the appointment confirmation email
-- ("About Your Service") and shown on Job Detail. When null/empty, no section
-- renders anywhere.
-- =============================================================================

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS customer_description text;
