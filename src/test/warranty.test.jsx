import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { todayET, addDays, startOfMonth } from "../lib/finance/core.js";

// D1: Warranty — list newest first, totals this month / year, add / edit / delete (app confirm).
const store = { claims: [] };
const api = {
  list: vi.fn(async () => store.claims),
  create: vi.fn(async (row) => { const r = { id: `w${store.claims.length + 1}`, created_at: new Date().toISOString(), ...row }; store.claims.push(r); return r; }),
  update: vi.fn(async (id, patch) => { const r = store.claims.find(c => c.id === id); Object.assign(r, patch); return { ...r }; }),
  delete: vi.fn(async (id) => { store.claims = store.claims.filter(c => c.id !== id); }),
};
const toastError = vi.fn();
vi.mock("@/lib/db", () => ({ db: { WarrantyClaim: api } }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { email: "qa@example.com" } }) }));
vi.mock("sonner", async (orig) => { const m = await orig(); return { ...m, toast: Object.assign((...a) => m.toast(...a), m.toast, { error: (...a) => toastError(...a), success: vi.fn() }) }; });
vi.mock("@/lib/supabaseClient", () => ({ supabase: { from: () => ({ select: async () => ({ data: [], error: null }) }) } }));
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

const { default: Warranty, parseAmount } = await import("../pages/Warranty.jsx");

const today = todayET();
const monthStart = startOfMonth(today);
const lastYear = `${Number(today.slice(0, 4)) - 1}-12-15`;

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={["/warranty"]}><Routes><Route path="/warranty" element={<Warranty />} /></Routes></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  store.claims = [
    { id: "a", customer_name: "QA Old", claim_number: "OLD-1", amount_paid: 100, date_paid: lastYear, paid_via: "ach", created_at: "2025-12-15T00:00:00Z" },
    { id: "b", customer_name: "QA Month", claim_number: "M-2", description: "Plenum", amount_paid: 412.5, date_paid: monthStart, paid_via: "check", created_at: "2026-01-01T00:00:00Z" },
    { id: "c", customer_name: "QA Newest", claim_number: "N-3", amount_paid: 50, date_paid: today, paid_via: "distributor_credit", created_at: "2026-01-02T00:00:00Z" },
  ];
});

describe("Warranty", () => {
  it("parseAmount: keypad money only", () => {
    expect(parseAmount("412.50")).toBe(412.5); expect(parseAmount("$1,200")).toBe(1200); expect(parseAmount("0")).toBe(0);
    expect(parseAmount("")).toBeNull(); expect(parseAmount("-5")).toBeNull(); expect(parseAmount("1.234")).toBeNull(); expect(parseAmount("abc")).toBeNull();
  });

  it("lists newest first with totals for this month and this year", async () => {
    renderPage();
    const rows = await screen.findAllByTestId("warranty-row");
    expect(rows.map(r => r.textContent)).toEqual([expect.stringContaining("QA Newest"), expect.stringContaining("QA Month"), expect.stringContaining("QA Old")]);
    const sameMonth = monthStart <= today; // always
    expect(sameMonth).toBe(true);
    expect(screen.getByTestId("warranty-month")).toHaveTextContent("$462.50");
    expect(screen.getByTestId("warranty-year")).toHaveTextContent("$462.50"); // last year's claim not counted
    expect(rows[0]).toHaveTextContent("Distributor credit");
  });

  it("add: amount has the decimal keypad; checks amount, then saves every field + who added it", async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId("warranty-add"));
    const amount = await screen.findByLabelText("Amount paid ($)");
    expect(amount).toHaveAttribute("inputmode", "decimal");
    expect(screen.getByLabelText("Date paid")).toHaveValue(today);
    fireEvent.change(screen.getByLabelText("Customer name"), { target: { value: "QA-AUDIT Don" } });
    fireEvent.click(screen.getByTestId("warranty-save"));
    expect(toastError).toHaveBeenCalledWith("Enter the amount paid (e.g. 412.50)");
    expect(api.create).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Claim / control #"), { target: { value: "GC-77" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Fuel plenum SIB17-01" } });
    fireEvent.change(amount, { target: { value: "412.50" } });
    fireEvent.change(screen.getByLabelText("Date paid"), { target: { value: addDays(today, -1) } });
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "  check #1001 " } });
    fireEvent.click(screen.getByTestId("warranty-save"));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create.mock.calls[0][0]).toEqual({ customer_name: "QA-AUDIT Don", claim_number: "GC-77", description: "Fuel plenum SIB17-01", amount_paid: 412.5, date_paid: addDays(today, -1), paid_via: "check", notes: "check #1001", created_by: "qa@example.com" });
  });

  it("edit saves changes; delete asks in the app first and removes only that claim", async () => {
    renderPage();
    fireEvent.click((await screen.findAllByTestId("warranty-row"))[1]); // QA Month
    const amount = await screen.findByLabelText("Amount paid ($)");
    expect(amount).toHaveValue("412.5");
    fireEvent.change(amount, { target: { value: "415" } });
    fireEvent.click(screen.getByTestId("warranty-save"));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith("b", expect.objectContaining({ amount_paid: 415, customer_name: "QA Month" })));
    await waitFor(() => expect(screen.queryByTestId("warranty-save")).toBeNull());

    fireEvent.click((await screen.findAllByTestId("warranty-row"))[0]); // QA Newest
    fireEvent.click(await screen.findByTestId("warranty-delete"));
    const dlg = await screen.findByTestId("warranty-delete-confirm");
    expect(dlg).toHaveTextContent("QA Newest · $50.00");
    expect(api.delete).not.toHaveBeenCalled();
    fireEvent.click(within(dlg).getByRole("button", { name: /Delete Claim/ }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("c"));
    expect(store.claims.map(c => c.id)).toEqual(["a", "b"]);
  });
});
