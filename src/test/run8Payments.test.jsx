import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Part E: "Charge on Stripe" (copy + "Payment completed?"), one recording,
// email rules, and the surcharge on every customer copy.
const store = { invoices: [], customers: [], jobs: [], settings: [] };
const invUpdate = vi.fn();
const sendSummary = vi.fn(async () => ({ id: "re_x", to: "pat@example.com" }));
const toastInfo = vi.fn();
function api(key) {
  return {
    filter: vi.fn(async (f = {}) => store[key].filter(r => Object.entries(f).every(([k, v]) => r[k] === v)).map(r => ({ ...r }))),
    list: vi.fn(async () => store[key]),
    update: vi.fn(async (id, patch) => { invUpdate(id, patch); await new Promise(r => setTimeout(r, 30)); const r = store[key].find(x => x.id === id); Object.assign(r, patch); return { ...r }; }),
    delete: vi.fn(),
  };
}
const dbMock = { Invoice: api("invoices"), Customer: api("customers"), Job: api("jobs"), AppSettings: api("settings") };
vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/jobSummaryEmail", () => ({ sendJobSummaryEmail: (...a) => sendSummary(...a), newResendNonce: () => "n" }));
vi.mock("@/lib/notifyTeam", () => ({ notifyTeam: vi.fn(), buildTable: vi.fn(() => ""), buildRow: vi.fn(() => ""), buildEventBadge: vi.fn(() => "") }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { email: "qa@example.com", full_name: "Jeremy D" } }) }));
vi.mock("@/components/payments/StripePaymentModal", () => ({ default: () => null }));
vi.mock("sonner", async (orig) => { const m = await orig(); return { ...m, toast: Object.assign((...a) => m.toast(...a), m.toast, { info: (...a) => toastInfo(...a) }) }; });

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
const { default: InvoiceDetail } = await import("../pages/InvoiceDetail.jsx");
const { jobSummaryEmailHTML, paymentReceiptHTML } = await import("../lib/emailTemplates.js");
const { invoicePrintDocumentHtml } = await import("../lib/invoicePrint.js");
const { invoiceForEmail } = await import("../../api/_lib/jobSummary.js");
const { surchargeFor } = await import("../lib/utils/surcharge.js");

// $100 labor + $6.63 tax = $106.63; surcharge (2.7% + $0.05, the shared formula) = $3.01; total $109.64.
const base = { id: "inv1", job_id: "job1", customer_id: "c1", customer_name: "QA Pat", invoice_number: "INV-T1", status: "draft",
  parts_total: 0, labor_total: 100, tax_amount: 6.63, total: 106.63, surcharge_amount: 3.01,
  line_items: [{ type: "labor", description: "Standard Hour", quantity: 1, unit_price: 100, total: 100 }] };

let clip;
function Where() { return <p data-testid="where">{useLocation().pathname}</p>; }
function renderInvoice() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/jobs/job1", "/invoices/inv1"]} initialIndex={1}>
        <Where />
        <Routes>
          <Route path="/invoices/:id" element={<InvoiceDetail />} />
          <Route path="/jobs/:id" element={<p>job summary</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  store.invoices = [{ ...base }];
  store.customers = [{ id: "c1", name: "QA Pat", email: "pat@example.com" }];
  store.jobs = [{ id: "job1", status: "on_site", completion_email_sent_at: null }];
  invUpdate.mockClear(); sendSummary.mockClear(); toastInfo.mockClear();
  clip = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: clip } });
});
afterEach(() => cleanup());

