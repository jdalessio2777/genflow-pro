import { describe, it, expect, vi, beforeEach } from "vitest";

// D-13: a delete that would be blocked is refused BEFORE anything is removed.
const deletes = [];
const tbl = (name, rows = []) => ({
  filter: vi.fn(async (f) => rows.filter(r => Object.entries(f).every(([k, v]) => r[k] === v))),
  delete: vi.fn(async (id) => { deletes.push(`${name}:${id}`); }),
});
const data = {
  jobs: [{ id: "j1", customer_id: "c1" }],
  quotes: [{ id: "q1", customer_id: "c1" }],
};
vi.mock("@/lib/db", () => ({
  db: {
    Job: tbl("job", data.jobs), Quote: tbl("quote", data.quotes), ServiceRequest: tbl("sr"),
    JobPart: tbl("jp"), JobLabor: tbl("jl", [{ id: "l1", job_id: "j1" }]), JobDocument: tbl("jd"), JobPhoto: tbl("ph"),
    Invoice: tbl("inv", [{ id: "i1", job_id: "j1", customer_id: "c1" }]), Customer: tbl("cust"), PartsUsageLog: tbl("u"),
  },
}));
vi.mock("@/lib/supabaseClient", () => ({ supabase: { from: vi.fn() } }));
const { deleteCustomerCascade, deleteJobCascade } = await import("@/lib/deleteRecords");

beforeEach(() => { deletes.length = 0; });

describe("delete cascade (D-13)", () => {
  it("customer with a quote: refused, nothing deleted", async () => {
    await expect(deleteCustomerCascade("c1")).rejects.toThrow(/quote.*Nothing was removed/);
    expect(deletes).toEqual([]);
  });
  it("job without blockers: lines, invoice, then job", async () => {
    await deleteJobCascade("j1");
    expect(deletes).toEqual(["jl:l1", "inv:i1", "job:j1"]);
  });
});
