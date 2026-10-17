import { describe, it, expect } from "vitest";
import { surchargeConfig, surchargeFor, surchargeLabel, withResyncedSurcharge, SURCHARGE_DEFAULTS, feeSurchargeCents, processingFeeCents } from "@/lib/utils/surcharge";
import { computeJobFinancials } from "@/lib/utils/jobFinancials";
import { computeCharge } from "@/lib/utils/paymentAmounts";
import { invoiceSummaryHTML } from "@/lib/emailTemplates";

// Batch 3 Item 3: the surcharge equals Stripe's fee on the amount actually
// charged (NJ P.L. 2023, c.146 caps it at processing cost). Defaults 2.7% + $0.05.
// s = (0.027 x T + 0.05) / 0.973, rounded; minus 1 cent if above 0.027 x (T+s) + 0.05.
// Worked by hand (cents):
//  $16:      (43.2 + 5)/0.973   = 49.5375 -> 50; cap 0.027x1650+5 = 49.55 -> over -> 49 ($0.49)
//  $100:     (270 + 5)/0.973    = 282.631 -> 283; cap 282.641 -> over -> 282 ($2.82)
//  $239.37:  (646.299 + 5)/0.973= 669.372 -> 669; cap 669.362 ok   ($6.69)
//  $500:     (1350 + 5)/0.973   = 1392.600 -> 1393; cap 1392.611 -> over -> 1392 ($13.92)
//  $1,000:   (2700 + 5)/0.973   = 2780.062 -> 2780; cap 2780.060 ok ($27.80)
//  $3,499:   (9447.3 + 5)/0.973 = 9714.594 -> 9715; cap 9714.605 -> over -> 9714 ($97.14)
// Stripe then keeps round(0.027 x charge + 5c): the business nets T (0c) or T - 1c.
const SIX = [
  { T: 1600, s: 49, fee: 50 },
  { T: 10000, s: 282, fee: 283 },
  { T: 23937, s: 669, fee: 669 },
  { T: 50000, s: 1392, fee: 1393 },
  { T: 100000, s: 2780, fee: 2780 },
  { T: 349900, s: 9714, fee: 9715 },
];
describe("credit card surcharge = exact Stripe fee", () => {
  SIX.forEach(({ T, s: sc, fee }) => it(`T=$${T / 100}: surcharge ${sc}c, never above the fee, nets T within 1c`, () => {
    expect(feeSurchargeCents(T)).toBe(sc);
    expect(sc).toBeLessThanOrEqual(0.027 * (T + sc) + 5);
    expect(processingFeeCents(T + sc)).toBe(fee);
    const net = T + sc - processingFeeCents(T + sc);
    expect(T - net).toBeGreaterThanOrEqual(0);
    expect(T - net).toBeLessThanOrEqual(1);
    // invoice path + in-app card (server) use the same function
    const inv = { parts_total: T / 100, labor_total: 0, tax_amount: 0, total: T / 100, status: "sent" };
    expect(surchargeFor(inv)).toBe(sc / 100);
    expect(computeCharge(inv, "credit").surchargeCents).toBe(sc);
    expect(computeCharge(inv, "debit").surchargeCents).toBe(0);
  }));

  it("never exceeds the fee for any total from 1c to $5,000", () => {
    const bad = [];
    for (let T = 1; T <= 500000; T++) {
      const sc = feeSurchargeCents(T);
      if (sc > 0.027 * (T + sc) + 5 + 1e-9 || T + sc - processingFeeCents(T + sc) < T - 1) bad.push(T);
    }
    expect(bad).toEqual([]);
  });

  it("works on the final total after discounts and NJ tax", () => {
    const f = computeJobFinancials([{ total_price: 100 }], [{ total_price: 200 }, { total_price: -30 }]);
    const inv = { parts_total: f.partsTotal, labor_total: f.laborTotal, tax_amount: f.taxAmount, total: f.total, status: "sent" };
    // 270 + tax 17.89 = 287.89 -> (777.303 + 5)/0.973 = 804.0113 -> 804; cap 0.027x29593+5 = 804.011 ok
    expect(surchargeFor(inv)).toBe(8.04);
  });

  it("$0 and negative invoices get no surcharge", () => {
    expect(surchargeFor({ parts_total: 0, labor_total: 0, tax_amount: 0 })).toBe(0);
    expect(surchargeFor({ parts_total: 0, labor_total: -20, tax_amount: -1.33 })).toBe(0);
  });

  it("taxable setting adds NJ tax on the surcharge itself", () => {
    const cfg = surchargeConfig([{ key: "card_surcharge_taxable", value: "true" }]);
    // $100: 2.82 + tax 0.1868 -> 0.19 = 3.01
    expect(surchargeFor({ parts_total: 100, labor_total: 0, tax_amount: 0, status: "sent" }, cfg)).toBe(3.01);
  });

  it("config: defaults, percent or fraction, bad values fall back", () => {
    expect(surchargeConfig([])).toEqual(SURCHARGE_DEFAULTS);
    expect(SURCHARGE_DEFAULTS).toEqual({ rate: 0.027, fixed: 0.05, taxable: false });
    expect(surchargeConfig({ card_surcharge_rate: "2.9" }).rate).toBeCloseTo(0.029, 10);
    expect(surchargeConfig({ card_surcharge_rate: "0.02" }).rate).toBe(0.02);
    expect(surchargeConfig({ card_surcharge_rate: "9" }).rate).toBe(0.027);
    expect(surchargeConfig({ card_surcharge_rate: "abc" }).rate).toBe(0.027);
    expect(surchargeConfig({ card_surcharge_fixed: "0.30" }).fixed).toBe(0.3);
    expect(surchargeConfig({ card_surcharge_fixed: "5" }).fixed).toBe(0.05);
    expect(surchargeConfig({ card_surcharge_fixed: "-1" }).fixed).toBe(0.05);
    expect(surchargeLabel()).toBe("Credit card surcharge");
  });

  it("re-sync recomputes an existing surcharge, never adds one, skips paid", () => {
    const existing = { parts_total: 100, labor_total: 0, tax_amount: 0, status: "sent", surcharge_amount: 2.82 };
    const fresh = { parts_total: 1000, labor_total: 0, tax_amount: 0 };
    expect(withResyncedSurcharge(fresh, existing).surcharge_amount).toBe(27.8);
    expect(withResyncedSurcharge(fresh, { ...existing, surcharge_amount: 0 }).surcharge_amount).toBeUndefined();
    expect(withResyncedSurcharge(fresh, { ...existing, status: "paid" }).surcharge_amount).toBeUndefined();
  });

  it("invoice/receipt email shows its own line and includes it in Total", () => {
    const inv = { parts_total: 239.37, labor_total: 0, tax_amount: 0, surcharge_amount: 6.69, invoice_number: "INV-1", line_items: [], paid_date: "2026-10-14T12:00:00Z", payment_method: "stripe_app", status: "paid" };
    const html = invoiceSummaryHTML({ invoice: inv, customer: { name: "A" } });
    expect(html).toContain("Credit card surcharge");
    expect(html).not.toMatch(/surcharge \(\d/);
    expect(html).toContain("$6.69");
    expect(html).toContain("$246.06");
  });
});