describe("Part E: Charge on Stripe", () => {
  it("copies the exact total incl. surcharge, No records nothing, Yes records ONCE as Card (Stripe App) and returns to the job", async () => {
    renderInvoice();
    const btn = await screen.findByTestId("charge-on-stripe");
    expect(btn.textContent).toContain("$109.64");
    fireEvent.click(btn);
    expect(clip).toHaveBeenCalledWith("109.64");
    expect(await screen.findByTestId("stripe-confirm-amount")).toHaveTextContent("$109.64");
    fireEvent.click(screen.getByTestId("stripe-confirm-no"));
    await waitFor(() => expect(screen.queryByTestId("stripe-confirm")).toBeNull());
    expect(invUpdate).not.toHaveBeenCalled();
    expect(store.invoices[0].status).toBe("draft");

    fireEvent.click(screen.getByTestId("charge-on-stripe"));
    const yes = await screen.findByTestId("stripe-confirm-yes");
    fireEvent.click(yes); fireEvent.click(yes); // double tap
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/jobs/job1"));
    expect(invUpdate).toHaveBeenCalledTimes(1);
    const [, patch] = invUpdate.mock.calls[0];
    expect(patch).toMatchObject({ status: "paid", payment_method: "stripe_app", surcharge_amount: 3.01, total: 109.64 });
    // open job: no receipt, no prompt
    expect(sendSummary).not.toHaveBeenCalled();
  });

  it("an invoice already paid on another phone is never recorded again", async () => {
    renderInvoice();
    fireEvent.click(await screen.findByTestId("charge-on-stripe"));
    store.invoices[0].status = "paid"; // paid elsewhere while the dialog was open
    fireEvent.click(await screen.findByTestId("stripe-confirm-yes"));
    await waitFor(() => expect(toastInfo).toHaveBeenCalled());
    expect(invUpdate).not.toHaveBeenCalled();
  });

  it("completed job: asks \"Send receipt to customer?\"; Send emails ONE receipt", async () => {
    store.jobs[0] = { id: "job1", status: "completed", completion_email_sent_at: "2026-10-21T10:00:00Z" };
    renderInvoice();
    fireEvent.click(await screen.findByTestId("charge-on-stripe"));
    fireEvent.click(await screen.findByTestId("stripe-confirm-yes"));
    expect(await screen.findByText("Send receipt to customer?")).toBeTruthy();
    expect(sendSummary).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByTestId("receipt-send")); });
    await waitFor(() => expect(sendSummary).toHaveBeenCalledTimes(1));
    expect(sendSummary.mock.calls[0][0]).toMatchObject({ jobId: "job1", kind: "receipt" });
  });

  it("no button tries to open another app", async () => {
    renderInvoice();
    await screen.findByTestId("charge-on-stripe");
    expect(document.body.innerHTML).not.toMatch(/stripedashboard:|Open Stripe/);
  });
});

describe("Part E: the surcharge is on every customer copy, same total as recorded", () => {
  const paid = { ...base, status: "paid", payment_method: "stripe_app", paid_date: "2026-10-21T15:55:36Z", total: 109.64, surcharge_amount: 3.01 };
  const customer = { name: "QA Pat", email: "pat@example.com" };
  const hasLineAndTotal = (html) => {
    expect(html).toContain("Credit card surcharge");
    expect(html).toContain("$3.01");
    expect(html).toContain("$109.64");
    expect(html).toContain("Card (Stripe App)");
  };
  it("combined completion email", () => hasLineAndTotal(jobSummaryEmailHTML({ invoice: paid, customer })));
  it("\"Payment received\" receipt", () => hasLineAndTotal(jobSummaryEmailHTML({ invoice: paid, customer, kind: "receipt" })));
  it("short payment receipt", () => { const h = paymentReceiptHTML({ invoice: paid, customer }); expect(h).toContain("Credit card surcharge"); expect(h).toContain("$109.64"); });
  it("print / PDF", () => hasLineAndTotal(invoicePrintDocumentHtml({ invoice: paid, customer })));
  it("unpaid invoice with the surcharge on: the server-built email keeps it (recomputed by the shared function)", () => {
    const inv = invoiceForEmail({ invoice: { ...base }, parts: [], labor: [{ total_price: 100 }] });
    expect(inv.surcharge_amount).toBe(surchargeFor(base));
    expect(jobSummaryEmailHTML({ invoice: inv, customer })).toContain("Credit card surcharge");
  });
});
