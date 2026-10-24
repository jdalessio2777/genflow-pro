// The ONE finance calculation (Run 9, D2): Finance > Overview, Finance >
// Insights and the weekly financial report email (api/generate-report.js) all
// call these functions, so their numbers always agree.
//
// Plain functions over plain rows (no React, no Supabase, relative imports
// only) so the serverless report can import this file too.
//
// Rules
// - Dates are business days in New York time (America/New_York): a payment
//   at 11 pm ET on the 31st counts on the 31st, on a phone or on the server.
// - Revenue = paid invoices (status "paid", by paid_date; the invoice total,
//   which includes NJ tax and any card surcharge — the existing rule) +
//   warranty reimbursements (warranty_claims.amount_paid, by date_paid).
//   Two separate tables, so nothing is counted twice.
// - Expenses = expenses.amount by expenses.date. Net = revenue - expenses.
// - Revenue by job type: the job's service type; a job with no real type
//   (missing, or the legacy "quote") is typed from its invoice lines, else
//   "Other". Warranty reimbursements count as "Warranty". Types with jobs but
//   $0 revenue (no-charge visits) are listed too.
import { JOB_TYPES, isServiceType, inferServiceType } from "../jobTypes.js";

export const TZ = "America/New_York";
const DAY = 86400000;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const round2 = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;

// ── Dates (YYYY-MM-DD keys in New York time) ────────────────────────────────
const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
export function etDate(v) {
  if (v == null || v === "") return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v; // a date column
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : fmt.format(d);
}
export const todayET = (now = new Date()) => etDate(now);
const parse = (k) => { const [y, m, d] = k.split("-").map(Number); return { y, m, d }; };
const key = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export function addDays(k, n) { const { y, m, d } = parse(k); const t = new Date(Date.UTC(y, m - 1, d) + n * DAY); return key(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); }
export function addMonths(k, n) {
  const { y, m, d } = parse(k); const total = y * 12 + (m - 1) + n; const ny = Math.floor(total / 12); const nm = (total % 12) + 1;
  return key(ny, nm, Math.min(d, daysIn(ny, nm)));
}
export const dayOfWeek = (k) => { const { y, m, d } = parse(k); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }; // 0 = Sunday
export const startOfWeek = (k) => addDays(k, -dayOfWeek(k)); // Sunday, like the weekly report
export const startOfMonth = (k) => { const { y, m } = parse(k); return key(y, m, 1); };
export const endOfMonth = (k) => { const { y, m } = parse(k); return key(y, m, daysIn(y, m)); };
export const startOfQuarter = (k) => { const { y, m } = parse(k); return key(y, Math.floor((m - 1) / 3) * 3 + 1, 1); };
export const startOfYear = (k) => `${parse(k).y}-01-01`;
export const daysBetween = (a, b) => Math.round((Date.UTC(...ymd(b)) - Date.UTC(...ymd(a))) / DAY);
const ymd = (k) => { const { y, m, d } = parse(k); return [y, m - 1, d]; };
const short = (k, withYear = false) => new Date(Date.UTC(...ymd(k))).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
const monthName = (k, y = true) => new Date(Date.UTC(...ymd(k))).toLocaleDateString("en-US", { timeZone: "UTC", month: y ? "short" : "long", ...(y ? { year: "2-digit" } : {}) });

// ── Ranges ──────────────────────────────────────────────────────────────────
export const PRESETS = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "quarter", label: "This quarter" },
  { value: "ytd", label: "Year to date" },
  { value: "last12", label: "Last 12 months" },
  { value: "custom", label: "Custom" },
];
// Overview's period buttons map onto the same ranges.
export const OVERVIEW_PERIODS = [["month", "This Month"], ["quarter", "This Quarter"], ["year", "This Year"], ["all", "All Time"]];

