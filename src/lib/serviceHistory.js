import { escapeHtml, multilineHtml } from './emailTemplates.js'

// Customer-facing "Notes" cell for the printable Service History
// (CustomerDetail.jsx). Only customer-facing job text may appear here:
//   invoice_notes        — "Describe work performed for customer invoice"
//                          (also printed as SERVICE NOTES on the invoice)
//   customer_description — "Job Description (customer-facing)"
// Never jobs.notes / generator_notes / quote_notes — those are internal.
export function serviceHistoryNotesHtml(job) {
  const text = [job?.invoice_notes, job?.customer_description]
    .map(v => (v ?? '').trim())
    .find(Boolean)
  return text ? multilineHtml(text) : '—'
}

export function serviceHistoryTitleHtml(job) {
  return escapeHtml(job?.title || '')
}
