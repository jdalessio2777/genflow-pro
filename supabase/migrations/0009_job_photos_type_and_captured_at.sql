-- =============================================================================
-- MIGRATION 0009 — job_photos: add `type` + `captured_at` (ADDITIVE ONLY)
-- Project : ntpbjcvlzophmbowocwt (GenFlow Pro / GenShield)
-- Date    : 2026-07-29
-- =============================================================================
--
-- Bug found during the pre-launch camera/photo QA audit (Agent 5):
-- src/components/jobs/JobPhotosTab.jsx inserts into job_photos with
--   { job_id, url, type, captured_at }
-- but the live job_photos table only has (id, created_at, job_id, url, caption).
-- Every job-photo upload compresses + uploads the file to Storage successfully,
-- then fails on the follow-up `db.JobPhoto.create()` call with:
--   "Could not find the 'captured_at' column of 'job_photos' in the schema cache"
-- so the photo is silently never attached to the job (job_photos has 0 rows in
-- production — this has never worked, same root category as the expense-receipt
-- bucket bug fixed earlier this session).
--
-- This migration is ADDITIVE ONLY — no existing columns are touched.
-- =============================================================================

ALTER TABLE job_photos
  ADD COLUMN IF NOT EXISTS type         text,
  ADD COLUMN IF NOT EXISTS captured_at  timestamptz;

-- ── VERIFICATION ──────────────────────────────────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'job_photos' ORDER BY ordinal_position;
-- Expected: id, created_at, job_id, url, caption, type, captured_at
