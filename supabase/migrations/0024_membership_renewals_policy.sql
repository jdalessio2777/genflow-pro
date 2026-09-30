-- MIGRATION 0024 — membership_renewals: add the missing staff access policy
--
-- 0005 created membership_renewals with row level security enabled but never
-- added a policy, so every insert from the app (MembershipAgreement.jsx
-- handleSign, which logs the prior agreement before a re-sign overwrites it)
-- has been silently rejected and swallowed by its try/catch. The table has
-- 0 rows. This matches every other staff-only table: signed-in users only,
-- no anon access.
DO $$ BEGIN
  CREATE POLICY "authenticated_full" ON membership_renewals
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
