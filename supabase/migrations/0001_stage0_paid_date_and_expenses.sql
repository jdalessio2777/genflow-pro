-- =============================================================================
-- MIGRATION 0001 — Stage 0: paid_date + expenses table (ADDITIVE ONLY)
-- Project : ntpbjcvlzophmbowocwt (GenFlow Pro / GenShield)
-- Author  : schema migration
-- Date    : 2026-06-09
-- =============================================================================
--
-- !! STOP — CONFIRM BACKUP BEFORE RUNNING !!
--
-- 1. Open Supabase Dashboard → Database → Backups
-- 2. Confirm a recent backup exists (or trigger one manually).
-- 3. Only proceed once you have a backup you could restore from.
--
-- This migration is ADDITIVE ONLY:
--   - No existing columns are modified or dropped.
--   - No existing tables are altered in any breaking way.
--   - No RLS is enabled.
--   - No existing code paths are affected.
--
-- What this migration does:
--   STEP 1 · Adds paid_date (timestamptz) and payment_method (text)
--            to the invoices table so the markPaid() call in
--            src/pages/InvoiceDetail.jsx stops silently dropping them.
--   STEP 2 · Creates the expenses table from scratch (does not exist yet).
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Add payment columns to invoices
-- ─────────────────────────────────────────────────────────────────────────────
-- Both columns are nullable with no default. Existing paid invoice rows will
-- simply have NULL here — that is correct; we don't backfill unknown dates.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS paid_date     timestamptz,
  ADD COLUMN IF NOT EXISTS payment_method text;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Create expenses table
-- ─────────────────────────────────────────────────────────────────────────────
-- Uses a CHECK constraint (not an enum) so adding categories later is a
-- simple ALTER TABLE ... DROP CONSTRAINT / ADD CONSTRAINT — no type migration.

CREATE TABLE IF NOT EXISTS expenses (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL    DEFAULT now(),

  -- The business date of the expense (used for period filtering in reports).
  -- Stored as date (no time), matching how Finance.jsx filters by e.date.
  date            date        NOT NULL,

  amount          numeric     NOT NULL    DEFAULT 0,

  category        text        NOT NULL,

  description     text,
  vendor          text,
  payment_method  text,
  receipt_url     text,
  author_name     text,
  author_email    text,
  notes           text,

  CONSTRAINT expenses_category_check CHECK (
    category IN (
      'Parts & Supplies',
      'Fuel',
      'Tools & Equipment',
      'Insurance',
      'Marketing',
      'Professional Services',
      'Vehicle',
      'Software & Subscriptions',
      'Other'
    )
  )
);

-- Index on date so period-range queries (weekly/monthly reports) are fast.
CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses (date DESC);

-- Index on author_email so per-technician lookups are fast.
CREATE INDEX IF NOT EXISTS expenses_author_email_idx ON expenses (author_email);


-- =============================================================================
-- VERIFICATION QUERIES
-- Run these AFTER the migration to confirm success.
-- Each block is safe to run as-is in the Supabase SQL editor.
-- =============================================================================

-- ── V1: Confirm invoices now has the two new columns ─────────────────────────
/*
SELECT column_name, data_type, is_nullable
FROM   information_schema.columns
WHERE  table_name = 'invoices'
  AND  column_name IN ('paid_date', 'payment_method')
ORDER  BY column_name;

-- Expected: 2 rows
--   paid_date      | timestamp with time zone | YES
--   payment_method | text                     | YES
*/


-- ── V2: Confirm expenses table exists with all expected columns ───────────────
/*
SELECT column_name, data_type, is_nullable, column_default
FROM   information_schema.columns
WHERE  table_name = 'expenses'
ORDER  BY ordinal_position;

-- Expected: 12 rows (id, created_at, date, amount, category, description,
--           vendor, payment_method, receipt_url, author_name, author_email, notes)
*/


-- ── V3: Confirm the category CHECK rejects an invalid value ──────────────────
-- This INSERT should FAIL with a check constraint violation.
/*
INSERT INTO expenses (date, amount, category, description)
VALUES (CURRENT_DATE, 50.00, 'InvalidCategory', 'This should fail');

-- Expected error: new row for relation "expenses" violates check constraint
--                 "expenses_category_check"
*/


-- ── V4: Confirm a valid expense INSERT succeeds, then clean it up ────────────
/*
-- Insert a test row:
INSERT INTO expenses (date, amount, category, description, author_name)
VALUES (CURRENT_DATE, 49.99, 'Fuel', 'Test expense — migration verify', 'Migration Test')
RETURNING id, date, amount, category, description;

-- Confirm it's there:
SELECT id, date, amount, category, description
FROM   expenses
WHERE  description = 'Test expense — migration verify';

-- Clean it up:
DELETE FROM expenses
WHERE  description = 'Test expense — migration verify';

-- Confirm it's gone:
SELECT COUNT(*) FROM expenses
WHERE  description = 'Test expense — migration verify';
-- Expected: 0
*/
