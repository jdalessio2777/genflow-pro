import { supabase } from '@/lib/supabaseClient';

function parseOrder(orderField) {
  if (orderField == null || orderField === '') return null;
  const s = String(orderField);
  const desc = s.startsWith('-');
  const col = desc ? s.slice(1) : s;
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
      return data ?? [];
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
      return data ?? [];
    },

    async create(payload) {
      const { data, error } = await supabase.from(table).insert(payload).select().single();
      assertNoError(error);
      return data;
    },

    async update(id, payload) {
      const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single();
      assertNoError(error);
      return data;
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
};

export const db = Object.fromEntries(
  Object.entries(TABLE_MAP).map(([entityName, table]) => [entityName, createEntityApi(table)])
);
