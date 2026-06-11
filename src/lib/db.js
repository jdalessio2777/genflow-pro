import { supabase } from '@/lib/supabaseClient';

/**
 * Base44 used `created_date` / `updated_date`; Supabase/Postgres typically use
 * `created_at` / `updated_at`. Ordering by a missing column makes PostgREST
 * error and the query returns no usable data (React Query then shows `[]`).
 */
function resolveOrderColumn(rawCol) {
  const map = {
    created_date: 'created_at',
    updated_date: 'updated_at',
  };
  return map[rawCol] ?? rawCol;
}

function normalizeRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  if (out.created_at != null && out.created_date == null) out.created_date = out.created_at;
  if (out.updated_at != null && out.updated_date == null) out.updated_date = out.updated_at;
  return out;
}

function normalizeRows(data) {
  if (!Array.isArray(data)) return data;
  return data.map(normalizeRow);
}

function parseOrder(orderField) {
  if (orderField == null || orderField === '') return null;
  const s = String(orderField);
  const desc = s.startsWith('-');
  const rawCol = desc ? s.slice(1) : s;
  const col = resolveOrderColumn(rawCol);
  return { col, ascending: !desc };
}

function assertNoError(error) {
  if (error) throw error;
}

function createEntityApi(table) {
  return {
    async filter(filters = {}, orderField) {
      let q = supabase.from(table).select('*');
      Object.entries(filters).forEach(([key, value]) => {
        if (value === undefined) return;
        q = q.eq(key, value);
      });
      const ord = parseOrder(orderField);
      if (ord) q = q.order(ord.col, { ascending: ord.ascending });
      const { data, error } = await q;
      assertNoError(error);
      return normalizeRows(data ?? []);
    },

    async list(orderField, limit) {
      let q = supabase.from(table).select('*');
      const ord = parseOrder(orderField);
      if (ord) q = q.order(ord.col, { ascending: ord.ascending });
      if (limit != null && Number.isFinite(Number(limit))) {
        q = q.limit(Number(limit));
      }
      const { data, error } = await q;
      assertNoError(error);
      return normalizeRows(data ?? []);
    },

    async create(payload) {
      const { data, error } = await supabase.from(table).insert(payload).select().single();
      assertNoError(error);
      return normalizeRow(data);
    },

    async update(id, payload) {
      const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single();
      assertNoError(error);
      return normalizeRow(data);
    },

    async delete(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      assertNoError(error);
    },
  };
}

/**
 * PascalCase entity names (Base44-style) → Supabase table names.
 * Required (per migration): customers, jobs, job_parts, job_labor, job_photos,
 * job_documents, invoices, parts, labor_rates.
 * The app also expects these companion tables if you use those screens:
 * document_templates, app_settings, vehicles, team_notes, expenses, mileage_logs.
 */
const TABLE_MAP = {
  Customer: 'customers',
  Job: 'jobs',
  JobPart: 'job_parts',
  JobLabor: 'job_labor',
  JobPhoto: 'job_photos',
  JobDocument: 'job_documents',
  Invoice: 'invoices',
  Part: 'parts',
  LaborRate: 'labor_rates',
  DocumentTemplate: 'document_templates',
  AppSettings: 'app_settings',
  Vehicle: 'vehicles',
  TeamNote: 'team_notes',
  Expense: 'expenses',
  MileageLog: 'mileage_logs',
  ServiceRequest: 'service_requests',
  ShieldReferral: 'shield_referrals',
};

export const db = Object.fromEntries(
  Object.entries(TABLE_MAP).map(([entityName, table]) => [entityName, createEntityApi(table)])
);
