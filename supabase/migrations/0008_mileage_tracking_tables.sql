-- =============================================================================
-- MIGRATION 0008 — Mileage tracking tables (app_settings, vehicles, mileage_logs)
-- Project : ntpbjcvlzophmbowocwt (GenFlow Pro / GenShield)
-- Date    : 2026-07-29
-- =============================================================================
--
-- !! STOP — CONFIRM BACKUP EXISTS BEFORE RUNNING !!
-- Run manually in Supabase SQL editor. Do NOT run via CLI.
--
-- This migration is ADDITIVE ONLY: it only creates three new tables. No
-- existing tables, columns, or data are touched.
--
-- Why: src/pages/Finance.jsx (MileageTab), src/pages/Settings.jsx
-- (VehiclesTab, general settings) and src/lib/db.js already reference these
-- three tables via db.AppSettings / db.Vehicle / db.MileageLog — that code
-- has existed since the initial commit, but the tables were never created
-- during the Base44 → Supabase migration. This was confirmed by reading the
-- actual component code that consumes each table, not guessed.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: app_settings — simple key/value store
-- Read/written by src/lib/useSettings.js via db.AppSettings.list("key") /
-- .create({key, value}) / .update(id, {value}). One row per setting key
-- (home_address, business_name, google_maps_api_key, team_email_*, etc).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_settings (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL    DEFAULT now(),
  key         text        NOT NULL,
  value       text,

  CONSTRAINT app_settings_key_unique UNIQUE (key)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: vehicles — one row per work vehicle
-- Created via VehiclesTab in src/pages/Settings.jsx (db.Vehicle.create),
-- consumed by MileageTab in src/pages/Finance.jsx.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vehicles (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL    DEFAULT now(),

  name              text        NOT NULL,   -- display name, e.g. "White Ford F-250"
  year              text,
  make              text,
  model             text,
  plate             text,
  color             text,
  assigned_to_name  text,                   -- "Jeremy" / "Alex" / "Derek" / "Shared"
  is_active         boolean     NOT NULL    DEFAULT true
);

CREATE INDEX IF NOT EXISTS vehicles_name_idx ON vehicles (name);


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: mileage_logs — one row per logged trip
-- Created via the "Log Trip" (Smart Trip, Google Distance Matrix) and
-- "Manual" dialogs in MileageTab (src/pages/Finance.jsx), both calling
-- db.MileageLog.create(). Queried with db.MileageLog.list("-date", 500).
--
-- vehicle_id uses ON DELETE SET NULL: deleting a vehicle in VehiclesTab
-- explicitly warns "Existing mileage logs will remain but lose the vehicle
-- reference" — vehicle_name is kept as a denormalized snapshot so historical
-- entries stay readable even after that.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mileage_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL    DEFAULT now(),

  date          date        NOT NULL,
  miles         numeric     NOT NULL    DEFAULT 0,
  description   text,

  from_address  text,       -- set for Smart Trip entries, null for Manual
  to_address    text,

  vehicle_id    uuid        REFERENCES vehicles (id) ON DELETE SET NULL,
  vehicle_name  text,       -- denormalized snapshot of vehicles.name at log time

  author_name   text,
  author_email  text
);

CREATE INDEX IF NOT EXISTS mileage_logs_date_idx         ON mileage_logs (date DESC);
CREATE INDEX IF NOT EXISTS mileage_logs_vehicle_id_idx   ON mileage_logs (vehicle_id);
CREATE INDEX IF NOT EXISTS mileage_logs_author_email_idx ON mileage_logs (author_email);


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: RLS — match the "authenticated_full" pattern used for every other
-- team-only table in migration 0003 (whole app is already gated by Google
-- OAuth + the ALLOWED_EMAILS whitelist at the app layer; RLS here just
-- ensures the anon key alone can't touch these tables).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full" ON app_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full" ON vehicles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE mileage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full" ON mileage_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- =============================================================================
-- VERIFICATION QUERIES
-- Run these AFTER the migration to confirm success. Safe to run as-is.
-- =============================================================================

-- ── V1: Confirm all three tables exist with RLS enabled ──────────────────────
/*
SELECT relname, relrowsecurity
FROM   pg_class
WHERE  relname IN ('app_settings', 'vehicles', 'mileage_logs');

-- Expected: 3 rows, relrowsecurity = true for all
*/

-- ── V2: Confirm mileage_logs.vehicle_id → vehicles.id FK exists ──────────────
/*
SELECT conname, confrelid::regclass AS references_table
FROM   pg_constraint
WHERE  conrelid = 'mileage_logs'::regclass AND contype = 'f';

-- Expected: 1 row referencing vehicles
*/

-- ── V3: End-to-end insert/read/cleanup test ───────────────────────────────────
/*
INSERT INTO vehicles (name, year, make, model, assigned_to_name)
VALUES ('Migration Test Truck', '2024', 'Ford', 'F-150', 'Shared')
RETURNING id;
-- copy the returned id into :test_vehicle_id below

INSERT INTO mileage_logs (date, miles, description, vehicle_id, vehicle_name, author_name, author_email)
VALUES (CURRENT_DATE, 12.3, 'Migration verify trip', '<test_vehicle_id>', 'Migration Test Truck', 'Migration Test', 'test@example.com')
RETURNING id;

SELECT * FROM mileage_logs WHERE description = 'Migration verify trip';

DELETE FROM mileage_logs WHERE description = 'Migration verify trip';
DELETE FROM vehicles WHERE name = 'Migration Test Truck';
*/
