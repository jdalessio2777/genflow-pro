import { describe, it, expect } from "vitest";
import { buildLaborLine, groupLaborRates, memberPrice, ratePrice, descriptionAfterPriceEdit, stripMemberLabel } from "@/lib/utils/laborPricing";
import { isActiveMember, memberDiscountRateFor } from "@/lib/utils/membership";

// H-5 / B-04: job labor choices come from the catalog; the price shown is
// the price charged. B-02: agreements never discounted. D-01: expiry.
const catalog = [
  { id: "a", name: "Standard Hour", type: "hourly", category: "labor", rate: 115 },
  { id: "b", name: "Standard ½ Hour", type: "hourly", category: "labor", rate: 60 },
  { id: "c", name: "Saturday after 3:30 PM / Sunday / Holiday", type: "hourly", category: "after_hours", rate: 340 },
  { id: "d", name: "Emergency Hourly", type: "hourly", category: undefined, rate: 245 },
  { id: "e", name: "Liquid placeholder", type: "hourly", category: "labor", rate: 1, notes: "PLACEHOLDER — Do not add" },
  { id: "f", name: "Tune-Up", type: "flat_rate", category: "maintenance", flat_price: 295, flat_cost: 27 },
];

describe("Decision 1: emergency rates on the Labor tab", () => {
  it("hourly + flat 'emergency' rows form the Emergency group; other flat rates stay off the Labor tab", () => {
    const rates = [
      ...catalog,
      { id: "eh", name: "Emergency Hourly", type: "hourly", category: "emergency", rate: 245 },
      { id: "ef", name: "Emergency Dispatch Fee", type: "flat_rate", category: "emergency", flat_price: 75 },
    ];
    const g = groupLaborRates(rates);
    const em = g.find(x => x.key === "emergency");
    expect(em.rates.map(r => r.name)).toEqual(["Emergency Hourly", "Emergency Dispatch Fee"]);
    expect(g.flatMap(x => x.rates).some(r => r.name === "Tune-Up")).toBe(false);
    expect(ratePrice(em.rates[1])).toBe(75);
    expect(buildLaborLine({ rate: em.rates[1], jobId: "j" })).toMatchObject({ is_flat_rate: true, total_price: 75 });
  });
});

describe("labor pricing", () => {
  it("groups catalog hourly rates; placeholders hidden; unknown category → Other", () => {
    const g = groupLaborRates(catalog);
    expect(g.map(x => x.key)).toEqual(["labor", "after_hours", "other"]); // no emergency rows in this list
    expect(g[0].rates.map(r => r.name)).toEqual(["Standard Hour", "Standard ½ Hour"]);
    expect(g[1].rates[0].rate).toBe(340);
    expect(g[2].rates[0].name).toBe("Emergency Hourly");
  });

  it("the stored line uses the catalog price at add time", () => {
    const line = buildLaborLine({ rate: catalog[2], jobId: "j" });
    expect(line).toMatchObject({ rate: 340, total_price: 340, hours: 1, is_flat_rate: false });
    const edited = buildLaborLine({ rate: { ...catalog[2], rate: 355 }, jobId: "j" });
    expect(edited.total_price).toBe(355);
  });

  it("member price shown == member price charged (to the cent)", () => {
    const shown = memberPrice(125, 0.9);
    const line = buildLaborLine({ rate: { name: "First ½ Hour", type: "hourly", rate: 125 }, jobId: "j", memberDiscountRate: 0.9 });
    expect(shown).toBe(112.5);
    expect(line.total_price).toBe(112.5);
  });

  it("agreements are never member-discounted", () => {
    const line = buildLaborLine({ rate: { name: "Service Agreement (Air-Cooled) — Annual", type: "flat_rate", category: "service_agreements", flat_price: 325 }, jobId: "j", memberDiscountRate: 0.9 });
    expect(line.total_price).toBe(325);
    expect(line.description).not.toMatch(/Member/);
  });

  it("discount rows are a % of the subtotal", () => {
    const line = buildLaborLine({ rate: { name: "Loyalty Discount", type: "flat_rate", category: "discounts", flat_price: 0, notes: "10% general discount" }, jobId: "j", subtotal: 200 });
    expect(line.total_price).toBe(-20);
  });
});

