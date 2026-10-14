import { describe, it, expect } from "vitest";
import { buildLaborLine, groupHourlyRates, memberPrice } from "@/lib/utils/laborPricing";
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

describe("labor pricing", () => {
  it("groups catalog hourly rates; placeholders hidden; unknown category → Other", () => {
    const g = groupHourlyRates(catalog);
    expect(g.map(x => x.key)).toEqual(["labor", "after_hours", "other"]);
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
