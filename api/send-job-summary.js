// POST /api/send-job-summary  { job_id, kind: 'completion' | 'receipt' | 'resend', nonce?,
//                               document_ids?: uuid[], include_agreement?: boolean }
// Authorization: Bearer <Supabase access token of an allowed staff user>
//
// The single customer email for a job. The recipient is ALWAYS the job's
// customer email loaded server-side — callers can't choose the address,
// subject or body, so this is not an email relay.
//
//  - completion: sent once per job (atomic claim on jobs.completion_email_sent_at
//    + Resend Idempotency-Key). Invoice inline, checklists + agreement as PDFs.
//  - receipt:    sent once per invoice (atomic claim on invoices.receipt_sent_at)
//    and ONLY when the invoice was paid after the completion email already went
//    out unpaid. Paid-before-completion jobs get no receipt (the completion
//    email already said PAID). Stripe webhook never sends — the UI paths call
//    this after marking paid and the claim makes concurrent calls a no-op.
//  - resend:     explicit manual resend from the UI (same content as completion).
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from './_lib/sendEmail.js';
import { buildJobSummaryEmail, MAX_EMAIL_BYTES } from './_lib/jobSummary.js';
import { isAllowedEmail } from '../src/lib/allowedUsers.js';
import { invoiceTotalCents } from '../src/lib/utils/invoiceTotals.js';