export function rangeLabel(from, to) {
  if (from === to) return short(from, true);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${short(from, !sameYear)} – ${short(to, true)}`;
}
// preset: one of PRESETS (+ "year", "all" for Overview). Inclusive from/to keys.
export function rangeFor(preset, { now = new Date(), from, to } = {}) {
  const t = todayET(now);
  let r;
  switch (preset) {
    case "week": r = { from: startOfWeek(t), to: t }; break;
    case "month": r = { from: startOfMonth(t), to: t }; break;
    case "last_month": { const p = addMonths(startOfMonth(t), -1); r = { from: p, to: endOfMonth(p) }; break; }
    case "quarter": r = { from: startOfQuarter(t), to: t }; break;
    case "ytd": case "year": r = { from: startOfYear(t), to: t }; break;
    case "last12": r = { from: addDays(addMonths(t, -12), 1), to: t }; break;
    case "all": r = { from: "2000-01-01", to: t }; break;
    case "custom": {
      let a = etDate(from) || t, b = etDate(to) || t; if (a > b) [a, b] = [b, a];
      r = { from: a, to: b }; break;
    }
    default: throw new Error(`unknown range ${preset}`);
  }
  return { preset, ...r, label: preset === "all" ? "All time" : rangeLabel(r.from, r.to) };
}
// The period just before, the same length, for "vs previous" (+/- %).
// Calendar presets step back one unit (this month to date vs last month to the
// same day); custom ranges step back their own length.
export function previousRange(r) {
  let from, to;
  switch (r.preset) {
    case "week": from = addDays(r.from, -7); to = addDays(r.to, -7); break;
    case "month": case "last_month": from = addMonths(r.from, -1); to = r.preset === "last_month" ? endOfMonth(from) : addMonths(r.to, -1); break;
    case "quarter": from = addMonths(r.from, -3); to = addMonths(r.to, -3); break;
    case "ytd": case "year": from = addMonths(r.from, -12); to = addMonths(r.to, -12); break;
    case "last12": from = addMonths(r.from, -12); to = addMonths(r.to, -12); break;
    case "all": return null;
    default: { const n = daysBetween(r.from, r.to) + 1; to = addDays(r.from, -1); from = addDays(to, -(n - 1)); }
  }
  return { preset: `prev_${r.preset}`, from, to, label: rangeLabel(from, to) };
}
export const inRange = (k, r) => !!k && !!r && k >= r.from && k <= r.to;

// The weekly report covers the last complete Sunday–Saturday week (it runs
// Sunday morning); the monthly report the last full month. In ET.
export function reportRange(type, now = new Date()) {
  const t = todayET(now);
  if (type === "weekly") { const thisSun = startOfWeek(t); const from = addDays(thisSun, -7); const to = addDays(thisSun, -1); return { preset: "custom", from, to, label: rangeLabel(from, to) }; }
  const from = addMonths(startOfMonth(t), -1); const to = endOfMonth(from);
  return { preset: "last_month", from, to, label: monthName(from, false) + " " + from.slice(0, 4) };
}

// ── Labels ──────────────────────────────────────────────────────────────────
const TYPE_LABEL = Object.fromEntries(JOB_TYPES.map(t => [t.value, t.label]));
export const jobTypeLabel = (v) => TYPE_LABEL[v] || "Other";
export const JOB_TYPE_ORDER = ["maintenance", "diagnostic_repair", "emergency", "battery_replacement", "warranty", "other"];
const METHOD_LABEL = { cash: "Cash", check: "Check", card: "Card", stripe: "Card (online)", stripe_app: "Card (Stripe App)", zelle: "Zelle", venmo: "Venmo", ach: "ACH / bank", no_charge: "No charge", other: "Other" };
export const paymentMethodLabel = (v) => METHOD_LABEL[v] || (v ? String(v).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "Not recorded");
export const PAID_VIA = [
  { value: "check", label: "Check" },
  { value: "distributor_credit", label: "Distributor credit" },
  { value: "ach", label: "ACH / bank transfer" },
  { value: "other", label: "Other" },
];
export const paidViaLabel = (v) => PAID_VIA.find(p => p.value === v)?.label || "Other";
export const EXPENSE_CATEGORIES = ["Parts & Supplies", "Fuel", "Tools & Equipment", "Insurance", "Marketing", "Professional Services", "Vehicle", "Software & Subscriptions", "Other"];

// The service type a paid invoice's revenue counts under.
export function revenueType(invoice, job) {
  if (isServiceType(job?.job_type)) return job.job_type;
  const lines = (invoice?.line_items || []).map(l => l?.description);
  return inferServiceType(lines) || "other";
}

// ── The numbers for one range ───────────────────────────────────────────────
// data: { invoices, expenses, jobs, warrantyClaims, customers, jobParts }
// (any may be missing). Rows as they come from the database.
export function computeFinance(data, range) {
  const invoices = data.invoices || [], expenses = data.expenses || [], jobs = data.jobs || [];
  const claims = data.warrantyClaims || [], customers = data.customers || [], jobParts = data.jobParts || [];
  const jobById = new Map(jobs.map(j => [j.id, j]));

  const paidAll = invoices.filter(i => i.status === "paid" && etDate(i.paid_date));
  const paid = paidAll.filter(i => inRange(etDate(i.paid_date), range));
  const invoiceRevenue = round2(paid.reduce((s, i) => s + num(i.total), 0));
  const surcharge = round2(paid.reduce((s, i) => s + num(i.surcharge_amount), 0));
  const tax = round2(paid.reduce((s, i) => s + num(i.tax_amount), 0));
  const claimsIn = claims.filter(c => inRange(etDate(c.date_paid), range));
  const warranty = round2(claimsIn.reduce((s, c) => s + num(c.amount_paid), 0));
  const revenue = round2(invoiceRevenue + warranty);

  const exp = expenses.filter(e => inRange(etDate(e.date), range));
  const expenseTotal = round2(exp.reduce((s, e) => s + num(e.amount), 0));
  const byCat = new Map();
  for (const e of exp) { const c = EXPENSE_CATEGORIES.includes(e.category) ? e.category : "Other"; const o = byCat.get(c) || { category: c, amount: 0, count: 0 }; o.amount += num(e.amount); o.count++; byCat.set(c, o); }
  const expensesByCategory = [...byCat.values()].map(o => ({ ...o, amount: round2(o.amount) })).sort((a, b) => b.amount - a.amount);

  // by job type (+ warranty reimbursements under Warranty)
  const types = new Map();
  const addType = (t, amt, n = 1) => { const o = types.get(t) || { type: t, label: jobTypeLabel(t), revenue: 0, count: 0 }; o.revenue += amt; o.count += n; types.set(t, o); };
  for (const i of paid) addType(revenueType(i, jobById.get(i.job_id)), num(i.total));
  if (claimsIn.length) addType("warranty", warranty, claimsIn.length);
  const byJobType = [...types.values()].map(o => ({ ...o, revenue: round2(o.revenue) }))
    .sort((a, b) => b.revenue - a.revenue || JOB_TYPE_ORDER.indexOf(a.type) - JOB_TYPE_ORDER.indexOf(b.type));

  // by tech (the job's assigned tech; warranty reimbursements are not a tech's)
  const techs = new Map();
  for (const i of paid) { const t = jobById.get(i.job_id)?.assigned_to_name || "Unassigned"; const o = techs.get(t) || { tech: t, revenue: 0, count: 0 }; o.revenue += num(i.total); o.count++; techs.set(t, o); }
  const byTech = [...techs.values()].map(o => ({ ...o, revenue: round2(o.revenue) })).sort((a, b) => b.revenue - a.revenue);

  // payments by method (+ warranty by how Generac/the distributor paid)
  const methods = new Map();
  const addM = (k, label, amt) => { const o = methods.get(k) || { method: k, label, amount: 0, count: 0 }; o.amount += amt; o.count++; methods.set(k, o); };
  for (const i of paid) addM(i.payment_method || "none", paymentMethodLabel(i.payment_method), num(i.total));
  for (const c of claimsIn) addM(`warranty_${c.paid_via || "other"}`, `Warranty · ${paidViaLabel(c.paid_via)}`, num(c.amount_paid));
  const byPaymentMethod = [...methods.values()].map(o => ({ ...o, amount: round2(o.amount) })).sort((a, b) => b.amount - a.amount);

  // jobs completed in the range
  const completed = jobs.filter(j => ["completed", "invoiced"].includes(j.status) && inRange(etDate(j.completed_date), range));
  const completedIds = new Set(completed.map(j => j.id));
  const completedByType = {};
  for (const j of completed) { const t = isServiceType(j.job_type) ? j.job_type : "other"; completedByType[t] = (completedByType[t] || 0) + 1; }
  // parts spend: catalog cost of the parts used on those jobs
  const partsSpend = round2(jobParts.filter(p => completedIds.has(p.job_id))
    .reduce((s, p) => s + (p.total_cost != null && p.total_cost !== "" ? num(p.total_cost) : num(p.cost) * (num(p.quantity) || 1)), 0));

  // customers: new = first paid invoice ever falls in the range; else returning
  const firstPaid = new Map();
  for (const i of paidAll) { const c = i.customer_id || i.customer_name; if (!c) continue; const k = etDate(i.paid_date); if (!firstPaid.has(c) || k < firstPaid.get(c)) firstPaid.set(c, k); }
  const custIn = new Set(paid.map(i => i.customer_id || i.customer_name).filter(Boolean));
  let newCustomers = 0; for (const c of custIn) if (inRange(firstPaid.get(c), range)) newCustomers++;

  // average ticket: invoice revenue / paid invoices that charged something
  const charged = paid.filter(i => num(i.total) > 0);
  const avgTicket = charged.length ? round2(charged.reduce((s, i) => s + num(i.total), 0) / charged.length) : 0;

  // maintenance agreements: sold (signed, start date in range) and members active at the range's end
  const signed = customers.filter(c => c.membership_signed && etDate(c.membership_start));
  const agreementsSold = signed.filter(c => inRange(etDate(c.membership_start), range)).length;
  const activeMembers = signed.filter(c => etDate(c.membership_start) <= range.to && (!etDate(c.membership_expiry) || etDate(c.membership_expiry) >= range.to)).length;
  const agreementRevenue = round2(paid.reduce((s, i) => s + (i.line_items || []).filter(l => /service agreement/i.test(l?.description || "")).reduce((a, l) => a + num(l.total), 0), 0));

  return {
    range,
    revenue, invoiceRevenue, warranty, surcharge, tax,
    paidInvoices: paid.length, warrantyClaims: claimsIn.length,
    expenses: expenseTotal, expenseCount: exp.length, expensesByCategory,
    net: round2(revenue - expenseTotal),
    margin: revenue > 0 ? round2(((revenue - expenseTotal) / revenue) * 100) : null,
    jobsCompleted: completed.length, completedByType,
    avgTicket, partsSpend,
    customersServed: custIn.size, newCustomers, returningCustomers: custIn.size - newCustomers,
    agreementsSold, activeMembers, agreementRevenue,
    byJobType, byTech, byPaymentMethod,
  };
}

// Up/down vs the previous period: null when there's nothing to compare to.
export function change(cur, prev) {
  if (prev == null || !Number.isFinite(prev) || prev === 0) return cur ? null : 0;
  return round2(((cur - prev) / Math.abs(prev)) * 100);
}

// ── Over time ───────────────────────────────────────────────────────────────
// Days for up to 2 weeks, Sunday weeks up to ~3 months, else months.
export function bucketsFor(range) {
  const span = daysBetween(range.from, range.to) + 1;
  const unit = span <= 14 ? "day" : span <= 93 ? "week" : "month";
  const out = [];
  if (unit === "day") for (let k = range.from; k <= range.to; k = addDays(k, 1)) out.push({ from: k, to: k, label: short(k) });
  else if (unit === "week") for (let k = startOfWeek(range.from); k <= range.to; k = addDays(k, 7)) { const a = k < range.from ? range.from : k; const b = addDays(k, 6) > range.to ? range.to : addDays(k, 6); out.push({ from: a, to: b, label: short(a) }); }
  else for (let k = startOfMonth(range.from); k <= range.to; k = addMonths(k, 1)) { const a = k < range.from ? range.from : k; const b = endOfMonth(k) > range.to ? range.to : endOfMonth(k); out.push({ from: a, to: b, label: monthName(k) }); }
  return { unit, buckets: out };
}
export function computeSeries(data, range) {
  const { unit, buckets } = bucketsFor(range);
  const points = buckets.map(b => {
    const f = computeFinance(data, { preset: "custom", from: b.from, to: b.to });
    return { label: b.label, from: b.from, to: b.to, revenue: f.revenue, invoiceRevenue: f.invoiceRevenue, warranty: f.warranty, expenses: f.expenses, profit: f.net, jobs: f.jobsCompleted, newCustomers: f.newCustomers, returningCustomers: f.returningCustomers };
  });
  return { unit, points };
}
