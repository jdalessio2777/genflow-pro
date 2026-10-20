import { inferServiceType } from "./jobTypes.js";

// Job row created when staff mark a quote Approved (QuoteDetail.jsx).
// - quote.scope_notes ("Scope of Work", customer-facing — already in the quote
//   email) -> jobs.customer_description (customer-facing; shown in the
//   appointment confirmation email).
// - quote.notes ("Notes (internal)") -> internal job fields only
//   (jobs.notes / jobs.quote_notes), never customer_description.
// job_type: the service type the quote's lines make obvious, else null (the
// "Schedule this job" sheet asks for it). Never "quote" (Run 7).
export function jobFromApprovedQuote(quote, { customerId, customerName, lineItems = [] }) {
  return {
    customer_id: customerId,
    customer_name: customerName,
    title: `Quote Follow-up — ${customerName}`,
    job_type: inferServiceType(lineItems.map(l => l.description)),
    status: "scheduled",
    customer_description: quote?.scope_notes?.trim() || null,
    notes: quote?.notes || null,
    quote_notes: quote?.notes || null,
  };
}

// The job's parts/labor rows from the quote's lines (B-01/B-02). Lines keep
// the quoted price (already member-priced). Catalog parts keep their catalog
// link and cost; agreement lines keep the signing requirement.
// ids: { [quoteLineId]: rowId } — fixed per Approve screen, so a retry after a
// lost response finds the rows it already made instead of duplicating them.
export function jobLinesFromQuote(lineItems, { jobId, catalogParts = [], catalogRates = [], ids = {}, agreementTypeForRate = () => null }) {
  const parts = [];
  const labor = [];
  for (const l of lineItems || []) {
    if (l.type === "part") {
      const cat = catalogParts.find(p => p.id === l.source_part_id);
      const qty = l.quantity || 1;
      parts.push({
        id: ids[l.id],
        job_id: jobId,
        name: l.description,
        quantity: qty,
        price: l.unit_price || 0,
        cost: Number(cat?.cost) || 0,
        total_price: l.total_price || 0,
        total_cost: (Number(cat?.cost) || 0) * qty,
        charge_for_part: true,
        part_id: cat?.id || null,
      });
    } else {
      const rate = catalogRates.find(r => r.id === l.source_labor_rate_id);
      const agreement = agreementTypeForRate(rate);
      labor.push({
        id: ids[l.id],
        job_id: jobId,
        description: l.description,
        is_flat_rate: true,
        flat_rate_amount: l.total_price || 0,
        flat_rate_cost: 0,
        total_price: l.total_price || 0,
        total_cost: 0,
        ...(agreement ? { requires_agreement: agreement } : {}),
      });
    }
  }
  return { parts, labor };
}