describe("membership (D-01)", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  it("expired plan: no discount", () => {
    const c = { membership_plan: "annual", membership_signed: true, membership_expiry: "2025-06-01" };
    expect(isActiveMember(c, now)).toBe(false);
    expect(memberDiscountRateFor(c, now)).toBe(1.0);
  });
  it("active plans: 10% / 15%", () => {
    expect(memberDiscountRateFor({ membership_plan: "annual", membership_signed: true, membership_expiry: "2027-01-01" }, now)).toBe(0.9);
    expect(memberDiscountRateFor({ membership_plan: "semi_annual", membership_signed: true, membership_expiry: "2027-01-01" }, now)).toBe(0.85);
    expect(memberDiscountRateFor({ membership_plan: "annual", membership_signed: false }, now)).toBe(1.0);
  });
});

// B5b: the member label always matches the price after a manual edit.
describe('descriptionAfterPriceEdit (B5b)', () => {
  const rates = [
    { name: 'Standard Labor', type: 'hourly', category: 'labor', rate: 150 },
    { name: 'Starter Replacement', type: 'flat_rate', category: 'starters', flat_price: 400 },
    { name: 'Annual Agreement', type: 'flat_rate', category: 'service_agreements', flat_price: 325 },
  ]
  const hourly = { description: 'Standard Labor (Member 10% off)', is_flat_rate: false, rate: 135, hours: 1 }
  const flat = { description: 'Starter Replacement (Member 15% off)', is_flat_rate: true, flat_rate_amount: 340 }
  it('drops the label when the edited price is not the member price', () => {
    expect(descriptionAfterPriceEdit({ line: hourly, newPrice: 120, rates, memberDiscountRate: 0.9 })).toBe('Standard Labor')
    expect(descriptionAfterPriceEdit({ line: flat, newPrice: 400, rates, memberDiscountRate: 0.85 })).toBe('Starter Replacement')
  })
  it('keeps / restores the label when the price is (set back to) the member price', () => {
    expect(descriptionAfterPriceEdit({ line: { ...hourly, description: 'Standard Labor', rate: 120 }, newPrice: 135, rates, memberDiscountRate: 0.9 })).toBe('Standard Labor (Member 10% off)')
    expect(descriptionAfterPriceEdit({ line: { ...flat, flat_rate_amount: 300 }, newPrice: 340, rates, memberDiscountRate: 0.85 })).toBe('Starter Replacement (Member 15% off)')
  })
  it('leaves the description alone when the price did not change', () => {
    expect(descriptionAfterPriceEdit({ line: hourly, newPrice: 135, rates: [], memberDiscountRate: 1 })).toBe(hourly.description)
  })
  it('non-members, unknown lines, agreements and type mismatches never get a label', () => {
    expect(descriptionAfterPriceEdit({ line: { ...hourly, rate: 150, description: 'Standard Labor' }, newPrice: 135, rates, memberDiscountRate: 1 })).toBe('Standard Labor')
    expect(descriptionAfterPriceEdit({ line: { description: 'Custom thing (Member 10% off)', is_flat_rate: true, flat_rate_amount: 90 }, newPrice: 80, rates, memberDiscountRate: 0.9 })).toBe('Custom thing')
    expect(descriptionAfterPriceEdit({ line: { description: 'Annual Agreement', is_flat_rate: true, flat_rate_amount: 325 }, newPrice: 292.5, rates, memberDiscountRate: 0.9 })).toBe('Annual Agreement')
    expect(descriptionAfterPriceEdit({ line: { description: 'Standard Labor', is_flat_rate: true, flat_rate_amount: 150 }, newPrice: 135, rates, memberDiscountRate: 0.9 })).toBe('Standard Labor')
  })
  it('stripMemberLabel only removes the trailing member suffix', () => {
    expect(stripMemberLabel('A (Member 10% off)')).toBe('A')
    expect(stripMemberLabel('A (note)')).toBe('A (note)')
  })
})
