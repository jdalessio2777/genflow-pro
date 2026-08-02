-- Bug: manual payment methods (cash/check/zelle/venmo/other) capture no
-- reference info, so a check payment has no check number recorded anywhere
-- for later reconciliation. Add a generic reference column (mirrors how
-- stripe_payment_intent_id already serves as a reference for the Stripe App
-- flow) so it can hold a check number now and other methods' confirmation
-- codes later, without another migration.
ALTER TABLE invoices ADD COLUMN payment_reference text;
