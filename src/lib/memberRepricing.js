// "Apply member pricing" to a job's existing lines (Run 8, B5).
//
// Member prices are set when a line is added (buildLaborLine, JobPartsTab), so
// lines added before the customer signed stay at full price. This plans the
// change for those lines, with the same price function the app uses
// everywhere (memberPrice) and the same label buildLaborLine puts on labor.
//
// A line is repriced only when its current unit price IS today's catalog list
// price, so it can never be discounted twice:
// - labor (hourly and flat rates): the catalog rate with the same name
//   (label stripped); the "(Member N% off)" label is added, like a new line;
// - parts: the catalog part it was added from (part_id), at default_price;
//   part names carry no label (same as parts added for a member).
// Never repriced (listed in `skipped` with the reason): the Service Agreement
// line, discount lines, "No charge" parts, lines already at the member price
// or labelled, prices changed by hand, and items that aren't in the catalog.
// Totals then come from computeJobFinancials like any other line change.
import { round2, memberPrice, memberLabel, stripMemberLabel, isAgreementRate, ratePrice } from "@/lib/utils/laborPricing";

// Lines can still be repriced while the job is open (the invoice is built
// from the lines at completion); never after.
export const canRepriceJob = (job) => !!job && !["completed", "invoiced", "canceled"].includes(job.status);

const LABELLED = /\(Member \d+% off\)\s*$/;

export function planMemberRepricing({ parts = [], labor = [], catalogParts = [], rates = [], memberDiscountRate = 1.0 }) {
  const updates = [];
  const skipped = [];
  if (!(memberDiscountRate < 1.0)) return { updates, skipped, savings: 0 };
  const label = ` (${memberLabel(memberDiscountRate)})`;

  for (const l of labor) {
    const name = stripMemberLabel(l.description);
    const unit = round2(l.is_flat_rate ? l.flat_rate_amount : l.rate);
    if (l.requires_agreement) { skipped.push({ kind: "labor", id: l.id, name, reason: "Service Agreement" }); continue; }
    if ((Number(l.total_price) || 0) <= 0) { skipped.push({ kind: "labor", id: l.id, name, reason: (Number(l.total_price) || 0) < 0 ? "Discount line" : "No charge" }); continue; }
    if (LABELLED.test(l.description || "")) { skipped.push({ kind: "labor", id: l.id, name, reason: "Already member-priced" }); continue; }
    // Jobs made from a quote store an hourly line as a flat "Name (1h)" line.
    const quoteHour = l.is_flat_rate && /\s\(1h\)$/.test(name);
    const rate = quoteHour
      ? rates.find(r => r?.name === name.replace(/\s\(1h\)$/, "") && r.type === "hourly")
      : rates.find(r => r?.name === name && (l.is_flat_rate ? r.type !== "hourly" : r.type === "hourly"));
    if (!rate) { skipped.push({ kind: "labor", id: l.id, name, reason: "Not a catalog item" }); continue; }
    if (isAgreementRate(rate)) { skipped.push({ kind: "labor", id: l.id, name, reason: "Service Agreement" }); continue; }
    if (rate.category === "discounts") { skipped.push({ kind: "labor", id: l.id, name, reason: "Discount line" }); continue; }
    const list = round2(ratePrice(rate));
    const member = memberPrice(list, memberDiscountRate);
    if (unit === member) { skipped.push({ kind: "labor", id: l.id, name, reason: "Already member-priced" }); continue; }
    if (unit !== list) { skipped.push({ kind: "labor", id: l.id, name, reason: "Price was changed by hand" }); continue; }
    const before = round2(l.total_price);
    if (l.is_flat_rate) {
      updates.push({ kind: "labor", id: l.id, name, before, after: member,
        patch: { flat_rate_amount: member, total_price: member, description: name + label } });
    } else {
      const after = round2(member * (Number(l.hours) || 0));
      updates.push({ kind: "labor", id: l.id, name, before, after,
        patch: { rate: member, total_price: after, description: name + label } });
    }
  }

  for (const p of parts) {
    const name = p.name || "Part";
    if (p.charge_for_part === false || !(Number(p.price) > 0)) { skipped.push({ kind: "part", id: p.id, name, reason: "No charge" }); continue; }
    const cat = p.part_id ? catalogParts.find(c => c.id === p.part_id) : null;
    if (!cat) { skipped.push({ kind: "part", id: p.id, name, reason: "Not a catalog item" }); continue; }
    const list = round2(cat.default_price);
    const unit = round2(p.price);
    const member = memberPrice(list, memberDiscountRate);
    if (unit === member) { skipped.push({ kind: "part", id: p.id, name, reason: "Already member-priced" }); continue; }
    if (unit !== list || !(list > 0)) { skipped.push({ kind: "part", id: p.id, name, reason: "Price was changed by hand" }); continue; }
    const qty = Number(p.quantity) || 1;
    const after = round2(member * qty);
    updates.push({ kind: "part", id: p.id, name, before: round2(p.total_price), after, patch: { price: member, total_price: after } });
  }

  const savings = round2(updates.reduce((s, u) => s + (u.before - u.after), 0));
  return { updates, skipped, savings };
}

// Writes the planned changes, one row at a time; returns how many were saved.
// Re-planning first on fresh rows makes a repeat (double tap, second phone,
// retry after a lost response) a no-op for lines already done.
export async function applyMemberRepricing(db, updates) {
  let done = 0;
  for (const u of updates) {
    if (u.kind === "labor") await db.JobLabor.update(u.id, u.patch);
    else await db.JobPart.update(u.id, u.patch);
    done++;
  }
  return done;
}
