-- Migration 0007: NJ sales tax columns on invoices
-- Run manually in Supabase SQL editor. Do NOT run via CLI.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS tax_amount numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_rate   numeric(5,4)  DEFAULT 0.06625;
