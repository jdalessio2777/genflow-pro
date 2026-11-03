import { describe, it, expect } from "vitest";
import {
  generatorLine, generatorSummary, generatorsOf, generatorFor, normalizeBrand, normalizeKw, splitLegacyModel, installDateLabel,
  generatorChanges, generatorPatch,
} from "@/lib/generatorInfo";
import { confirmationEmailHTML, completionEmailHTML, invoiceSummaryHTML } from "@/lib/emailTemplates";

const FIELDS = ["generator_brand", "generator_kw", "generator_model", "generator_serial", "generator_install_date", "generator_cooling", "run_hours", "battery_static_v", "checklist_notes"].map((id) => ({ id }));
const don = { generator_brand: "Generac", generator_kw: 17, generator_model: "0060531", generator_serial: "6737426" };

describe("generatorLine (A3)", () => {
  it("prints the clean line", () => {
    expect(generatorLine(don)).toBe("Generac 17kW · Model 0060531 · S/N 6737426");
  });
  it("leaves empty parts out: no dashes or stray separators", () => {
    expect(generatorLine({ generator_serial: "123" })).toBe("S/N 123");
    expect(generatorLine({ generator_brand: "Kohler" })).toBe("Kohler");
    expect(generatorLine({ generator_model: "14RESA", generator_serial: "" })).toBe("Model 14RESA");
    expect(generatorLine({})).toBe("");
    expect(generatorLine(null)).toBe("");
  });
  it("old model boxes holding brand / size never print as a model", () => {
    expect(generatorLine({ generator_model: "17kW Generac", generator_serial: "6737426" })).toBe("Generac 17kW · S/N 6737426");
    expect(generatorLine({ generator_brand: "Generac ", generator_model: "Generac ", generator_kw: "15", generator_serial: "8097742" })).toBe("Generac 15kW · S/N 8097742");
    expect(splitLegacyModel("G0072090")).toEqual({ brand: "", kw: null, model: "G0072090" });
  });
  it('"Other" is never shown to a customer', () => {
    expect(generatorLine({ generator_brand: "Other", generator_kw: 20 })).toBe("20kW");
  });
  it("normalizes brand and kW", () => {
    expect(normalizeBrand("briggs and stratton ")).toBe("Briggs & Stratton");
    expect(normalizeBrand("GENERAC")).toBe("Generac");
    expect(normalizeKw("17.5kW")).toBe(17.5);
    expect(normalizeKw("abc")).toBeNull();
  });
  it("install date doesn't move a day", () => {
    expect(installDateLabel("2024-05-01")).toBe("May 1, 2024");
    expect(installDateLabel("2024-05-01T00:00:00+00:00")).toBe("May 1, 2024");
    expect(installDateLabel(null)).toBe("");
  });
});

describe("emails show the generator on its own line (A3)", () => {
  const job = { id: "j", job_type: "maintenance", scheduled_date: "2026-11-05T15:00:00Z", arrival_window_end: "2026-11-05T17:00:00Z" };
  it("confirmation: own Generator row, not inside Service Type", () => {
    const html = confirmationEmailHTML({ customer: { ...don, name: "Don" }, job, techFirstName: "Alex" });
    expect(html).toContain("Generac 17kW · Model 0060531 · S/N 6737426");
    const serviceCell = html.match(/Service Type<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/)[1];
    expect(serviceCell.trim()).toBe("Maintenance");
    expect(html).toContain("Arrival window: 10 AM – 12 PM");
  });
  it("exact-time job keeps its arrival time", () => {
    const html = confirmationEmailHTML({ customer: { name: "Don" }, job: { ...job, arrival_window_end: null } });
    expect(html).toContain("Arrival time:");
    expect(html).not.toContain("Arrival window:");
    expect(html).not.toContain("Generator</td>");
  });
  it("completion + invoice", () => {
    expect(completionEmailHTML({ customer: don, job })).toContain("Generac 17kW · Model 0060531 · S/N 6737426");
    expect(invoiceSummaryHTML({ invoice: { total: 10, labor_total: 10 }, customer: don })).toContain("Generac 17kW · Model 0060531 · S/N 6737426");
  });
  it("no stray separators with a serial only", () => {
    const html = confirmationEmailHTML({ customer: { name: "Don", generator_serial: "123" }, job });
    expect(html).toContain(">S/N 123<");
    expect(html).not.toMatch(/— ?,|, S\/N|· S\/N 123/);
  });
});

describe("generatorChanges: the checklist vs the record (A4)", () => {
  const gen = generatorFor({ ...don, generator_kw: null });
  it("nothing changed: nothing to do", () => {
    expect(generatorChanges(FIELDS, { generator_brand: "generac ", generator_model: "0060531", generator_serial: "6737426" }, gen)).toEqual({ fills: {}, conflicts: [] });
  });
  it("an empty saved field fills silently", () => {
    const r = generatorChanges(FIELDS, { generator_kw: "17" }, gen);
    expect(r).toEqual({ fills: { kw: 17 }, conflicts: [] });
  });
  it("a different saved value asks, with the from and to", () => {
    const r = generatorChanges(FIELDS, { generator_serial: "6737462" }, gen);
    expect(r.fills).toEqual({});
    expect(r.conflicts).toEqual([{ key: "serial", label: "serial #", fieldIds: ["generator_serial"], from: "6737426", to: "6737462" }]);
  });
  it("a blank box never erases a saved value", () => {
    expect(generatorChanges(FIELDS, { generator_serial: "", generator_model: "  " }, gen)).toEqual({ fills: {}, conflicts: [] });
  });
  it("visit-only readings never touch the record", () => {
    expect(generatorChanges(FIELDS, { run_hours: "125", battery_static_v: "12.7", checklist_notes: "ok" }, gen)).toEqual({ fills: {}, conflicts: [] });
  });
  it("only fields on this checklist count", () => {
    expect(generatorChanges([{ id: "run_hours" }], { generator_serial: "999" }, gen)).toEqual({ fills: {}, conflicts: [] });
  });
  it("a junk old model counts as empty", () => {
    const old = generatorFor({ generator_model: "17kW Generac" });
    expect(generatorChanges(FIELDS, { generator_model: "0060531" }, old).fills).toEqual({ model: "0060531" });
  });
});

describe("more than one generator (A4)", () => {
  const customer = { ...don, extra_generators: [{ id: "g2", label: "Pool house", brand: "Kohler", kw: "14", serial: "K1" }] };
  it("lists main first, job picks", () => {
    expect(generatorsOf(customer).map((g) => g.label)).toEqual(["Main generator", "Pool house"]);
    expect(generatorFor(customer, { generator_id: "g2" }).brand).toBe("Kohler");
    expect(generatorFor(customer, {}).id).toBe("main");
    expect(generatorFor(customer, { generator_id: "gone" }).id).toBe("main");
    expect(generatorLine(customer, { generator_id: "g2" })).toBe("Kohler 14kW · S/N K1");
    expect(generatorSummary(customer, { generator_id: "g2" })).toBe("Kohler 14kW");
  });
  it("saves back to the right place", () => {
    expect(generatorPatch(customer, "main", { serial: "X" })).toEqual({ generator_serial: "X" });
    expect(generatorPatch(customer, "g2", { serial: "X" }).extra_generators[0]).toMatchObject({ id: "g2", serial: "X", brand: "Kohler" });
  });
});
