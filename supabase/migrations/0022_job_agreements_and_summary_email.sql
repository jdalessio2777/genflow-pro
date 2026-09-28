-- =============================================================================
-- MIGRATION 0022 — job_agreements + single completion email bookkeeping
-- (ADDITIVE ONLY — new table + two nullable columns; no data is modified)
--
-- job_agreements: links a maintenance (Protection Plan) agreement signed
-- DURING a job to that job, with a snapshot of exactly what was signed (plan,
-- price, dates, customer/generator details, terms text, signature PNG). The
-- customers.membership_* columns keep describing the customer's *current*
-- membership; re-signing later overwrites those but never this row, so the
-- agreement PDF attached to a job's completion email is stable. At most one
-- agreement per job (re-signing on the same job replaces it — upsert).
--
-- jobs.completion_email_sent_at: set (atomically claimed) by
-- /api/send-job-summary when the single job-completion email goes out.
-- invoices.receipt_sent_at: set (atomically claimed) when the one pay-later
-- receipt goes out. Both make duplicate sends impossible even if the UI
-- retries or two payment paths race.
-- =============================================================================

CREATE TABLE IF NOT EXISTS job_agreements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  job_id      uuid NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  plan        text NOT NULL CHECK (plan IN ('annual', 'semi_annual')),
  plan_name   text NOT NULL,
  price       numeric NOT NULL DEFAULT 0,
  start_date  timestamptz NOT NULL,
  expiry_date timestamptz NOT NULL,
  signature   text NOT NULL,              -- PNG data URL, same format as customers.membership_signature
  signed_at   timestamptz NOT NULL DEFAULT now(),
  signed_by   text,                       -- staff email that ran the signing
  snapshot    jsonb NOT NULL DEFAULT '{}'::jsonb  -- customer/generator/plan/terms as shown when signed
);

CREATE UNIQUE INDEX IF NOT EXISTS job_agreements_job_id_key ON job_agreements (job_id);
CREATE INDEX IF NOT EXISTS job_agreements_customer_id_idx ON job_agreements (customer_id);

ALTER TABLE job_agreements ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "authenticated_full" ON job_agreements
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- No anon policies: never exposed to the public website.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS completion_email_sent_at timestamptz;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS receipt_sent_at timestamptz;
