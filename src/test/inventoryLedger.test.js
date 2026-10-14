import { describe, it, expect, vi, beforeEach } from "vitest";

// H-4: stock and parts_usage_log must always agree; stock changes use the
// database's current count (compare-and-swap), never a cached one.
const state = { parts: {}, jobParts: {}, usage: {}, failNext: null };
let casConflicts = 0;

function partsQuery() {
  const q = { filters: {}, patch: null };
  const api = {
    select: () => api,
    eq: (k, v) => { q.filters[k] = v; return api; },
    is: (k, v) => { q.filters[k] = v; return api; },
    update: (patch) => { q.patch = patch; return api; },
    maybeSingle: async () => ({ data: state.parts[q.filters.id] ? { ...state.parts[q.filters.id] } : null, error: null }),
    then: (resolve) => {
      // update(...).eq(id).eq(in_stock).select() awaited
      const row = state.parts[q.filters.id];
      if (casConflicts > 0) { casConflicts--; row.in_stock -= 1; return resolve({ data: [], error: null }); } // another phone took one
      if (!row || (row.in_stock ?? null) !== q.filters.in_stock) return resolve({ data: [], error: null });
      Object.assign(row, q.patch);
      return resolve({ data: [{ ...row }], error: null });
    },
  };
  return api;
}
vi.mock("@/lib/supabaseClient", () => ({ supabase: { from: () => partsQuery() } }));

function table(name) {
  return {
    create: vi.fn(async (row) => {
      if (state.failNext === `${name}.create`) { state.failNext = null; throw new TypeError("Failed to fetch"); }
      if (state[name][row.id]) { const e = new Error("dup"); e.code = "23505"; throw e; }
      state[name][row.id] = { created_at: new Date(Date.now() + Object.keys(state[name]).length).toISOString(), ...row };
      return state[name][row.id];
    }),
    filter: vi.fn(async (f) => Object.values(state[name]).filter(r => Object.entries(f).every(([k, v]) => r[k] === v))),
    delete: vi.fn(async (id) => {
      if (state.failNext === `${name}.delete`) { state.failNext = null; throw new TypeError("Failed to fetch"); }
      delete state[name][id];
    }),
  };
}
vi.mock("@/lib/db", () => ({ db: { JobPart: table("jobParts"), PartsUsageLog: table("usage") } }));

const { adjustStock, addPartToJob, removePartFromJob } = await import("@/lib/inventory");

beforeEach(() => {
  state.parts = { p1: { id: "p1", in_stock: 5, reorder_flagged: false } };
  state.jobParts = {}; state.usage = {}; state.failNext = null; casConflicts = 0;
});

const plan = (n, qty) => ({
  jobPartId: `jp${n}`, usageId: `u${n}`, qty, stockPartId: "p1",
  jobPart: { job_id: "j1", name: "P1", part_id: "p1", quantity: qty },
});

describe("inventory ledger", () => {
  it("C-2: two adds in a row both count (5 → 3 → 2)", async () => {
    await addPartToJob(plan(1, 2));
    await addPartToJob(plan(2, 1));
    expect(state.parts.p1.in_stock).toBe(2);
    expect(Object.values(state.usage).map(u => u.quantity)).toEqual([2, 1]);
  });

  it("compare-and-swap retries when another phone changed the count", async () => {
    casConflicts = 1;
    await adjustStock("p1", -2);
    expect(state.parts.p1.in_stock).toBe(2); // 5 - 1 (other phone) - 2
  });

  it("can go below zero and flags reorder (no silent clamp)", async () => {
    await adjustStock("p1", -7);
    expect(state.parts.p1).toMatchObject({ in_stock: -2, reorder_flagged: true });
  });

  it("Retry after a failed usage insert resumes without a second decrement", async () => {
    const progress = {};
    state.failNext = "usage.create";
    await expect(addPartToJob(plan(1, 2), progress)).rejects.toThrow();
    expect(state.parts.p1.in_stock).toBe(3);
    await addPartToJob(plan(1, 2), progress);
    expect(state.parts.p1.in_stock).toBe(3);
    expect(Object.keys(state.usage)).toHaveLength(1);
    expect(Object.keys(state.jobParts)).toHaveLength(1);
  });

  it("C-3: removing a line restores stock and deletes its usage row", async () => {
    const { jobPart } = await addPartToJob(plan(1, 2));
    expect(state.parts.p1.in_stock).toBe(3);
    await removePartFromJob(jobPart);
    expect(state.parts.p1.in_stock).toBe(5);
    expect(Object.keys(state.usage)).toHaveLength(0);
    expect(Object.keys(state.jobParts)).toHaveLength(0);
  });

  it("a legacy line without a usage row is removed without changing stock", async () => {
    state.jobParts.old = { id: "old", job_id: "j1", part_id: "p1", quantity: 2 };
    await removePartFromJob(state.jobParts.old);
    expect(state.parts.p1.in_stock).toBe(5);
  });

  it("Retry after a failed delete resumes and restores once", async () => {
    const { jobPart } = await addPartToJob(plan(1, 2));
    const progress = {};
    state.failNext = "usage.delete";
    await expect(removePartFromJob(jobPart, progress)).rejects.toThrow();
    expect(state.parts.p1.in_stock).toBe(5);
    await removePartFromJob(jobPart, progress);
    expect(state.parts.p1.in_stock).toBe(5);
    expect(Object.keys(state.usage)).toHaveLength(0);
  });
});
