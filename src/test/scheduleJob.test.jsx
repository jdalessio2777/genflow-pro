import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// B1 (quote approved -> schedule the job) and B2 (estimated time on site).
const store = { quotes: [], jobs: [], customers: [], parts: [], labor: [], invoices: [], quoteLines: [] };
const jobCreate = vi.fn();
const jobUpdate = vi.fn();
const sync = vi.fn(async () => ({ status: "skipped" }));
const sendEmail = vi.fn(async () => ({ id: "re_test" }));
const toastError = vi.fn();

function api(key, extra = {}) {
  return {
    filter: vi.fn(async (f = {}) => store[key].filter(r => Object.entries(f).every(([k, v]) => r[k] === v))),
    list: vi.fn(async () => store[key]),
    create: vi.fn(async (row) => {
      if (row.id && store[key].some(r => r.id === row.id)) { const e = new Error("dup"); e.code = "23505"; throw e; }
      const r = { id: row.id || `${key}-${store[key].length + 1}`, ...row }; store[key].push(r); return r;
    }),
    update: vi.fn(async (id, patch) => { const r = store[key].find(x => x.id === id); Object.assign(r, patch); return { ...r }; }),
    ...extra,
  };
}
const dbMock = {
  Quote: api("quotes"), QuoteLineItem: api("quoteLines"), Customer: api("customers"),
  Job: api("jobs"), JobPart: api("parts"), JobLabor: api("labor"), Invoice: api("invoices"),
  Part: api("parts"), LaborRate: api("labor"),
};
const origJobCreate = dbMock.Job.create; dbMock.Job.create = vi.fn(async (r) => { jobCreate(r); return origJobCreate(r); });
const origJobUpdate = dbMock.Job.update; dbMock.Job.update = vi.fn(async (id, p) => { jobUpdate(id, p); return origJobUpdate(id, p); });
vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("sonner", async (orig) => { const m = await orig(); return { ...m, toast: Object.assign((...a) => m.toast(...a), m.toast, { error: (...a) => toastError(...a) }) }; });
vi.mock("@/lib/coreIntegrations", () => ({ integrationsCore: { SendEmailWithRetry: (...a) => sendEmail(...a) } }));
vi.mock("@/lib/notifyTeam", () => ({ notifyTeam: vi.fn(), buildTable: vi.fn(() => ""), buildRow: vi.fn(() => ""), buildEventBadge: vi.fn(() => "") }));
vi.mock("@/lib/calendarSync", () => ({ syncJobToCalendar: (...a) => sync(...a), removeJobFromCalendar: vi.fn() }));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { email: "qa@example.com", full_name: "Jeremy D" } }) }));
const probeRows = { value: [] }; // rows the whole-row probe sees ([] = falls through to the named-column probe)
vi.mock("@/lib/supabaseClient", () => ({ supabase: { from: () => ({ select: (cols) => ({ limit: async () => (cols === "*"
  ? { data: probeRows.value, error: null }
  : { error: { code: "42703", message: "column jobs.estimated_minutes does not exist" } }) }) }) } }));

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
const { formatEstimate, minutesFromHoursInput, estimateLabel, jobWithEstimate, estimateMinutes } = await import("../lib/jobDuration.js");
const { withEstimate, hasEstimateColumn, __setEstimateColumnForTests } = await import("../lib/jobEstimateColumn.js");
const { confirmationEmailHTML } = await import("../lib/emailTemplates.js");
const { jobLinesFromQuote } = await import("../lib/quoteToJob.js");
const { appointmentIso } = await import("../components/jobs/ScheduleJobSheet.jsx");
const { default: QuoteDetail } = await import("../pages/QuoteDetail.jsx");

function seedQuote(over = {}) {
  store.quotes = [{ id: "q1", status: "sent", prospect_name: "QA Pat", prospect_email: "pat@example.com", scope_notes: "Replace starter", notes: "internal", ...over }];
  store.quoteLines = [
    { id: "ql1", quote_id: "q1", type: "custom", description: "Install labor", quantity: 1, unit_price: 350, total_price: 350 },
    { id: "ql2", quote_id: "q1", type: "part", description: "Starter", quantity: 2, unit_price: 45, total_price: 90 },
  ];
}
function renderQuote() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/quotes/q1"]}>
        <Routes><Route path="/quotes/:id" element={<QuoteDetail />} /><Route path="/jobs/:id" element={<p>job page</p>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const k of Object.keys(store)) store[k] = [];
  jobCreate.mockClear(); jobUpdate.mockClear(); sync.mockClear(); sendEmail.mockClear();
  __setEstimateColumnForTests(null);
});

