import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// A-04: a refetch (signal comes back) must not overwrite what was typed.
// KF-1: Create before the customer list loads still saves the customer name.
// A-03: double tap creates one job.
const savedJob = { id: "j1", customer_id: "c1", customer_name: "Cust", title: "Orig", job_type: "maintenance", status: "scheduled", notes: "original note", scheduled_date: null };
const jobCreate = vi.fn(async (row) => ({ ...row }));
const jobUpdate = vi.fn(async (id, row) => ({ id, ...row }));
let customersList = () => new Promise(() => {}); // never loads (slow signal)
vi.mock("@/lib/db", () => ({
  db: {
    Job: { filter: vi.fn(async () => [{ ...savedJob }]), create: (...a) => jobCreate(...a), update: (...a) => jobUpdate(...a) },
    Customer: { list: vi.fn(() => customersList()), filter: vi.fn(async ({ id }) => [{ id, name: "Real Name", email: null }]) },
    Invoice: { create: vi.fn(async (r) => r), filter: vi.fn(async () => []) },
  },
}));
vi.mock("@/lib/coreIntegrations", () => ({ integrationsCore: { SendEmailWithRetry: vi.fn() } }));
vi.mock("@/lib/notifyTeam", () => ({ notifyTeam: vi.fn(), buildTable: vi.fn(() => ""), buildRow: vi.fn(() => ""), buildEventBadge: vi.fn(() => "") }));
const authValue = { user: { email: "qa@example.com" }, googleToken: null };
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => authValue }));
vi.mock("@/lib/googleCalendar", () => ({ createCalendarEvent: vi.fn(), updateCalendarEvent: vi.fn() }));

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
const { default: JobForm } = await import("../pages/JobForm.jsx");

function renderAt(path, route) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  window.history.pushState({}, "", path);
  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path={route} element={<JobForm />} /><Route path="/jobs/:id" element={<p>job page</p>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, qc };
}

beforeEach(() => { jobCreate.mockClear(); jobUpdate.mockClear(); customersList = () => new Promise(() => {}); });

describe("JobForm weak signal", () => {
  it("A-04: typed notes survive a refetch of the job", async () => {
    customersList = async () => [{ id: "c1", name: "Cust" }];
    const { qc, container } = renderAt("/jobs/j1/edit", "/jobs/:id/edit");
    const notes = await waitFor(() => {
      const el = [...container.querySelectorAll("textarea")].find(t => t.value === "original note");
      if (!el) throw new Error("not loaded");
      return el;
    });
    fireEvent.change(notes, { target: { value: "EDITED note" } });
    await act(async () => { await qc.invalidateQueries({ queryKey: ["job", "j1"] }); });
    await waitFor(() => expect(notes.value).toBe("EDITED note"));
  });

  it("KF-1 + A-03: create before customers load saves the real name, once", async () => {
    const { container } = renderAt("/jobs/new?customer=c1", "/jobs/new");
    const title = container.querySelector("input");
    // first text input in the form is the title (customer is a select)
    const inputs = [...container.querySelectorAll("input")].filter(i => i.type === "text" || !i.type);
    fireEvent.change(inputs[0] || title, { target: { value: "QA job" } });
    const btn = screen.getByRole("button", { name: /Create & Skip/i });
    act(() => { fireEvent.click(btn); fireEvent.click(btn); });
    await waitFor(() => expect(jobCreate).toHaveBeenCalled());
    expect(jobCreate).toHaveBeenCalledTimes(1);
    expect(jobCreate.mock.calls[0][0]).toMatchObject({ customer_id: "c1", customer_name: "Real Name" });
    expect(jobCreate.mock.calls[0][0].id).toMatch(/[0-9a-f-]{36}/);
  });
});
