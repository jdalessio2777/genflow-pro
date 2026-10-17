import { describe, it, expect } from "vitest";
import { computeQuoteTotals, priceQuoteLine, memberSavings, agreementTypeForRate, quoteLinesAsJobRows } from "@/lib/utils/quoteTotals";
import { computeJobFinancials } from "@/lib/utils/jobFinancials";
import { quoteEmailHTML } from "@/lib/emailTemplates";

// H-3 / B-01: quotes use the invoice rules — member price per line, NJ tax,
// and "Total Due" equals what the approved job will bill.
const base = [
  { type: "part", base_description: "QA Part", base_unit_price: 123.45, quantity: 1, discountable: true },
  { type: "labor", base_description: "Standard Hour (1h)", base_unit_price: 115, quantity: 1, discountable: true },
  { type: "labor", base_description: "Service Agreement (Air-Cooled) — Annual", base_unit_price: 325, quantity: 1, discountable: false },
];

describe("quote totals", () => {
  it("audit example: annual member → $575.36 (was $563.45 quoted, $600.78 billed)", () => {
    const priced = base.map(l => priceQuoteLine(l, 0.9));
    expect(priced.map(l => l.total_price)).toEqual([111.11, 103.5, 325]);
    const t = computeQuoteTotals(priced);
    expect(t).toEqual({ subtotal: 539.61, taxAmount: 35.75, total: 575.36 });
    expect(memberSavings(base, 0.9)).toBe(23.84);
  });

  it("non-member: tax added to Total Due", () => {
    const t = computeQuoteTotals(base.map(l => priceQuoteLine(l, 1)));
    expect(t).toEqual({ subtotal: 563.45, taxAmount: 37.33, total: 600.78 });
  });

  it("quote total == approved job's invoice total (same function)", () => {
    const priced = base.map(l => priceQuoteLine(l, 0.85));
    const { parts, labor } = quoteLinesAsJobRows(priced);
    expect(computeQuoteTotals(priced).total).toBeCloseTo(computeJobFinancials(parts, labor).total, 2);
  });

  it("agreement lines map to the signing requirement", () => {
    expect(agreementTypeForRate({ category: "service_agreements", name: "Service Agreement (Air-Cooled) — Semi-Annual" })).toBe("semi_annual_air_cooled");
    expect(agreementTypeForRate({ category: "service_agreements", name: "Service Agreement (Air-Cooled) — Annual" })).toBe("annual_air_cooled");
    expect(agreementTypeForRate({ category: "service_agreements", name: "Service Agreement (Liquid-Cooled) — Annual" })).toBeNull();
    expect(agreementTypeForRate({ category: "labor", name: "Standard Hour" })).toBeNull();
  });

  it("email shows NJ tax and the real Total Due", () => {
    const html = quoteEmailHTML({ customer: { name: "A" }, job: { id: "q" }, lineItems: [], subtotal: 539.61, tax: 35.75, memberSavings: 23.84, total: 575.36 });
    expect(html).toContain("NJ Sales Tax (6.625%)");
    expect(html).toContain("$35.75");
    expect(html).toContain("$575.36");
    expect(html).toContain("member savings of $23.84");
  });
});
