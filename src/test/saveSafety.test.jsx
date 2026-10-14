import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createOnce, useSaveGuard, isConnectionError } from "@/lib/saveSafety";

describe("saveSafety (H-2)", () => {
  it("createOnce: a Retry after a lost response returns the existing row (no duplicate)", async () => {
    const rows = {};
    const api = {
      create: vi.fn(async (r) => { if (rows[r.id]) { const e = new Error("dup"); e.code = "23505"; throw e; } rows[r.id] = r; return r; }),
      filter: vi.fn(async ({ id }) => (rows[id] ? [rows[id]] : [])),
    };
    await createOnce(api, "x1", { a: 1 });
    const again = await createOnce(api, "x1", { a: 1 });
    expect(again).toEqual({ a: 1, id: "x1" });
    expect(Object.keys(rows)).toHaveLength(1);
  });

  it("useSaveGuard: a second tap while saving is ignored (even in the same tick)", async () => {
    const { result } = renderHook(() => useSaveGuard());
    let resolve;
    const fn = vi.fn(() => new Promise(r => { resolve = r; }));
    let p1;
    act(() => { p1 = result.current.run(fn); result.current.run(fn); });
    expect(fn).toHaveBeenCalledTimes(1);
    await act(async () => { resolve("ok"); await p1; });
    await act(async () => { await result.current.run(async () => "second"); });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("connection errors are recognised", () => {
    expect(isConnectionError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isConnectionError(new Error("Load failed"))).toBe(true);
  });
});