// Dates in the email body render in the business's timezone, same as the
// browser-rendered emails did before (Vercel functions run in UTC).
process.env.TZ = 'America/New_York';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const KINDS = new Set(['completion', 'receipt', 'resend']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function isMissingColumn(error) {
  return !!error && (error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist|Could not find the .* column/i.test(error.message || ''));
}

// Atomically set `column` = now() only if it is still null. Returns
// { claimed: true } if this request owns the send, { claimed: false } if
// another request already did. Pre-migration (column missing) we fall back
// to the Resend Idempotency-Key alone.
async function claim(db, table, id, column) {
  const { data, error } = await db.from(table)
    .update({ [column]: new Date().toISOString() })
    .eq('id', id).is(column, null).select('id');
  if (error) {
    if (isMissingColumn(error)) { console.warn(`[send-job-summary] ${table}.${column} missing — run migration 0022`); return { claimed: true, noColumn: true }; }
    throw error;
  }
  return { claimed: (data || []).length > 0 };
}

async function release(db, table, id, column) {
  await db.from(table).update({ [column]: null }).eq('id', id).then(() => {}, () => {});
}

// document_ids omitted -> every completed document (receipt/resend/old
// clients). Present -> exactly those (must be an array of uuids).
export function parseAttachmentSelection(body = {}) {
  let documentIds = null;
  if (body.document_ids !== undefined && body.document_ids !== null) {
    if (!Array.isArray(body.document_ids) || body.document_ids.length > 100 || !body.document_ids.every(id => UUID_RE.test(String(id)))) {
      throw new Error('document_ids must be an array of uuids');
    }
    documentIds = new Set(body.document_ids.map(String));
  }
  return { documentIds, includeAgreement: body.include_agreement !== false };
}

export function selectDocuments(documents, selection) {
  const completed = documents.filter(d => d.status === 'completed');
  return selection.documentIds ? completed.filter(d => selection.documentIds.has(String(d.id))) : completed;
}

export function selectionKey(selectedDocs, withAgreement) {
  const ids = selectedDocs.map(d => String(d.id)).sort().join(',');
  return sha256(Buffer.from(`${ids}|${withAgreement ? 1 : 0}`)).slice(0, 16);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Missing auth token' });

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await db.auth.getUser(token);
  if (userErr || !userData?.user) return res.status(401).json({ error: 'Invalid session' });
  if (!isAllowedEmail(userData.user.email)) return res.status(403).json({ error: 'Not allowed' });

  const body = await readJsonBody(req);
  const jobId = body.job_id;
  const kind = body.kind || 'completion';
  if (!UUID_RE.test(String(jobId || ''))) return res.status(400).json({ error: 'job_id required' });
  if (!KINDS.has(kind)) return res.status(400).json({ error: 'invalid kind' });
  const nonce = String(body.nonce || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  if (kind === 'resend' && !nonce) return res.status(400).json({ error: 'nonce required for resend' });
  let selection;
  try { selection = parseAttachmentSelection(body); } catch (e) { return res.status(400).json({ error: e.message }); }

  try {
    const { data: job } = await db.from('jobs').select('*').eq('id', jobId).maybeSingle();
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const [{ data: customer }, { data: invoices }, { data: parts }, { data: labor }, { data: documents }, agreementRes] = await Promise.all([
      db.from('customers').select('*').eq('id', job.customer_id).maybeSingle(),
      db.from('invoices').select('*').eq('job_id', jobId).order('created_at', { ascending: true }),
      db.from('job_parts').select('*').eq('job_id', jobId),
      db.from('job_labor').select('*').eq('job_id', jobId),
      db.from('job_documents').select('*').eq('job_id', jobId).eq('status', 'completed').order('created_at', { ascending: true }),
      db.from('job_agreements').select('*').eq('job_id', jobId).maybeSingle(),
    ]);
    const invoice = (invoices || [])[0] || null;
    // Per-document toggles from the Complete Job dialog. Only this job's
    // completed documents are ever candidates (loaded by job_id above), so a
    // foreign id in document_ids simply matches nothing.
    const selectedDocs = selectDocuments(documents || [], selection);
    const agreementRow = agreementRes?.error ? null : agreementRes?.data || null;
    const agreement = selection.includeAgreement ? agreementRow : null;

    if (!customer?.email) return res.status(200).json({ ok: true, skipped: 'no_email' });

    // ── eligibility + claim ────────────────────────────────────────────────
    let claimed = null; // [table, id, column] to release on failure
    if (kind === 'completion') {
      const c = await claim(db, 'jobs', job.id, 'completion_email_sent_at');
      if (!c.claimed) return res.status(200).json({ ok: true, skipped: 'already_sent' });
      if (!c.noColumn) claimed = ['jobs', job.id, 'completion_email_sent_at'];
    } else if (kind === 'receipt') {
      if (!invoice || invoice.status !== 'paid' || !invoice.paid_date) return res.status(200).json({ ok: true, skipped: 'not_paid' });
      if (invoice.payment_method === 'no_charge' || invoiceTotalCents(invoice) <= 0) return res.status(200).json({ ok: true, skipped: 'no_charge' });
      if (!job.completion_email_sent_at) return res.status(200).json({ ok: true, skipped: 'completion_email_not_sent' });
      if (new Date(invoice.paid_date) <= new Date(job.completion_email_sent_at)) {
        return res.status(200).json({ ok: true, skipped: 'paid_before_completion_email' });
      }
      const c = await claim(db, 'invoices', invoice.id, 'receipt_sent_at');
      if (!c.claimed) return res.status(200).json({ ok: true, skipped: 'already_sent' });
      if (!c.noColumn) claimed = ['invoices', invoice.id, 'receipt_sent_at'];
    }

    // ── build ─────────────────────────────────────────────────────────────
    let email;
    try {
      email = await buildJobSummaryEmail({
        kind, job, customer, invoice, parts: parts || [], labor: labor || [], documents: selectedDocs,
        agreement: kind === 'receipt' ? null : agreement,
      });
    } catch (e) {
      if (claimed) await release(db, ...claimed);
      throw e;
    }
    console.log('[send-job-summary]', JSON.stringify({
      job_id: job.id, kind, attachments: email.attachments.map(a => ({ filename: a.filename, base64_bytes: a.content.length })),
      total_bytes: email.totalBytes,
    }));
    if (email.totalBytes > MAX_EMAIL_BYTES) {
      if (claimed) await release(db, ...claimed);
      return res.status(413).json({ error: `Email too large (${email.totalBytes} bytes)` });
    }

    // ── send ──────────────────────────────────────────────────────────────
    // The selection is part of the completion key: Resend rejects a reused
    // key with a different body, and the jobs.completion_email_sent_at claim
    // already guarantees one completion email per job.
    const idempotencyKey = kind === 'completion' ? `job-completion-${job.id}-${selectionKey(selectedDocs, !!agreement)}`
      : kind === 'receipt' ? `invoice-receipt-${invoice.id}`
      : `job-resend-${job.id}-${nonce}`;
    let result;
    try {
      result = await sendEmail({
        to: customer.email,
        subject: email.subject,
        html: email.html,
        attachments: email.attachments.length ? email.attachments : undefined,
        idempotencyKey,
      });
    } catch (e) {
      if (claimed) await release(db, ...claimed);
      if (kind !== 'receipt') await db.from('jobs').update({ completion_send_failed: true }).eq('id', job.id).then(() => {}, () => {});
      console.error('[send-job-summary] send failed', job.id, kind, e.message);
      return res.status(502).json({ error: e.message });
    }

    const now = new Date().toISOString();
    if (kind !== 'receipt') {
      await db.from('jobs').update({ completion_send_failed: false }).eq('id', job.id).then(() => {}, () => {});
      if (invoice) await db.from('invoices').update({ emailed_at: now, emailed_to: customer.email }).eq('id', invoice.id).then(() => {}, () => {});
    }

    // Filenames + SHA-256 only (never content): lets staff/QA confirm exactly
    // what was sent, e.g. by regenerating from the same DB state and
    // comparing hashes (the builders are deterministic).
    return res.status(200).json({
      ok: true, id: result?.id, kind, to: customer.email,
      attachments: email.attachments.map(a => a.filename),
      attachment_sha256: email.attachments.map(a => sha256(Buffer.from(a.content, 'base64'))),
      html_sha256: sha256(Buffer.from(email.html, 'utf8')),
      subject: email.subject,
      total_bytes: email.totalBytes,
    });
  } catch (err) {
    console.error('[send-job-summary]', err?.message || err);
    return res.status(500).json({ error: err?.message || 'Failed' });
  }
}
