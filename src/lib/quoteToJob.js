import { inferServiceType, isServiceType } from "./jobTypes.js";

// A quote has no title column: its title is its first line, in the order the
// lines were added in the Quote Builder (created_at, 1 ms apart since Run 9).
// E.g. "Generator Main Line Circuit Breaker Replacement". "" without lines.
export const sortQuoteLines = (lineItems = []) =>
  [...(lineItems || [])].sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
export function quoteTitle(lineItems = []) {
  const first = sortQuoteLines(lineItems).find(l => (l?.description || "").trim());
  return (first?.description || "").trim();
}

// Jobs approved before Run 9 were titled "Quote Follow-up — <customer>". The
// schedule sheet offers the quote's title instead of that placeholder.
export const isPlaceholderJobTitle = (title) => /^\s*quote follow[\s-]?up\b/i.test(title || "");

// Job row created when staff mark a quote Approved (QuoteDetail.jsx).
// - title: the quote's title (its main line), editable on the "Schedule this
//   job" sheet before it is saved. Never "Quote Follow-up" (Run 9, A4).
// - customer_description starts BLANK: the tech types a short job description
//   on the sheet. The Scope of Work stays on the quote (Run 9, A2; it used to
//   be copied into the job).
// - quote.notes ("Notes (internal)") -> internal job fields only
//   (jobs.notes / jobs.quote_notes), never customer_description.
// job_type: the Service Type picked on the quote (quotes.job_type, Run 8 A5),
// else the one the quote's lines make obvious, else null (the "Schedule this
// job" sheet asks for it). Never "quote" (Run 7).
export function jobFromApprovedQuote(quote, { customerId, customerName, lineItems = [] }) {
  return {
    customer_id: customerId,
    customer_name: customerName,
    title: quoteTitle(lineItems) || `Job for ${customerName}`,
    job_type: isServiceType(quote?.job_type) ? quote.job_type : inferServiceType(lineItems.map(l => l.description)),
    status: "scheduled",
    customer_description: null,
    notes: quote?.notes || null,
    quote_notes: quote?.notes || null,
  };
}

// at (ms): when given, rows get created_at 1 ms apart in the quote's order, so
// the job lists its lines in the order they were quoted.
export function jobLinesFromQuote(lineItems, { jobId, catalogParts = [], catalogRates = [], ids = {}, agreementTypeForRate = () => null, at = null }) {
  const parts = [];
  const labor = [];
  let n = 0;
  for (const l of sortQuoteLines(lineItems)) {
    const stamp = at != null ? { created_at: new Date(at + n++).toISOString() } : {};
    if (l.type === "part") {
      const cat = catalogParts.find(p => p.id === l.source_part_id);
      const qty = l.quantity || 1;
      parts.push({
        ...stamp,
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
        ...stamp,
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
