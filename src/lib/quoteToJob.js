// Job row created when staff mark a quote Approved (QuoteDetail.jsx).
// - quote.scope_notes ("Scope of Work", customer-facing — already in the quote
//   email) -> jobs.customer_description (customer-facing; shown in the
//   appointment confirmation email).
// - quote.notes ("Notes (internal)") -> internal job fields only
//   (jobs.notes / jobs.quote_notes), never customer_description.
export function jobFromApprovedQuote(quote, { customerId, customerName }) {
  return {
    customer_id: customerId,
    customer_name: customerName,
    title: `Quote Follow-up — ${customerName}`,
    job_type: "quote",
    status: "scheduled",
    customer_description: quote?.scope_notes?.trim() || null,
    notes: quote?.notes || null,
    quote_notes: quote?.notes || null,
  };
}
