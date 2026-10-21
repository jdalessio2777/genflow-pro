import { escapeHtml } from './utils/escapeHtml.js'
import { invoiceSummaryHTML } from './emailTemplates.js'
import { SURCHARGE_DEFAULTS } from './utils/surcharge.js'

// The invoice exactly as the customer sees it: for a job invoice the job's
// live Service Summary (jobs.invoice_notes) and signature replace the
// invoice's snapshot copies (same rule as api/_lib/jobSummary.js). Only the
// customer-facing summary is ever used — never jobs.notes / generator_notes
// / quote_notes.
export function customerFacingInvoice({ invoice, job }) {
  if (!invoice || !job) return invoice
  const summary = String(job.invoice_notes ?? '').trim() ? String(job.invoice_notes) : ''
  return {
    ...invoice,
    notes: summary,
    customer_signature: job.customer_signature || invoice.customer_signature || null,
  }
}

// Printable invoice (InvoiceDetail "Print / Save PDF"): the same markup as the
// customer email, in a standalone page. Like the Service History printout, a
// CSP meta tag forbids all script in the page (it is same-origin with the app).
// `job` (the invoice's job, if any) adds its title + customer-facing
// description; a standalone invoice has none and shows neither row.
export function invoicePrintDocumentHtml({ invoice, customer, job = null, surchargeConfig = SURCHARGE_DEFAULTS }) {
  const num = String(invoice.invoice_number ?? '').trim()
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https:">
<title>${num ? `Invoice ${escapeHtml(num)}` : 'Invoice'} — GenShield</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #1a1a1a; background: white; padding: 24px; max-width: 680px; margin: 0 auto; }
  @media print { body { padding: 0; } @page { margin: 0.6in; } .no-print { display: none !important; } }
</style>
</head>
<body>
  <div class="no-print" style="margin:0 0 16px;display:flex;justify-content:flex-end;">
    <button id="close-invoice" style="font-family:Arial,sans-serif;font-size:13px;font-weight:600;color:#1e3a5f;background:#f0f4f8;border:1px solid #cbd5e1;border-radius:8px;padding:8px 16px;cursor:pointer;">
  ✕ Close &amp; Return to GenFlow Pro
    </button>
  </div>
  ${invoiceSummaryHTML({ invoice, customer, job, surchargeConfig })}
</body>
</html>`
}
