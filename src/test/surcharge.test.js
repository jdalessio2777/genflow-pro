import { describe, it, expect } from "vitest";
import { surchargeConfig, surchargeFor, surchargeLabel, withResyncedSurcharge, SURCHARGE_DEFAULTS, feeSurchargeCents, processingFeeCents } from "@/lib/utils/surcharge";
import { computeJobFinancials } from "@/lib/utils/jobFinancials";
import { computeCharge } from "@/lib/utils/paymentAmounts";
import { invoiceSummaryHTML } from "@/lib/emailTemplates";

// Batch 3 Item 3, Run 9: the surcharge equals Stripe's ROUNDED fee on the
// amount actually charged (NJ P.L. 2023, c.146 caps it at processing cost).
// Defaults 2.7% + $0.05. s = the largest s with s <= round(0.027 x (T+s) + 5c).
// Worked by hand (cents), with the check that one cent more is over the fee:
//  $514.47 (Alfred): 0.027x52880 + 5 = 1432.76 -> 1433 = s ok; s+1: 1432.787 -> 1433 < 1434. Total $528.80
//  $16:      0.027x1650   + 5 = 49.55    -> 50   ok; s+1: 49.577   -> 50   < 51
//  $100:     0.027x10283  + 5 = 282.641  -> 283  ok; s+1: 282.668  -> 283  < 284
//  $239.37:  0.027x24606  + 5 = 669.362  -> 669  ok; s+1: 669.389  -> 669  < 670
//  $500:     0.027x51393  + 5 = 1392.611 -> 1393 ok; s+1: 1392.638 -> 1393 < 1394
//  $1,000:   0.027x102780 + 5 = 2780.06  -> 2780 ok; s+1: 2780.087 -> 2780 < 2781
//  $3,499:   0.027x359615 + 5 = 9714.605 -> 9715 ok; s+1: 9714.632 -> 9715 < 9716
// Stripe keeps exactly the surcharge: the business nets exactly T.
const CASES = [
  { T: 51447, s: 1433 },
  { T: 1600, s: 50 },
  { T: 10000, s: 283 },
  { T: 23937, s: 669 },
  { T: 50000, s: 1393 },
  { T: 100000, s: 2780 },
  { T: 349900, s: 9715 },
];
describe("credit card surcharge = Stripe's rounded fee", () => {
  CASES.forEach(({ T, s: sc }) => it(`T=$${T / 100}: surcharge ${sc}c = Stripe's rounded fee, nets exactly T`, () => {
    expect(feeSurchargeCents(T)).toBe(sc);
    expect(processingFeeCents(T + sc)).toBe(sc);
    expect(processingFeeCents(T + sc + 1)).toBeLessThan(sc + 1); // one cent more would be over the fee
    // invoice path + in-app card (server) use the same function
    const inv = { parts_total: T / 100, labor_total: 0, tax_amount: 0, total: T / 100, status: "sent" };
    expect(surchargeFor(inv)).toBe(sc / 100);
    expect(computeCharge(inv, "credit").surchargeCents).toBe(sc);
    expect(computeCharge(inv, "debit").surchargeCents).toBe(0);
  }));

  it("Alfred Weller: $514.47 -> $14.33, total $528.80", () => {
    const inv = { parts_total: 0, labor_total: 514.47, tax_amount: 0, status: "sent" }; // his balance owed
    expect(surchargeFor(inv)).toBe(14.33);
    expect(Math.round((514.47 + surchargeFor(inv)) * 100)).toBe(52880);
  });

  it("for every total from 1c to $5,000: equals the rounded fee, and 1c more would be over it", () => {
    const bad = [];
    for (let T = 1; T <= 500000; T++) {
      const sc = feeSurchargeCents(T);
      if (sc !== processingFeeCents(T + sc) || sc + 1 <= processingFeeCents(T + sc + 1)) bad.push(T);
    }
    expect(bad).toEqual([]);
  });

  it("other fee settings (2.9% + 30c) hold the same rule", () => {
    const cfg = surchargeConfig({ card_surcharge_rate: "2.9", card_surcharge_fixed: "0.30" });
    const bad = [];
    for (let T = 1; T <= 200000; T += 7) {
      const sc = feeSurchargeCents(T, cfg);
      if (sc !== processingFeeCents(T + sc, cfg)) bad.push(T);
    }
    expect(bad).toEqual([]);
  });

  it("a fee that lands on exactly half a cent rounds up, as written", () => {
    // 0.027 x 1500 + 5 = 45.5 exactly (floating point says 45.49999…)
    expect(processingFeeCents(1500)).toBe(46);
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
    // $100: 2.83 + tax 0.1875 -> 0.19 = 3.02
    expect(surchargeFor({ parts_total: 100, labor_total: 0, tax_amount: 0, status: "sent" }, cfg)).toBe(3.02);
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
    const existing = { parts_total: 100, labor_total: 0, tax_amount: 0, status: "sent", surcharge_amount: 2.83 };
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
