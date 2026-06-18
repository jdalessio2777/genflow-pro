-- Add Stripe payment columns to invoices
-- Run manually in the Supabase SQL editor.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS surcharge_amount         numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

CREATE INDEX IF NOT EXISTS invoices_stripe_pi_idx
  ON invoices (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
