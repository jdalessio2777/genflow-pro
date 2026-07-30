-- =============================================================================
-- MIGRATION 0012 — shield_referrals: add referrer_customer_id (ADDITIVE ONLY)
-- Already applied to the live Supabase project during the pre-launch audit.
--
-- Bug: confirming a referral matched the referrer to a customer by a fuzzy
-- ilike(email) then eq(phone) lookup with .limit(1) and no tiebreaker — if
-- multiple customers shared an email/phone, the reward could be applied to
-- the wrong (unrelated) customer. This happened live during the audit.
--
-- Fix: capture the customer id directly at referral-creation time (already
-- known when the referrer is picked from the search-autocomplete in
-- Referrals.jsx), store it here, and use it directly at confirm time instead
-- of re-deriving it via email/phone. Falls back to the old fuzzy lookup only
-- when a referral was created without matching an existing customer.
-- =============================================================================

ALTER TABLE shield_referrals
  ADD COLUMN IF NOT EXISTS referrer_customer_id uuid REFERENCES customers (id) ON DELETE SET NULL;
