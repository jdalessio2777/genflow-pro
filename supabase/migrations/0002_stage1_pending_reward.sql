-- =============================================================================
-- MIGRATION 0002 — Stage 1: pending_reward flag on customers (ADDITIVE ONLY)
-- Project : ntpbjcvlzophmbowocwt (GenFlow Pro / GenShield)
-- Date    : 2026-06-11
-- =============================================================================
--
-- !! STOP — CONFIRM BACKUP BEFORE RUNNING !!
--
-- This migration is ADDITIVE ONLY:
--   - Adds one nullable boolean column to customers.
--   - Adds one partial index for fast lookups of customers with a pending reward.
--   - No existing columns are modified or dropped.
--   - No RLS is enabled.
--
-- Run in Supabase SQL Editor BEFORE deploying the corresponding app code.
-- =============================================================================

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS pending_reward boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS customers_pending_reward_idx
  ON customers (pending_reward)
  WHERE pending_reward = true;
