import { describe, it, expect } from "vitest";
import { computeJobFinancials, partChargeTotal } from "@/lib/utils/jobFinancials";
import { buildInvoiceLineItems } from "@/lib/utils/invoiceTotals";
import { completionEmailHTML } from "@/lib/emailTemplates";

// C1: a "No Charge" part (charge_for_part:false) must never add to any total,
// even when the row carries a non-zero price from an older edit.
const charged = { name: "P1", quantity: 2, price: 20, total_price: 40, total_cost: 20, charge_for_part: true };
const noChargePriced = { name: "P2", quantity: 1, price: 15, total_price: 15, total_cost: 5, charge_for_part: false };
const labor = [{ description: "Standard Hourly", hours: 1, rate: 115, total_price: 115, total_cost: 0 }];

describe("C1 no-charge parts never bill", () => {
  it("partChargeTotal is 0 for a no-charge line", () => {
    expect(partChargeTotal(noChargePriced)).toBe(0);
    expect(partChargeTotal(charged)).toBe(40);
    expect(partChargeTotal({ total_price: 12 })).toBe(12); // legacy rows without the flag stay charged
  });

  it("job totals exclude a priced no-charge line but keep its cost", () => {
    const f = computeJobFinancials([charged, noChargePriced], labor);
    expect(f.partsTotal).toBe(40);
    expect(f.subtotal).toBe(155);
    expect(f.partsCost).toBe(25);
    expect(f.taxAmount).toBe(Math.round(155 * 0.06625 * 100) / 100);
  });

  it("invoice parts_total equals the sum of the visible part lines", () => {
    const parts = [charged, noChargePriced];
    const f = computeJobFinancials(parts, labor);
    const lines = buildInvoiceLineItems(parts, labor);
    const visibleParts = lines.filter(l => l.type === "part").reduce((s, l) => s + l.total, 0);
    const visibleAll = lines.reduce((s, l) => s + l.total, 0);
    expect(visibleParts).toBe(f.partsTotal);
    expect(visibleAll).toBe(f.subtotal);
  });

  it("completion email total ignores the no-charge line", () => {
    const html = completionEmailHTML({ customer: { name: "A" }, job: { title: "T" }, parts: [charged, noChargePriced], labor });
    expect(html).toContain("$155.00");
    expect(html).not.toContain("$170.00");
    expect(html).not.toContain("P2 ×1");
  });
});
