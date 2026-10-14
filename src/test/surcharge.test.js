import { describe, it, expect } from "vitest";
import { surchargeConfig, surchargeFor, surchargeLabel, withResyncedSurcharge, SURCHARGE_DEFAULTS } from "@/lib/utils/surcharge";
import { computeJobFinancials } from "@/lib/utils/jobFinancials";
import { computeCharge } from "@/lib/utils/paymentAmounts";
import { invoiceSummaryHTML } from "@/lib/emailTemplates";

// Part 2: credit card surcharge on the FINAL total (after discounts and NJ
// tax), not taxed by default. Expected values worked out by hand:
//  1) parts 100 + labor 200 - 10% discount 30 = 270; tax 17.8875 -> 17.89; owed 287.89; 3% = 8.6367 -> 8.64; total 296.53
//  2) labor 115; tax 7.61875 -> 7.62; owed 122.62; 3% = 3.6786 -> 3.68; total 126.30
//  3) parts 1234.56 + labor 340 - 78.73 = 1495.83; tax 99.0987 -> 99.10; owed 1594.93; 3% = 47.8479 -> 47.85; total 1642.78
//  4) labor 0.50; tax 0.033125 -> 0.03; owed 0.53; 3% = 0.0159 -> 0.02; total 0.55
//  5) parts 3499; tax 231.80875 -> 231.81; owed 3730.81; 3% = 111.9243 -> 111.92; total 3842.73
const cases = [
  { parts: [100], labor: [200, -30], owed: 287.89, s: 8.64, total: 296.53 },
  { parts: [], labor: [115], owed: 122.62, s: 3.68, total: 126.30 },
  { parts: [1234.56], labor: [340, -78.73], owed: 1594.93, s: 47.85, total: 1642.78 },
  { parts: [], labor: [0.5], owed: 0.53, s: 0.02, total: 0.55 },
  { parts: [3499], labor: [], owed: 3730.81, s: 111.92, total: 3842.73 },
];

function invoiceOf(c) {
  const f = computeJobFinancials(c.parts.map(p => ({ total_price: p })), c.labor.map(l => ({ total_price: l })));
  return { parts_total: f.partsTotal, labor_total: f.laborTotal, tax_amount: f.taxAmount, total: f.total, status: "sent" };
}

describe("credit card surcharge math", () => {
  cases.forEach((c, i) => it(`case ${i + 1}: owed ${c.owed} -> surcharge ${c.s} -> total ${c.total}`, () => {
    const inv = invoiceOf(c);
    expect(Math.round((inv.parts_total + inv.labor_total + inv.tax_amount) * 100) / 100).toBe(c.owed);
    const s = surchargeFor(inv);
    expect(s).toBe(c.s);
    expect(Math.round((c.owed + s) * 100) / 100).toBe(c.total);
    // the in-app card form (server) computes the same surcharge for a credit card
    expect(computeCharge(inv, "credit").surchargeCents).toBe(Math.round(c.s * 100));
    expect(computeCharge(inv, "debit").surchargeCents).toBe(0);
  }));

  it("$0 and negative invoices get no surcharge", () => {
    expect(surchargeFor({ parts_total: 0, labor_total: 0, tax_amount: 0 })).toBe(0);
    expect(surchargeFor({ parts_total: 0, labor_total: -20, tax_amount: -1.33 })).toBe(0);
  });

  it("taxable setting adds NJ tax on the surcharge itself", () => {
    const cfg = surchargeConfig([{ key: "card_surcharge_taxable", value: "true" }]);
    // case 2: 3.68 + tax 0.2438 -> 0.24 = 3.92
    expect(surchargeFor(invoiceOf(cases[1]), cfg)).toBe(3.92);
  });

  it("config: defaults, percent or fraction, bad values fall back", () => {
    expect(surchargeConfig([])).toEqual(SURCHARGE_DEFAULTS);
    expect(surchargeConfig({ card_surcharge_rate: "2.5" }).rate).toBe(0.025);
    expect(surchargeConfig({ card_surcharge_rate: "0.02" }).rate).toBe(0.02);
    expect(surchargeConfig({ card_surcharge_rate: "9" }).rate).toBe(0.03);
    expect(surchargeConfig({ card_surcharge_rate: "abc" }).rate).toBe(0.03);
    expect(surchargeLabel()).toBe("Credit card surcharge (3%)");
    expect(surchargeLabel({ rate: 0.025 })).toBe("Credit card surcharge (2.5%)");
  });

  it("re-sync recomputes an existing surcharge, never adds one, skips paid", () => {
    const existing = { ...invoiceOf(cases[1]), surcharge_amount: 3.68 };
    const fresh = invoiceOf(cases[0]);
    expect(withResyncedSurcharge(fresh, existing).surcharge_amount).toBe(8.64);
    expect(withResyncedSurcharge(fresh, { ...existing, surcharge_amount: 0 }).surcharge_amount).toBeUndefined();
    expect(withResyncedSurcharge(fresh, { ...existing, status: "paid" }).surcharge_amount).toBeUndefined();
  });

  it("invoice/receipt email shows its own line and includes it in Total", () => {
    const inv = { ...invoiceOf(cases[0]), surcharge_amount: 8.64, invoice_number: "INV-1", line_items: [], paid_date: "2026-10-14T12:00:00Z", payment_method: "stripe_app" };
    const html = invoiceSummaryHTML({ invoice: inv, customer: { name: "A" } });
    expect(html).toContain("Credit card surcharge (3%)");
    expect(html).toContain("$8.64");
    expect(html).toContain("$296.53");
  });
});
