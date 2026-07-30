-- =============================================================================
-- MIGRATION 0013 — jobs: add *_send_failed flags (ADDITIVE ONLY)
--
-- Investigation this session: "Approve & Schedule" sends the confirmation
-- email inline with no persistent record of success/failure. A transient
-- failure there was completely invisible — no error survives past a toast
-- that's easy to miss, and there was no way to know a confirmation was
-- still owed. Same fragility exists for the completion and quote emails.
--
-- Fix: each send path now retries (immediate, +3s, +10s — 3 attempts total)
-- before giving up, and only after all 3 attempts fail does it persist the
-- corresponding *_send_failed flag here, surfaced on the Dashboard's
-- "Needs Attention" alert so it's never silently lost.
-- =============================================================================

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS confirmation_send_failed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS completion_send_failed   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quote_send_failed        boolean NOT NULL DEFAULT false;
