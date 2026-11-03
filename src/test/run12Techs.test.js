import { describe, it, expect } from "vitest";
import { jobTechs, techsLabel, isSharedJob, jobIsFor, sharesTech, techsPatch, techShares, tripTech } from "@/lib/jobTechs";
import { buildEvent, techColorId } from "@/lib/googleCalendar";
import { confirmationEmailHTML } from "@/lib/emailTemplates";
import { computeFinance } from "@/lib/finance/core";

const shared = { assigned_techs: ["Alex", "Jeremy"], assigned_to_name: "Alex" };

describe("jobTechs (A7)", () => {
  it("reads the list, or an older single tech", () => {
    expect(jobTechs(shared)).toEqual(["Alex", "Jeremy"]);
    expect(jobTechs({ assigned_to_name: "Alex Russo" })).toEqual(["Alex"]);
    expect(jobTechs({ assigned_techs: [], assigned_to_name: "Jeremy" })).toEqual(["Jeremy"]);
    expect(jobTechs({})).toEqual([]);
    expect(jobTechs(undefined)).toEqual([]);
  });
  it("label reads the same whoever was picked first", () => {
    expect(techsLabel(shared)).toBe("Jeremy & Alex");
    expect(techsLabel({ assigned_techs: ["Sean", "Alex", "Jeremy"] })).toBe("Jeremy, Alex & Sean");
    expect(techsLabel({ assigned_to_name: "Alex" })).toBe("Alex");
    expect(techsLabel({})).toBe("");
    expect(isSharedJob(shared)).toBe(true);
  });
  it("a shared job shows for BOTH techs; unassigned for everyone", () => {
    expect(jobIsFor(shared, "Jeremy")).toBe(true);
    expect(jobIsFor(shared, "Alex Russo")).toBe(true);
    expect(jobIsFor(shared, "Derek")).toBe(false);
    expect(jobIsFor({}, "Derek")).toBe(true);
    expect(sharesTech(shared, { assigned_to_name: "Jeremy" })).toBe(true);
    expect(sharesTech(shared, { assigned_to_name: "Sean" })).toBe(false);
  });
  it("save patch keeps the lead", () => {
    expect(techsPatch(["Alex Russo", "Jeremy", "Alex"])).toEqual({ assigned_techs: ["Alex", "Jeremy"], assigned_to_name: "Alex" });
    expect(techsPatch([])).toEqual({ assigned_techs: [], assigned_to_name: null });
  });
  it("mileage: one trip, under the lead only", () => {
    expect(tripTech(shared)).toBe("Alex");
    const trips = ["Jeremy", "Alex"].filter((t) => tripTech(shared) === t);
    expect(trips).toEqual(["Alex"]);
  });
  it("revenue splits evenly and still adds to the total", () => {
    expect(techShares(shared, 1000)).toEqual([{ tech: "Alex", amount: 500 }, { tech: "Jeremy", amount: 500 }]);
    expect(techShares({}, 1000)).toEqual([{ tech: "Unassigned", amount: 1000 }]);
  });
});

describe("shared job everywhere it's sent (A7)", () => {
  const job = { id: "j", job_type: "maintenance", scheduled_date: "2026-11-05T15:00:00Z", ...shared };
  it("calendar title and its own color", () => {
    const e = buildEvent(job, { name: "Pat" });
    expect(e.summary).toBe("Maintenance — Pat (Jeremy & Alex)");
    expect(e.colorId).toBe("6");
    expect(techColorId({ assigned_techs: ["Jeremy"] })).toBe("9");
    expect(techColorId({ assigned_techs: ["Alex"] })).toBe("10");
  });
  it("confirmation: Your Technicians", () => {
    const html = confirmationEmailHTML({ customer: { name: "Pat" }, job });
    expect(html).toContain("Your Technicians");
    expect(html).toContain("Jeremy &amp; Alex");
  });
  it("one tech and no tech read as before", () => {
    const one = confirmationEmailHTML({ customer: { name: "Pat" }, job: { ...job, assigned_techs: ["Alex"], assigned_to_name: "Alex" } });
    expect(one).toContain("Your Technician<");
    const none = confirmationEmailHTML({ customer: { name: "Pat" }, job: { ...job, assigned_techs: [], assigned_to_name: null } });
    expect(none).toContain("our technician");
  });
  it("Finance by tech: a shared $1,000 job is $500 each, techs add to the total", () => {
    const paid = { id: "i1", job_id: "j1", status: "paid", total: 1000, amount_paid: 1000, paid_date: "2026-11-02T15:00:00Z", created_at: "2026-11-02T15:00:00Z", payment_method: "cash" };
    const data = { invoices: [paid], jobs: [{ id: "j1", job_type: "maintenance", status: "completed", ...shared }], expenses: [], claims: [], parts: [], labor: [], job_parts: [], job_labor: [], customers: [], mileage: [], warranty: [] };
    const f = computeFinance(data, { from: "2026-11-01", to: "2026-11-30" });
    const by = Object.fromEntries(f.byTech.map((t) => [t.tech, t]));
    expect(by.Alex.revenue).toBe(500);
    expect(by.Jeremy.revenue).toBe(500);
    expect(by.Alex.count).toBe(1);
    expect(by.Jeremy.count).toBe(1);
  });
});
