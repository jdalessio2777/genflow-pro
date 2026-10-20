// Labor/flat-rate lines are built from catalog rows (labor_rates) only, with
// ONE price function for what the tech sees and what is charged (H-5 / B-04).
// A line stores its price when added; later catalog edits only affect new lines.

export const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

// Member price, to the cent — used for both the label and the saved line.
export function memberPrice(amount, memberDiscountRate = 1.0) {
  return round2(Number(amount || 0) * memberDiscountRate);
}

export const isAgreementRate = (rate) => rate?.category === "service_agreements";
// Catalog rows marked "PLACEHOLDER … Do not add to jobs yet" are never offered.
export const isPlaceholderRate = (rate) => /^\s*PLACEHOLDER/i.test(rate?.notes || "");

export function memberLabel(memberDiscountRate) {
  return `Member ${Math.round((1 - memberDiscountRate) * 100)}% off`;
}

// " (Member 10% off)" suffix that buildLaborLine puts on a discounted line.
const MEMBER_LABEL_RE = /\s*\(Member \d+% off\)\s*$/;
export const stripMemberLabel = (description) => String(description ?? "").replace(MEMBER_LABEL_RE, "");

// B5b: the description a labor line should carry after its price is edited
// by hand, so the "(Member N% off)" label always matches the price actually
// charged. Labels only — the price itself is whatever the tech typed.
//  - Price not changed: description untouched.
//  - Line is a catalog rate (matched by name): labelled only when the new
//    price IS the member price of that rate for this customer right now.
//  - Not a catalog rate: a changed price can't be verified as a member
//    price, so the label is dropped.
export function descriptionAfterPriceEdit({ line, newPrice, rates = [], memberDiscountRate = 1.0 }) {
  const description = String(line?.description ?? "");
  const oldUnit = line?.is_flat_rate ? line?.flat_rate_amount : line?.rate;
  if (round2(newPrice) === round2(oldUnit)) return description;
  const base = stripMemberLabel(description);
  const rate = (rates || []).find(r => r?.name === base &&
    (line?.is_flat_rate ? r.type !== "hourly" : r.type === "hourly"));
  if (!rate || memberDiscountRate >= 1.0 || isAgreementRate(rate) || rate.category === "discounts") return base;
  const list = round2(ratePrice(rate));
  const member = memberPrice(list, memberDiscountRate);
  return member !== list && round2(newPrice) === member ? `${base} (${memberLabel(memberDiscountRate)})` : base;
}

// Groups for the job screen's Labor list, in display order. Hourly catalog
// rows land in their category's group; unknown categories go to "Other".
export const LABOR_GROUPS = [
  { key: "labor", label: "Standard", tone: "default" },
  { key: "after_hours", label: "After Hours & Weekend", tone: "orange" },
  { key: "emergency", label: "Emergency", tone: "red" },
  { key: "other", label: "Other", tone: "default" },
];

// Hourly rates, plus flat "emergency" rows (the dispatch fee lived on the
// labor list before the catalog took over, so techs look for it there).
export const LABOR_TAB_FLAT_CATEGORIES = ["emergency"];

export function groupLaborRates(rates) {
  const shown = (rates || []).filter(r => !isPlaceholderRate(r) &&
    (r.type === "hourly" || (r.type === "flat_rate" && LABOR_TAB_FLAT_CATEGORIES.includes(r.category))));
  const known = new Set(LABOR_GROUPS.map(g => g.key));
  return LABOR_GROUPS
    .map(g => ({ ...g, rates: shown.filter(r => (known.has(r.category) ? r.category : "other") === g.key) }))
    .filter(g => g.rates.length > 0);
}

// Catalog price of a rate row, whatever its type.
export const ratePrice = (rate) => (rate?.type === "hourly" ? rate.rate : rate?.flat_price) || 0;

// The job_labor row for a catalog rate. Discount rows (stored at $0, % in
// notes) are computed from the job's current subtotal. Service agreements
// are a fixed price and are never member-discounted (B-02).
export function buildLaborLine({ rate, jobId, memberDiscountRate = 1.0, subtotal = 0 }) {
  const isMember = memberDiscountRate < 1.0;
  if (rate.type === "hourly") {
    const unit = memberPrice(rate.rate, memberDiscountRate);
    return {
      job_id: jobId,
      description: rate.name + (isMember ? ` (${memberLabel(memberDiscountRate)})` : ""),
      hours: 1,
      rate: unit,
      cost_rate: rate.cost_rate || 0,
      is_flat_rate: false,
      total_price: unit,
      total_cost: (rate.cost_rate || 0) * 1,
    };
  }
  if (rate.category === "discounts") {
    const pct = parseFloat((rate.notes || "").match(/(\d+(?:\.\d+)?)\s*%/)?.[1]) || 0;
    const amount = pct > 0 ? -round2(subtotal * pct / 100) : 0;
    return {
      job_id: jobId,
      description: rate.name,
      is_flat_rate: true,
      flat_rate_amount: amount,
      flat_rate_cost: 0,
      total_price: amount,
      total_cost: 0,
    };
  }
  const discount = isMember && !isAgreementRate(rate);
  const price = memberPrice(rate.flat_price, discount ? memberDiscountRate : 1.0);
  return {
    job_id: jobId,
    description: rate.name + (discount ? ` (${memberLabel(memberDiscountRate)})` : ""),
    is_flat_rate: true,
    flat_rate_amount: price,
    flat_rate_cost: rate.flat_cost || 0,
    total_price: price,
    total_cost: rate.flat_cost || 0,
  };
}
