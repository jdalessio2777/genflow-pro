-- ============================================================
-- MIGRATION 0003 — Stage 2: Row Level Security
-- Project: ntpbjcvlzophmbowocwt
-- Date: 2026-06-11
-- ============================================================
-- STOP — CONFIRM BACKUP EXISTS BEFORE RUNNING
-- Run in Supabase SQL Editor only.
-- Two groups — run Group 1 first, test app, then Group 2.
-- ============================================================

-- ═══ GROUP 1: AUTHENTICATED-ONLY TABLES ══════════════════════
-- No public website access. Safe to enable immediately.
-- If app breaks after this group, check Google OAuth session.

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full" ON invoices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full" ON parts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE labor_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full" ON labor_rates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full" ON document_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE job_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full" ON job_documents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE job_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full" ON job_photos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- expenses: RLS already enabled, just needs the policy
CREATE POLICY "authenticated_full" ON expenses
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ═══ GROUP 2: TABLES WITH NARROW ANON ACCESS ══════════════════
-- Public website pages need limited access to these.
-- Run AFTER Group 1 is confirmed working.

-- service_requests: anon INSERT only (contact form)
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full" ON service_requests
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_insert" ON service_requests
  FOR INSERT TO anon WITH CHECK (true);

-- shield_referrals: anon INSERT + SELECT (rewards page)
-- No anon UPDATE/DELETE — admin.html being retired
ALTER TABLE shield_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full" ON shield_referrals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_insert" ON shield_referrals
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_select" ON shield_referrals
  FOR SELECT TO anon USING (true);

-- jobs: anon SELECT + UPDATE scoped to quote_sent only
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full" ON jobs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_select_quote_sent" ON jobs
  FOR SELECT TO anon USING (status = 'quote_sent');
CREATE POLICY "anon_update_quote_sent" ON jobs
  FOR UPDATE TO anon
  USING (status = 'quote_sent') WITH CHECK (true);

-- customers: anon SELECT scoped to customers with quote_sent jobs
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full" ON customers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_select_quote_customers" ON customers
  FOR SELECT TO anon
  USING (id IN (
    SELECT customer_id FROM jobs WHERE status = 'quote_sent'
  ));

-- job_parts: anon SELECT scoped to quote_sent jobs
ALTER TABLE job_parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full" ON job_parts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_select_quote_parts" ON job_parts
  FOR SELECT TO anon
  USING (job_id IN (
    SELECT id FROM jobs WHERE status = 'quote_sent'
  ));

-- job_labor: anon SELECT scoped to quote_sent jobs
ALTER TABLE job_labor ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full" ON job_labor
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_select_quote_labor" ON job_labor
  FOR SELECT TO anon
  USING (job_id IN (
    SELECT id FROM jobs WHERE status = 'quote_sent'
  ));
