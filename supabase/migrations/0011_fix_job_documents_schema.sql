-- =============================================================================
-- MIGRATION 0011 — Fix job_documents schema drift (ADDITIVE ONLY)
-- Bug found in pre-launch audit: JobDocsTab.jsx/DocumentFill.jsx write/read
-- template_id, template_name, customer_id, field_definitions, field_values,
-- completed_date — none of which existed on the live table (real columns:
-- id, created_at, job_id, name, status, content). Attaching ANY document to
-- a job has never worked. `name`/`content` are confirmed unused by any code
-- path (grepped src/) so left in place rather than renamed onto.
-- =============================================================================

ALTER TABLE job_documents
  ADD COLUMN IF NOT EXISTS template_id       uuid REFERENCES document_templates (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_name     text,
  ADD COLUMN IF NOT EXISTS customer_id       uuid REFERENCES customers (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS field_definitions jsonb,
  ADD COLUMN IF NOT EXISTS field_values      jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS completed_date    timestamptz;
