-- =============================================================================
-- MIGRATION 0023 — drop RLS policies left over from the retired customer-facing
-- quote-approval page (SUBTRACTIVE: removes anonymous access only; no data or
-- schema changes; authenticated staff access is untouched)
--
-- Migration 0003 gave the public `anon` role access to jobs in status
-- 'quote_sent' so the old genshieldservice.com/approve page could read a quote
-- and let the customer approve it directly from the browser with the public
-- anon key. That flow was retired: the app no longer generates approval links
-- (QuoteBuilder.jsx sends quote emails with no approveUrl; staff approve quotes
-- in-app), no code in this repo (src/, api/, public/) queries these tables as
-- anon, and api/validate-quote-token.js uses the service-role key (it does not
-- depend on these policies). The only remaining caller is the orphaned
-- approve.html in the genshield-website repo, which is itself retired.
--
-- Left in place, these policies let ANY anonymous visitor holding the public
-- anon key:
--   * jobs      anon_update_quote_sent  — UPDATE any column of a quote_sent job
--                                         (WITH CHECK true: could even change
--                                         status/customer_id/prices)
--   * jobs      anon_select_quote_sent  — read every quote_sent job row
--   * customers anon_select_quote_customers — read name/email/phone/address of
--                                         every customer with a quote_sent job
--                                         (only ever served the same page)
--   * job_parts anon_select_quote_parts, job_labor anon_select_quote_labor —
--                                         read line items of quote_sent jobs
--                                         (same retired page, same exposure)
--
-- After this migration the anon role keeps only: service_requests INSERT
-- (website booking form) and shield_referrals INSERT/SELECT (rewards page).
-- =============================================================================

DROP POLICY IF EXISTS "anon_update_quote_sent"      ON jobs;
DROP POLICY IF EXISTS "anon_select_quote_sent"      ON jobs;
DROP POLICY IF EXISTS "anon_select_quote_customers" ON customers;
DROP POLICY IF EXISTS "anon_select_quote_parts"     ON job_parts;
DROP POLICY IF EXISTS "anon_select_quote_labor"     ON job_labor;
