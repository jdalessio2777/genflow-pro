-- Migration 0005: Maintenance agreement renewal system
-- Run in Supabase SQL Editor

-- Track reminder sends to prevent duplicates
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS renewal_reminder_30_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS renewal_reminder_7_sent_at  timestamptz,
  ADD COLUMN IF NOT EXISTS renewal_expired_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS membership_visits_used integer DEFAULT 0;

-- Renewal history — log every agreement before overwriting
CREATE TABLE IF NOT EXISTS membership_renewals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid REFERENCES customers(id) ON DELETE CASCADE,
  plan          text,
  start_date    timestamptz,
  expiry_date   timestamptz,
  renewed_at    timestamptz DEFAULT now(),
  renewed_by    text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS membership_renewals_customer_idx
  ON membership_renewals (customer_id);