describe("B2 estimate helpers", () => {
  it("formats and parses estimates", () => {
    expect(formatEstimate(180)).toBe("about 3 hours");
    expect(formatEstimate(90)).toBe("about 1.5 hours");
    expect(formatEstimate(480)).toBe("a full day");
    expect(formatEstimate(null)).toBe("about 2 hours");
    expect(minutesFromHoursInput("2.5")).toBe(150);
    expect(minutesFromHoursInput("0")).toBeNull();
    expect(minutesFromHoursInput("abc")).toBeNull();
    expect(estimateLabel(180)).toBe("3 hr");
    expect(estimateLabel(150)).toBe("2.5 hr");
    expect(estimateMinutes({})).toBe(120);
    expect(jobWithEstimate({ id: "j" }, 180)).toMatchObject({ estimated_minutes: 180, estimated_duration: 3 });
    expect(jobWithEstimate({ id: "j", estimated_minutes: 60 }, null).estimated_minutes).toBe(60);
  });

  it("saves estimated_minutes only when the column exists", async () => {
    __setEstimateColumnForTests(false);
    expect(await withEstimate({ a: 1 }, 180)).toEqual({ a: 1 });
    __setEstimateColumnForTests(true);
    expect(await withEstimate({ a: 1 }, 180)).toEqual({ a: 1, estimated_minutes: 180 });
  });

  it("probe: a missing column (42703) reads as false", async () => {
    expect(await hasEstimateColumn()).toBe(false);
  });

  it("probe: reads the column from a whole row (no 400 in the console)", async () => {
    probeRows.value = [{ id: "j", estimated_minutes: null }];
    __setEstimateColumnForTests(null);
    expect(await hasEstimateColumn()).toBe(true);
    probeRows.value = [{ id: "j" }];
    __setEstimateColumnForTests(null);
    expect(await hasEstimateColumn()).toBe(false);
    probeRows.value = [];
  });

  it("confirmation email says the estimated time on site", () => {
    const customer = { name: "Pat", email: "p@example.com" };
    const job = { job_type: "quote", scheduled_date: new Date("2026-11-03T09:00:00").toISOString() };
    expect(confirmationEmailHTML({ customer, job: { ...job, estimated_minutes: 180 } })).toContain("Estimated time on site: about 3 hours.");
    expect(confirmationEmailHTML({ customer, job })).toContain("Estimated time on site: about 2 hours.");
  });
});

describe("B1 quote lines -> job rows", () => {
  it("keeps quoted prices and fixed ids", () => {
    seedQuote();
    const { parts, labor } = jobLinesFromQuote(store.quoteLines, { jobId: "j1", ids: { ql1: "L", ql2: "P" } });
    expect(labor).toEqual([expect.objectContaining({ id: "L", job_id: "j1", description: "Install labor", total_price: 350, is_flat_rate: true })]);
    expect(parts).toEqual([expect.objectContaining({ id: "P", job_id: "j1", name: "Starter", quantity: 2, price: 45, total_price: 90 })]);
  });

  it("appointmentIso joins date + time", () => {
    expect(appointmentIso("2026-11-03", "09:30")).toBe(new Date("2026-11-03T09:30").toISOString());
    expect(appointmentIso("", "09:30")).toBeNull();
  });
});

