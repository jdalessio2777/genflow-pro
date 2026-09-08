-- =============================================================================
-- MIGRATION 0016 — invoices/customers: add send_failed flags (ADDITIVE ONLY)
--
-- Follow-up to 0013: the same "toast-only, nothing persisted" gap existed for
-- QuotePDF's quote send (now fixed to use jobs.quote_send_failed, already
-- added in 0013), the invoice/checklist send from InvoicePDF, and the
-- membership confirmation email sent on signing. Those last two have no
-- existing job row to hang a flag off, so they get their own columns here.
-- =============================================================================

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS send_failed boolean NOT NULL DEFAULT false;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS membership_send_failed boolean NOT NULL DEFAULT false;
