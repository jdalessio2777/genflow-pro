-- ============================================================
-- MIGRATION 0015 — Quote Builder tables
-- Project: ntpbjcvlzophmbowocwt
-- Date: 2026-09-08
-- ============================================================
-- Documents schema that was applied directly to prod via the
-- Supabase MCP (execute_sql) during the Quote Builder build —
-- backfilled here so it's tracked like every other migration.
-- Safe to run: uses IF NOT EXISTS / DO blocks, no-ops if the
-- objects already exist.
-- ============================================================

CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  customer_id uuid REFERENCES customers(id),
  customer_name text,
  prospect_name text,
  prospect_phone text,
  prospect_email text,
  prospect_address text,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  sent_at timestamptz,
  approved_at timestamptz,
  declined_at timestamptz,
  resulting_job_id uuid REFERENCES jobs(id)
);

CREATE TABLE IF NOT EXISTS quote_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  quote_id uuid NOT NULL REFERENCES quotes(id),
  type text NOT NULL DEFAULT 'custom',
  description text,
  quantity numeric DEFAULT 1,
  unit_price numeric DEFAULT 0,
  total_price numeric DEFAULT 0,
  source_part_id uuid REFERENCES parts(id),
  source_labor_rate_id uuid REFERENCES labor_rates(id)
);

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_line_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "authenticated_all_quotes" ON quotes
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "authenticated_all_quote_line_items" ON quote_line_items
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- No anon policies: this flow has no public approval link
-- (that belongs exclusively to the separate jobs.quote_approval_token
-- flow — quotes/quote_line_items must never be touched by it).
