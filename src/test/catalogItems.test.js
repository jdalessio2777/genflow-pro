import { describe, it, expect } from "vitest";
import {
  formFromRow, blankForm, validateForm, createPayload, updatePatch, changesTable, isFormDirty,
  fieldsFor, findCustomDuplicates, customFlatRateRow, customLineName, itemTypeKey,
} from "@/lib/utils/catalogItems";
import { buildLaborLine, groupLaborRates, isOfferedRate } from "@/lib/utils/laborPricing";
import { computeJobFinancials } from "@/lib/utils/jobFinancials";

const part = { id: "p1", name: "Oil filter", part_number: "OF-1", default_price: 12.5, cost: 6, description: null, category: "oil_filters", in_stock: 4, is_hidden: false, first_managed_at: "2026-01-01T00:00:00Z", reorder_flagged: false };
const flat = { id: "f1", name: "Starter swap", type: "flat_rate", category: "starters", flat_price: 450, flat_cost: 120, notes: "Incl. labor", is_hidden: false };
const hourly = { id: "h1", name: "Standard Hour", type: "hourly", category: "labor", rate: 115, cost_rate: 40, notes: null, is_hidden: false };

describe("catalog item types", () => {
  it("maps rows to dialog types", () => {
    expect(itemTypeKey(part, "parts")).toBe("part");
    expect(itemTypeKey(hourly, "labor_rates")).toBe("labor");
    expect(itemTypeKey(flat, "labor_rates")).toBe("flat_rate");
    expect(itemTypeKey({ type: "flat_rate", category: "maintenance" }, "labor_rates")).toBe("maintenance");
    expect(itemTypeKey({ type: "flat_rate", category: "service_agreements" }, "labor_rates")).toBe("service_agreement");
    expect(itemTypeKey({ type: "flat_rate", category: "discounts" }, "labor_rates")).toBe("discount");
  });

  it("a flat rate has no stock or part number; a part has both", () => {
    expect(fieldsFor("flat_rate")).toMatchObject({ stock: false, partNumber: false, price: true });
    expect(fieldsFor("part")).toMatchObject({ stock: true, partNumber: true });
    expect(fieldsFor("discount").price).toBe(false);
  });
});

describe("add item", () => {
  it("creates a flat rate row in labor_rates shape", () => {
    const f = { ...blankForm("flat_rate", "custom"), name: " QA flat ", price: "199.99", cost: "20", description: "desc" };
    expect(validateForm(f)).toBeNull();
    expect(createPayload(f)).toEqual({ name: "QA flat", type: "flat_rate", category: "custom", notes: "desc", is_hidden: false, flat_price: 199.99, flat_cost: 20 });
  });

  it("creates hourly labor and a managed part", () => {
    expect(createPayload({ ...blankForm("labor", "labor"), name: "OT", price: "150" })).toMatchObject({ type: "hourly", rate: 150, cost_rate: 0, category: "labor" });
    const p = createPayload({ ...blankForm("part", "hardware"), name: "Bolt", part_number: "B-1", price: "2", in_stock: "10" });
    expect(p).toMatchObject({ name: "Bolt", part_number: "B-1", default_price: 2, in_stock: 10, category: "hardware" });
    expect(p.first_managed_at).toBeTruthy();
  });

  it("fixed-category types ignore the category field", () => {
    expect(createPayload({ ...blankForm("maintenance"), name: "Tune-up", price: "300", category: "starters" }).category).toBe("maintenance");
  });

  it("rejects bad input", () => {
    expect(validateForm({ ...blankForm("part"), name: "" })).toMatch(/Name/);
    expect(validateForm({ ...blankForm("part"), name: "x", price: "abc" })).toMatch(/price/);
    expect(validateForm({ ...blankForm("part"), name: "x", in_stock: "1.5" })).toMatch(/Stock/);
  });
});

describe("edit item", () => {
  it("no change → no patch, not dirty", () => {
    expect(updatePatch(part, formFromRow(part, "parts"))).toEqual({});
    expect(isFormDirty(flat, "labor_rates", formFromRow(flat, "labor_rates"))).toBe(false);
    expect(isFormDirty(hourly, "labor_rates", formFromRow(hourly, "labor_rates"))).toBe(false);
  });

  it("patches only changed fields", () => {
    const f = { ...formFromRow(flat, "labor_rates"), name: "Starter replace", price: "475", description: "", category: "custom" };
    expect(updatePatch(flat, f)).toEqual({ name: "Starter replace", flat_price: 475, notes: null, category: "custom" });
  });

  it("every part field is editable", () => {
    const f = { ...formFromRow(part, "parts"), name: "OF", part_number: "OF-2", price: "13", cost: "7", description: "d", category: "hardware", in_stock: "0", is_hidden: true };
    expect(updatePatch(part, f)).toEqual({ name: "OF", part_number: "OF-2", default_price: 13, cost: 7, description: "d", category: "hardware", in_stock: 0, reorder_flagged: true, is_hidden: true });
  });

  it("hourly ↔ flat stays in labor_rates; part ↔ rate moves tables", () => {
    const f = { ...formFromRow(hourly, "labor_rates"), typeKey: "flat_rate", category: "custom" };
    expect(changesTable("labor_rates", f)).toBe(false);
    expect(updatePatch(hourly, f)).toMatchObject({ type: "flat_rate", flat_price: 115, flat_cost: 40, category: "custom" });
    expect(changesTable("parts", { ...formFromRow(part, "parts"), typeKey: "flat_rate" })).toBe(true);
  });
});

describe("hidden items", () => {
  it("are never offered on jobs", () => {
    expect(isOfferedRate(flat)).toBe(true);
    expect(isOfferedRate({ ...flat, is_hidden: true })).toBe(false);
    expect(groupLaborRates([hourly, { ...hourly, id: "h2", is_hidden: true }])[0].rates).toHaveLength(1);
  });
});

describe("custom flat rate on a job", () => {
  it("finds same-name custom rates only (case/space-insensitive)", () => {
    const rates = [
      { id: "a", type: "flat_rate", category: "custom", name: "Fuel  Regulator" },
      { id: "b", type: "flat_rate", category: "starters", name: "fuel regulator" },
    ];
    expect(findCustomDuplicates(rates, " fuel regulator ").map(r => r.id)).toEqual(["a"]);
    expect(findCustomDuplicates(rates, "other")).toEqual([]);
  });

  it("saves to the Custom folder", () => {
    expect(customFlatRateRow({ name: "X", price: 250, description: "" })).toEqual({ name: "X", type: "flat_rate", category: "custom", flat_price: 250, flat_cost: 0, notes: null, is_hidden: false });
  });

  it("member discount applies like any flat rate, and the line is taxed", () => {
    const name = customLineName({ name: "Fuel regulator", description: "Rebuilt" });
    expect(name).toBe("Fuel regulator — Rebuilt");
    const line = buildLaborLine({ rate: { type: "flat_rate", category: "custom", name, flat_price: 200, flat_cost: 0 }, jobId: "j", memberDiscountRate: 0.9 });
    expect(line).toMatchObject({ is_flat_rate: true, flat_rate_amount: 180, total_price: 180, description: "Fuel regulator — Rebuilt (Member 10% off)" });
    expect(computeJobFinancials([], [line]).taxAmount).toBe(11.93);
  });

  it("a later catalog price change does not touch a saved line", () => {
    const rate = { ...flat };
    const line = buildLaborLine({ rate, jobId: "j" });
    rate.flat_price = 999;
    expect(line.total_price).toBe(450);
  });
});
