-- =============================================================================
-- MIGRATION 0019 — Backfill parts.first_managed_at (ONE-TIME, MANUAL REVIEW)
--
-- !! STOP — DO NOT AUTO-APPLY. Review and run manually in the Supabase SQL
-- editor after confirming a backup/point-in-time-recovery exists. !!
--
-- Why: migration 0018 added parts.first_managed_at (set going forward by the
-- Catalog +/- steppers, Bulk Count Entry, and manual price entry — see
-- src/lib/utils/partsManaged.js). It did NOT retroactively flag parts that
-- already had a real stock count or price entered before the column existed
-- (e.g. today's physical van count, or historically-seeded pricing). Those
-- parts would incorrectly read as "legacy/never-touched" and be excluded
-- from the Dashboard low-stock widget and the Catalog Reorder List.
--
-- As of this writing, this affects 34 real rows (checked via a read-only
-- COUNT against the live DB, not applied).
--
-- This is ADDITIVE/backfill only — it only sets first_managed_at where it is
-- currently null, and only for rows with real signal (in_stock > 0 or a real
-- default_price). It never touches any other column.
-- =============================================================================

UPDATE parts
SET first_managed_at = now()
WHERE first_managed_at IS NULL
  AND (in_stock > 0 OR default_price > 0);

-- =============================================================================
-- VERIFICATION QUERIES — run before and after
-- =============================================================================

-- ── Before: preview exactly which rows will be affected ──────────────────────
/*
SELECT id, name, part_number, in_stock, default_price, reorder_flagged
FROM parts
WHERE first_managed_at IS NULL
  AND (in_stock > 0 OR default_price > 0)
ORDER BY name;
*/

-- ── After: confirm the count of still-unmanaged (legacy) parts ───────────────
/*
SELECT count(*) AS still_unmanaged
FROM parts
WHERE first_managed_at IS NULL;
-- Expected: drops by exactly the number of rows shown in the preview query above
*/