describe("B1 approve -> Schedule this job", () => {
  it("approve (double tap) makes one job with the lines and opens the sheet; Create & Skip schedules it with the estimate", async () => {
    seedQuote();
    __setEstimateColumnForTests(false);
    renderQuote();
    const approve = await screen.findByRole("button", { name: /Mark Approved/ });
    act(() => { fireEvent.click(approve); fireEvent.click(approve); });
    await screen.findByText("Schedule this job", { selector: "h2" });
    expect(jobCreate).toHaveBeenCalledTimes(1);
    expect(store.jobs).toHaveLength(1);
    expect(store.jobs[0]).toMatchObject({ customer_description: null, title: "Install labor", status: "scheduled", job_type: "diagnostic_repair" });
    // A2: the description box starts blank; A4: the title box shows the quote's title, editable
    expect(screen.getByLabelText("Job Description (customer-facing)")).toHaveValue("");
    expect(screen.getByTestId("schedule-sheet-title")).toHaveValue("Install labor");
    expect(screen.getByTestId("schedule-sheet-type")).toHaveTextContent("Diagnostic/Repair");
    expect(store.jobs[0].scheduled_date).toBeUndefined();
    expect(store.labor).toHaveLength(1);
    expect(store.parts).toHaveLength(1);
    expect(store.quotes[0]).toMatchObject({ status: "approved", resulting_job_id: store.jobs[0].id });
    // lines with prices are shown in the sheet
    const sheetLines = await screen.findByTestId("schedule-sheet-lines");
    expect(sheetLines).toHaveTextContent("Install labor");
    expect(sheetLines).toHaveTextContent("$350.00");
    expect(sheetLines).toHaveTextContent("Starter");
    expect(sheetLines).toHaveTextContent("$90.00");

    fireEvent.change(screen.getByTestId("schedule-sheet-title"), { target: { value: "Starter replacement" } });
    fireEvent.change(screen.getByLabelText("Job Description (customer-facing)"), { target: { value: "Replace starter" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-11-03" } });
    fireEvent.change(screen.getByLabelText("Arrival time"), { target: { value: "10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Alex" }));
    fireEvent.click(screen.getByRole("button", { name: "3 hr" }));
    fireEvent.click(screen.getByRole("button", { name: /Create & Skip Notification/ }));
    await waitFor(() => expect(sync).toHaveBeenCalled());
    const [, patch] = jobUpdate.mock.calls.find(([, p]) => p.scheduled_date);
    expect(patch).toMatchObject({ scheduled_date: new Date("2026-11-03T10:00").toISOString(), title: "Starter replacement", assigned_to_name: "Alex", customer_description: "Replace starter", job_type: "diagnostic_repair" });
    expect(patch).not.toHaveProperty("estimated_minutes"); // column missing -> not sent
    expect(sync.mock.calls[0][0].job).toMatchObject({ estimated_minutes: 180, estimated_duration: 3 });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(store.invoices).toHaveLength(1);
    expect(jobCreate).toHaveBeenCalledTimes(1);
  });

  it("with the column, the estimate is saved; Create & Send emails the estimate", async () => {
    seedQuote();
    __setEstimateColumnForTests(true);
    renderQuote();
    fireEvent.click(await screen.findByRole("button", { name: /Mark Approved/ }));
    await screen.findByText("Schedule this job", { selector: "h2" });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-11-03" } });
    fireEvent.click(screen.getByRole("button", { name: "3 hr" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Create & Send Confirmation/ })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: /Create & Send Confirmation/ }));
    await waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(1));
    const [, patch] = jobUpdate.mock.calls.find(([, p]) => p.scheduled_date);
    expect(patch.estimated_minutes).toBe(180);
    expect(sendEmail.mock.calls[0][0].to).toBe("pat@example.com");
    expect(sendEmail.mock.calls[0][0].html).toContain("Estimated time on site: about 3 hours.");
    expect(sendEmail.mock.calls[0][0].html).toContain("Diagnostic Repair");
    expect(sendEmail.mock.calls[0][0].html).not.toMatch(/>\s*Quote\s*</);
  });

  it("asks for the service type when the lines don't make it obvious (never \"Quote\")", async () => {
    seedQuote();
    store.quoteLines.forEach(l => { l.description = "QA custom line"; });
    __setEstimateColumnForTests(false);
    renderQuote();
    fireEvent.click(await screen.findByRole("button", { name: /Mark Approved/ }));
    await screen.findByText("Schedule this job", { selector: "h2" });
    expect(store.jobs[0].job_type).toBeNull();
    expect(screen.getByTestId("schedule-sheet-type")).toHaveTextContent("Pick the service type");
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-11-03" } });
    fireEvent.click(screen.getByRole("button", { name: /Create & Skip Notification/ }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Pick the service type"));
    expect(jobUpdate.mock.calls.find(([, p]) => p.scheduled_date)).toBeUndefined();
  });

  it("an already-approved quote reuses its job (no second job) and can reopen the sheet", async () => {
    seedQuote({ status: "approved", resulting_job_id: "jX", customer_id: "c1" });
    store.customers = [{ id: "c1", name: "QA Pat", email: "pat@example.com" }];
    store.jobs = [{ id: "jX", customer_id: "c1", customer_name: "QA Pat", status: "scheduled", scheduled_date: null, title: "Quote Follow-up — QA Pat" }];
    store.labor = [{ id: "lX", job_id: "jX", description: "Install labor", total_price: 350, created_at: "2026-10-20T00:00:01Z" }];
    renderQuote();
    fireEvent.click(await screen.findByRole("button", { name: /Schedule this job/ }));
    await screen.findByText("Schedule this job", { selector: "h2" });
    // A4: an old "Quote Follow-up — …" job is offered the quote's title instead
    await waitFor(() => expect(screen.getByTestId("schedule-sheet-title")).toHaveValue("Install labor"));
    fireEvent.click(screen.getByRole("button", { name: /Schedule later/ }));
    await screen.findByText("job page");
    expect(jobCreate).not.toHaveBeenCalled();
    expect(store.jobs).toHaveLength(1);
  });

  it("a stale screen (quote approved elsewhere) does not create a second job", async () => {
    seedQuote();
    renderQuote();
    const approve = await screen.findByRole("button", { name: /Mark Approved/ });
    // Approved on another phone meanwhile:
    store.jobs = [{ id: "jOther", customer_id: "c9", customer_name: "QA Pat", status: "scheduled", scheduled_date: null }];
    Object.assign(store.quotes[0], { status: "approved", resulting_job_id: "jOther" });
    fireEvent.click(approve);
    await screen.findByText("Schedule this job", { selector: "h2" });
    expect(jobCreate).not.toHaveBeenCalled();
    expect(store.jobs).toHaveLength(1);
  });
});
