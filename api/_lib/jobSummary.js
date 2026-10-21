// Builds the ONE customer email for a job: invoice/receipt inline, each
// completed checklist + (if signed during this job) the maintenance agreement
// as PDF attachments. Pure (no I/O) so it can be unit-tested.
import { jobSummaryEmailHTML } from '../../src/lib/emailTemplates.js';
import { SURCHARGE_DEFAULTS, withResyncedSurcharge, surchargeFor } from '../../src/lib/utils/surcharge.js';
import { computeJobFinancials, TAX_RATE } from '../../src/lib/utils/jobFinancials.js';
import { buildInvoiceLineItems, invoiceTotalCents, isZeroDollarInvoice } from '../../src/lib/utils/invoiceTotals.js';
import { buildChecklistPdf, checklistFilename } from './pdf/checklistPdf.js';
import { buildAgreementPdf, agreementFilename } from './pdf/agreementPdf.js';

// Resend rejects emails over 40MB (after base64). Stay far below it.
export const MAX_EMAIL_BYTES = 30 * 1024 * 1024;

// The invoice as it should appear in the email. A paid invoice is a closed
// record and is shown exactly as stored. An unpaid invoice whose stored totals
// lag the job's live parts/labor (same staleness the JobDetail sync effect
// fixes) is refreshed from the job rows. A $0 invoice always gets its line
// items rebuilt from the job so it is never an empty table, including
// "No charge" parts.
export function invoiceForEmail({ invoice, parts = [], labor = [], notes, surchargeConfig = SURCHARGE_DEFAULTS }) {
  if (!invoice) return null;
  // Raw Supabase rows have created_at; the templates (written for the client's
  // normalized rows, src/lib/db.js) read created_date.
  let inv = invoice.created_date == null && invoice.created_at != null
    ? { ...invoice, created_date: invoice.created_at }
    : invoice;
  if (inv.status !== 'paid') {
    const f = computeJobFinancials(parts, labor);
    const freshCents = Math.round(f.total * 100);
    if (freshCents !== invoiceTotalCents({ ...inv, surcharge_amount: 0 })) {
      // A credit card surcharge added on the invoice screen is recomputed on
      // the fresh totals (never dropped, never added).
      inv = withResyncedSurcharge({
        ...inv,
        parts_total: f.partsTotal, labor_total: f.laborTotal, tax_amount: f.taxAmount, tax_rate: TAX_RATE,
        total: f.total,
        line_items: buildInvoiceLineItems(parts, labor, { includeNoChargeParts: freshCents === 0 }),
      }, inv, surchargeConfig);
      if (!(Number(inv.surcharge_amount) > 0) || freshCents <= 0) inv = { ...inv, surcharge_amount: 0 };
    }
    // A surcharge on an unpaid invoice was written by the phone: always
    // recompute it here from the shared formula (never trust the stored
    // figure). Paid invoices show what was actually charged.
    if (Number(inv.surcharge_amount) > 0) inv = { ...inv, surcharge_amount: surchargeFor(inv, surchargeConfig) };
  }
  if (isZeroDollarInvoice(inv)) {
    inv = { ...inv, line_items: buildInvoiceLineItems(parts, labor, { includeNoChargeParts: true }) };
  }
  // Customer-facing summary: the job's live "Service Summary" text
  // (jobs.invoice_notes) is the source of truth. invoices.notes is only a
  // snapshot taken when JobDetail last wrote the invoice (Collect Payment,
  // Complete Job on an unpaid invoice, or a totals change) — so it is empty
  // or stale when the summary was typed/edited after that, e.g. on a job paid
  // before completion or edited before the pay-later receipt. Fall back to
  // the snapshot only when no job text was passed (undefined). Never any
  // internal field (jobs.notes / generator_notes / quote_notes).
  if (notes === undefined) return inv;
  const summary = String(notes ?? '').trim() ? String(notes) : '';
  return (inv.notes ?? '') === summary ? inv : { ...inv, notes: summary };
}

export function buildSubject({ kind, invoice, checklistCount }) {
  const num = String(invoice?.invoice_number ?? '').trim();
  const withNum = (label) => (num ? `${label} ${num}` : label);
  if (kind === 'receipt') return num ? `Receipt — Invoice ${num} — GenShield` : 'Receipt — GenShield';
  const parts = [];
  if (invoice) parts.push(isZeroDollarInvoice(invoice) ? withNum('Service Summary') : withNum('Invoice'));
  if (checklistCount > 0) parts.push('Service Report');
  if (!parts.length) parts.push('Service Summary');
  return `${parts.join(' & ')} — GenShield`;
}

export async function buildJobSummaryEmail({ kind = 'completion', job, customer, invoice, parts = [], labor = [], documents = [], agreement = null, surchargeConfig = SURCHARGE_DEFAULTS }) {
  let inv = invoiceForEmail({ invoice, parts, labor, notes: job ? (job.invoice_notes ?? '') : undefined, surchargeConfig });
  // Item 2: the job's signature is the source of truth (it can be collected
  // before completion or later, after the invoice snapshot was taken).
  if (inv && job?.customer_signature) inv = { ...inv, customer_signature: job.customer_signature };
  const attachments = [];
  const attachmentLabels = [];

  if (kind !== 'receipt') {
    const completed = documents.filter(d => d.status === 'completed');
    const usedNames = new Set();
    for (const doc of completed) {
      const bytes = await buildChecklistPdf({ doc, customer, job });
      let filename = checklistFilename(doc);
      for (let i = 2; usedNames.has(filename); i++) filename = checklistFilename(doc).replace(/\.pdf$/, `-${i}.pdf`);
      usedNames.add(filename);
      attachments.push({ filename, content: Buffer.from(bytes).toString('base64') });
      attachmentLabels.push(doc.template_name || 'Service checklist');
    }
    if (agreement) {
      const bytes = await buildAgreementPdf({ agreement });
      attachments.push({ filename: agreementFilename(agreement), content: Buffer.from(bytes).toString('base64') });
      attachmentLabels.push('Signed Maintenance Agreement');
    }
  }

  // The job row (send-job-summary.js selects jobs.*) supplies the
  // customer-facing title + description; the template never reads its
  // internal notes.
  const html = jobSummaryEmailHTML({ invoice: inv, customer, job, kind, attachmentLabels, surchargeConfig });
  const subject = buildSubject({ kind, invoice: inv, checklistCount: attachments.length - (agreement && kind !== 'receipt' ? 1 : 0) });
  const totalBytes = Buffer.byteLength(html, 'utf8') + attachments.reduce((s, a) => s + a.content.length, 0);
  return { subject, html, attachments, attachmentLabels, totalBytes, invoice: inv };
}
