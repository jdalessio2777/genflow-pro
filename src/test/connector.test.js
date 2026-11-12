import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createHandler } from "../../supabase/functions/genflow-mcp/server.js";
import { TOOLS } from "../../supabase/functions/genflow-mcp/tools.js";
import { SHARED } from "../../scripts/connector/sync-shared.mjs";

const SUPA = "https://proj.supabase.co";
const URL_ = `${SUPA}/functions/v1/genflow-mcp`;
const claims = (o) => `h.${btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}.s`;
const TOKEN = claims({ sub: "u1", client_id: "claude-client" });
const CUST = "11111111-1111-4111-8111-111111111111";
const future = "2030-06-04";

// A stand-in for the connector_* database functions, with the same answers. The functions' own
// rules, guard and audit are proven against a real Postgres restore (.qa-scratch/run13/localdb/a4-test.mjs).
let db; let calls; let whoami; let down;
const res = (status, body) => new Response(body === undefined ? "" : JSON.stringify(body), { status });
const digits = (v) => String(v ?? "").replace(/\D/g, "").slice(-10);
const refuse = (message, data) => ({ ok: false, message, ...(data ? { data } : {}) });
const key = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const OPEN = ["scheduled", "dispatched", "on_site", "in_progress"];
const dayOf = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));
const FUNCS = {
  connector_search_customers: ({ p_query }) => {
    const q = p_query.toLowerCase(); const qd = q.replace(/\D/g, "");
    const hits = db.customers.filter((c) => [c.name, c.email, c.address].some((f) => String(f ?? "").toLowerCase().includes(q)) || (qd.length >= 4 && String(c.phone).replace(/\D/g, "").includes(qd)));
    return { ok: true, total: hits.length, customers: hits.slice(0, 20) };
  },
  connector_get_customer: ({ p_customer_id }) => {
    const c = db.customers.find((x) => x.id === p_customer_id);
    return c ? { ok: true, customer: c, jobs: db.jobs.filter((j) => j.customer_id === c.id) } : refuse("No customer has that id. Use search_customers to find them.");
  },
  connector_create_customer: (a) => {
    const dupes = db.customers.filter((c) => (a.p_phone && digits(c.phone) === digits(a.p_phone)) || (a.p_email && String(c.email).toLowerCase() === a.p_email.toLowerCase()) || key(c.name) === key(a.p_name));
    if (dupes.length && !a.p_proceed_despite_duplicate) return refuse("Not created: this may match a customer already on file.", { likely_duplicates: dupes });
    const row = { id: `c${db.customers.length + 1}`, name: a.p_name, phone: a.p_phone, email: a.p_email, address: a.p_address, notes: a.p_notes, ...a.p_generator };
    db.customers.push(row);
    return { ok: true, customer: row };
  },
  connector_update_customer_contact: ({ p_customer_id, p_patch }) => {
    const c = db.customers.find((x) => x.id === p_customer_id); Object.assign(c, p_patch);
    return { ok: true, customer: c };
  },
  connector_list_schedule: ({ p_from, p_to }) => ({ ok: true, jobs: db.jobs.filter((j) => j.status !== "canceled" && dayOf(j.scheduled_date) >= p_from && dayOf(j.scheduled_date) <= p_to) }),
  connector_check_availability: ({ p_date }) => ({ ok: true, jobs: db.jobs.filter((j) => OPEN.includes(j.status) && dayOf(j.scheduled_date) === p_date) }),
  connector_create_job: (a) => {
    const c = db.customers.find((x) => x.id === a.p_customer_id);
    if (!c) return refuse("No customer has that id. Use search_customers to find them.");
    const existing = db.jobs.filter((j) => j.customer_id === c.id && OPEN.includes(j.status) && dayOf(j.scheduled_date) === dayOf(a.p_scheduled_date));
    if (existing.length && !a.p_allow_duplicate) return refuse("Not created: this customer already has a job that day.", { existing_jobs: existing });
    const job = { id: `j${db.jobs.length + 1}`, customer_id: c.id, customer_name: c.name, title: a.p_title || a.p_job_type, job_type: a.p_job_type, status: "scheduled", scheduled_date: a.p_scheduled_date, arrival_window_end: a.p_arrival_window_end, estimated_minutes: a.p_estimated_minutes, assigned_techs: a.p_techs, assigned_to_name: a.p_techs[0], customer_description: a.p_description, notes: a.p_notes, generator_id: a.p_generator_id };
    db.jobs.push(job);
    return { ok: true, job };
  },
};
const CATS = ["Parts & Supplies", "Fuel", "Tools & Equipment", "Insurance", "Marketing", "Professional Services", "Vehicle", "Software & Subscriptions", "Card processing fees", "Other"];
const vkey = (e) => key(e.vendor || e.description);
const similar = (a, b) => a && b && (a === b || a.includes(b) || b.includes(a) || (a.split(" ")[0] === b.split(" ")[0] && a.split(" ")[0].length >= 3));
const dayNum = (d) => Date.parse(`${d}T12:00:00Z`) / 86400000;
const dupesOf = (r) => db.expenses.filter((e) => e.amount === r.amount && Math.abs(dayNum(e.date) - dayNum(r.date)) <= 2 && similar(vkey(e), vkey(r)));
const addRow = (r) => { const e = { id: `e${db.expenses.length + 1}`, ...r }; delete e.proceed_despite_duplicate; db.expenses.push(e); return e; };
Object.assign(FUNCS, {
  connector_finance_rows: ({ p_from, p_to }) => ({ ok: true, invoices: db.invoices.filter((i) => i.status === "paid" && dayOf(i.paid_date) >= p_from && dayOf(i.paid_date) <= p_to), unpaid: db.invoices.filter((i) => i.status === "sent"), expenses: db.expenses, warrantyClaims: [] }),
  connector_list_expenses: ({ p_from, p_to, p_search, p_category }) => {
    const hits = db.expenses.filter((e) => e.date >= p_from && e.date <= p_to && (!p_search || key(`${e.vendor} ${e.description}`).includes(key(p_search))) && (!p_category || e.category === p_category));
    return { ok: true, total: hits.length, total_amount: hits.reduce((n, e) => n + e.amount, 0), expenses: hits };
  },
  connector_list_expense_categories: () => ({ ok: true, categories: CATS.map((c) => ({ category: c, expenses_so_far: 0, can_add: c !== "Card processing fees" })) }),
  connector_add_expense: ({ p_expense: r }) => {
    const d = dupesOf(r);
    if (d.length && !r.proceed_despite_duplicate) return refuse("Not added: this looks like an expense already on file.", { likely_duplicates: d });
    return { ok: true, expense: addRow(r) };
  },
  connector_add_expenses_bulk: ({ p_expenses }) => {
    const added = []; const skipped = [];
    p_expenses.forEach((r, i) => { if (dupesOf(r).length && !r.proceed_despite_duplicate) skipped.push({ row: i + 1, reason: "likely duplicate" }); else added.push({ row: i + 1, expense: addRow(r) }); });
    return { ok: true, added, skipped };
  },
});
const fakeFetch = async (url, init = {}) => {
  const u = String(url);
  calls.push({ method: init.method || "GET", u, body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers?.Authorization });
  if (down) throw new Error("network");
  const fn = u.split("/rest/v1/rpc/")[1];
  if (fn === "connector_whoami") return whoami.status === 200 ? res(200, { user_id: "u1", email: "tech@genshieldservice.com" }) : res(whoami.status, { message: whoami.message });
  if (FUNCS[fn]) return res(200, FUNCS[fn](JSON.parse(init.body)));
  return res(404, {});
};
const handler = (over = {}) => createHandler({ supabaseUrl: SUPA, anonKey: "anon", publicUrl: URL_, fetchImpl: fakeFetch, ...over });
const post = (body, { token = TOKEN, headers = {} } = {}) => new Request(URL_, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: JSON.stringify(body) });
const call = async (name, args, over) => {
  const r = await handler(over)(post({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }));
  return (await r.json()).result;
};
const baseJob = { customer_id: CUST, service_type: "maintenance", techs: ["Jeremy"], date: future, arrival_window: "10-12" };

beforeEach(() => {
  calls = []; whoami = { status: 200 }; down = false;
  db = {
    customers: [{ id: CUST, name: "QA Pat", phone: "(973) 555-0100", email: "pat@example.com", address: "1 Elm St", generator_brand: "Generac", generator_kw: 17, generator_model: "0060531", generator_serial: "6737426" }],
    jobs: [], invoices: [], expenses: [],
  };
});

describe("connector transport and sign-in", () => {
  it("no token: 401 pointing at the metadata, nothing else touched", async () => {
    const r = await handler()(post({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, { token: null }));
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toBe(`Bearer resource_metadata="${URL_}/.well-known/oauth-protected-resource"`);
    expect(calls).toEqual([]);
  });
  it("metadata names the exact resource and the Supabase auth server", async () => {
    const r = await handler()(new Request(`${URL_}/.well-known/oauth-protected-resource`));
    expect(await r.json()).toMatchObject({ resource: URL_, authorization_servers: [`${SUPA}/auth/v1`] });
  });
  it("forged or expired token (PostgREST 401): sign in again", async () => {
    whoami = { status: 401 };
    const r = await handler()(post({ jsonrpc: "2.0", id: 1, method: "ping" }));
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });
  it("revoked grant (guard says the sign-in ended): sign in again", async () => {
    whoami = { status: 403, message: "connector: this sign-in has ended" };
    const r = await handler()(post({ jsonrpc: "2.0", id: 1, method: "ping" }));
    expect(r.status).toBe(401);
  });
  it("anything else the guard refuses: 403", async () => {
    whoami = { status: 403, message: "connector: this token is not allowed" };
    expect((await handler()(post({ jsonrpc: "2.0", id: 1, method: "ping" }))).status).toBe(403);
  });
  it("database unreachable: 503, never allowed through", async () => {
    down = true;
    expect((await handler()(post({ jsonrpc: "2.0", id: 1, method: "ping" }))).status).toBe(503);
  });
  it("never calls the Auth API, tables, /api or storage: only connector functions", async () => {
    await call("search_customers", { query: "Pat" });
    await call("get_customer", { customer_id: CUST });
    await call("create_customer", { name: "New Person" });
    await call("update_customer_contact", { customer_id: CUST, phone: "973-555-0199" });
    await call("list_schedule", { from: future });
    await call("check_availability", { date: future });
    await call("create_job", baseJob);
    for (const c of calls) expect(c.u).toMatch(/\/rest\/v1\/rpc\/connector_[a-z_]+$/);
  });
  it("bad Origin 403; GET 405; bad protocol header 400; off switch 503", async () => {
    expect((await handler()(post({}, { headers: { Origin: "https://evil.example" } }))).status).toBe(403);
    expect((await handler()(post({ jsonrpc: "2.0", id: 1, method: "ping" }, { headers: { Origin: "https://claude.ai" } }))).status).toBe(200);
    expect((await handler()(new Request(URL_))).status).toBe(405);
    expect((await handler()(post({}, { headers: { "MCP-Protocol-Version": "1999-01-01" } }))).status).toBe(400);
    expect((await handler({ disabled: true })(post({}))).status).toBe(503);
  });
  it("initialize, notifications, tools list", async () => {
    const init = await (await handler()(post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }))).json();
    expect(init.result.protocolVersion).toBe("2025-06-18");
    expect((await handler()(post({ jsonrpc: "2.0", method: "notifications/initialized" }))).status).toBe(202);
    const list = await (await handler()(post({ jsonrpc: "2.0", id: 2, method: "tools/list" }))).json();
    expect(list.result.tools.map((t) => t.name)).toEqual(["search_customers", "get_customer", "create_customer", "update_customer_contact", "list_schedule", "check_availability", "create_job", "finance_summary", "list_expenses", "list_expense_categories", "add_expense", "add_expenses_bulk"]);
  });
  it("no delete tool, and every database call carries the caller's token", async () => {
    expect(TOOLS.some((t) => /delete|remove|cancel/i.test(t.name))).toBe(false);
    expect(TOOLS.some((t) => /email|pay|charge|mileage|link|card|refund/i.test(t.name))).toBe(false);
    expect(TOOLS.every((t) => t.annotations.destructiveHint === false)).toBe(true);
    await call("search_customers", { query: "Pat" });
    expect(calls.every((c) => c.auth === `Bearer ${TOKEN}`)).toBe(true);
  });
});

describe("customers", () => {
  it("search by name, phone digits, email, address", async () => {
    for (const q of ["pat", "973555", "PAT@EXAMPLE", "elm st"]) {
      expect((await call("search_customers", { query: q })).structuredContent.customers.map((c) => c.id)).toEqual([CUST]);
    }
    expect((await call("search_customers", { query: "nobody" })).structuredContent.customers).toEqual([]);
    expect((await call("search_customers", { query: "x" })).isError).toBe(true);
  });
  it("get_customer shows the generator and never card or signature fields", async () => {
    const r = await call("get_customer", { customer_id: CUST });
    expect(r.structuredContent.generator).toBe("Generac 17kW · Model 0060531 · S/N 6737426");
    expect((await call("get_customer", { customer_id: "nope" })).isError).toBe(true);
  });
  it("create_customer refuses likely duplicates until told to proceed", async () => {
    for (const a of [{ name: "New", phone: "973-555-0100" }, { name: "New", email: "PAT@example.com" }, { name: "qa pat" }]) {
      const r = await call("create_customer", a);
      expect(r.isError).toBe(true);
      expect(r.structuredContent.likely_duplicates[0].id).toBe(CUST);
    }
    expect(db.customers).toHaveLength(1);
    expect((await call("create_customer", { name: "qa pat", proceed_despite_duplicate: "yes" })).isError).toBe(true);
    expect((await call("create_customer", { name: "qa pat", proceed_despite_duplicate: true })).isError).toBeUndefined();
    expect(db.customers).toHaveLength(2);
  });
  it("create_customer saves generator fields to the right columns", async () => {
    await call("create_customer", { name: "John Smith", email: "john@example.com", generator: { brand: "briggs and stratton", kw: 12, model: "M1", serial: "S1", install_date: "2024-05-01", cooling: "air-cooled" } });
    expect(db.customers[1]).toMatchObject({ name: "John Smith", generator_brand: "Briggs & Stratton", generator_kw: 12, generator_model: "M1", generator_serial: "S1", generator_install_date: "2024-05-01", generator_cooling: "Air-cooled" });
  });
  it("validates", async () => {
    expect((await call("create_customer", {})).content[0].text).toBe("name is required.");
    expect((await call("create_customer", { name: "A", email: "nope" })).content[0].text).toContain("email");
    expect((await call("create_customer", { name: "A", generator: { kw: "lots" } })).content[0].text).toContain("kw");
    expect((await call("create_customer", { name: "A", generator: { install_date: "2024-02-31" } })).content[0].text).toContain("install_date");
  });
  it("update: contact saves; empty generator field fills; a different value asks first", async () => {
    await call("update_customer_contact", { customer_id: CUST, phone: "973-555-0199", generator: { cooling: "Air-cooled" } });
    expect(db.customers[0]).toMatchObject({ phone: "973-555-0199", generator_cooling: "Air-cooled" });
    const r = await call("update_customer_contact", { customer_id: CUST, generator: { serial: "6737462" } });
    expect(r.isError).toBe(true);
    expect(r.structuredContent.changes_to_confirm).toEqual([{ field: "serial #", from: "6737426", to: "6737462" }]);
    expect(db.customers[0].generator_serial).toBe("6737426");
    await call("update_customer_contact", { customer_id: CUST, generator: { serial: "6737462" }, confirm_generator_changes: true });
    expect(db.customers[0].generator_serial).toBe("6737462");
  });
  it("update can't touch anything else", async () => {
    const r = await call("update_customer_contact", { customer_id: CUST, notes: "x", membership_plan: "gold", name: "Pat Q" });
    expect(r.isError).toBeUndefined();
    expect(calls.find((c) => c.u.endsWith("connector_update_customer_contact")).body.p_patch).toEqual({ name: "Pat Q" });
  });
});

describe("create_job", () => {
  it("sends the right fields and never notifies anyone", async () => {
    const r = await call("create_job", { ...baseJob, techs: ["Alex", "jeremy"], description: "Tune-up", notes: "Gate code" });
    expect(db.jobs[0]).toMatchObject({
      customer_id: CUST, customer_name: "QA Pat", job_type: "maintenance", status: "scheduled",
      scheduled_date: "2030-06-04T14:00:00.000Z", arrival_window_end: "2030-06-04T16:00:00.000Z", estimated_minutes: 120,
      assigned_techs: ["Alex", "Jeremy"], assigned_to_name: "Alex", customer_description: "Tune-up", notes: "Gate code",
    });
    expect(r.content[0].text).toContain("not notified");
    expect(r.structuredContent).toMatchObject({ customer_notified: false, arrival_window: "10 AM – 12 PM" });
  });
  it("has no email option", () => {
    const props = TOOLS.find((t) => t.name === "create_job").inputSchema.properties;
    expect(Object.keys(props).some((k) => /confirm|send|email|notify/i.test(k))).toBe(false);
  });
  it("custom window, preset by times, exact time", async () => {
    await call("create_job", { ...baseJob, arrival_window: undefined, window_start: "09:30", window_end: "11:15" });
    expect(db.jobs[0].arrival_window_end).toBe("2030-06-04T15:15:00.000Z");
    db.jobs = [];
    await call("create_job", { ...baseJob, arrival_window: undefined, exact_time: "07:00", service_type: "emergency" });
    expect(db.jobs[0]).toMatchObject({ scheduled_date: "2030-06-04T11:00:00.000Z", arrival_window_end: null });
  });
  it("clear messages for bad input", async () => {
    const msg = async (a) => { const r = await call("create_job", { ...baseJob, ...a }); expect(r.isError).toBe(true); return r.content[0].text; };
    expect(await msg({ service_type: "quote" })).toContain("service_type");
    expect(await msg({ techs: [] })).toContain("techs is required");
    expect(await msg({ techs: ["Bob"] })).toContain('"Bob"');
    expect(await msg({ date: "06/04/2030" })).toContain("YYYY-MM-DD");
    expect(await msg({ date: "2020-01-01" })).toContain("in the past");
    expect(await msg({ arrival_window: undefined })).toContain("arrival window");
    expect(await msg({ arrival_window: "9-11" })).toContain("arrival_window must be");
    expect(await msg({ arrival_window: undefined, window_start: "12:00", window_end: "10:00" })).toContain("must end after");
    expect(await msg({ exact_time: "07:00" })).toContain("not both");
    expect(await msg({ customer_id: "22222222-2222-4222-8222-222222222222" })).toContain("No customer");
    expect(await msg({ estimated_minutes: 0 })).toContain("estimated_minutes");
    expect(db.jobs).toHaveLength(0);
  });
  it("refuses a same-day repeat until told", async () => {
    await call("create_job", baseJob);
    db.jobs[0].status = "scheduled";
    const r = await call("create_job", baseJob);
    expect(r.isError).toBe(true);
    expect(r.structuredContent.existing_jobs).toHaveLength(1);
    expect((await call("create_job", { ...baseJob, allow_duplicate: true })).isError).toBeUndefined();
    expect(db.jobs).toHaveLength(2);
  });
});

describe("schedule", () => {
  const job = (o) => ({ id: "j1", customer_id: CUST, customer_name: "QA Pat", title: "T", job_type: "maintenance", status: "scheduled", scheduled_date: "2030-06-04T14:00:00.000Z", arrival_window_end: "2030-06-04T16:00:00.000Z", estimated_minutes: 120, assigned_techs: ["Jeremy", "Alex"], assigned_to_name: "Jeremy", ...o });
  it("a shared job shows for both techs, not others", async () => {
    db.jobs = [job()];
    for (const [tech, n] of [["Jeremy", 1], ["Alex", 1], ["Derek", 0]]) {
      expect((await call("list_schedule", { from: future, tech })).structuredContent.jobs).toHaveLength(n);
    }
    expect((await call("list_schedule", { from: future, to: "2031-06-04" })).isError).toBe(true);
    expect((await call("list_schedule", { from: future, to: "2030-06-01" })).isError).toBe(true);
  });
  it("availability counts window end + time on site", async () => {
    db.jobs = [job()]; // holds 10 AM to 2 PM
    const at = async (w, techs = ["Jeremy", "Derek"]) => Object.fromEntries((await call("check_availability", { date: future, techs, arrival_window: w })).structuredContent.techs.map((t) => [t.tech, t.free]));
    expect(await at("12-14")).toEqual({ Jeremy: false, Derek: true });
    expect(await at("14-16")).toEqual({ Jeremy: true, Derek: true });
    const r = await call("check_availability", { date: future });
    expect(r.structuredContent.techs.find((t) => t.tech === "Alex").jobs[0].holds_until).toBe("14:00");
  });
});

describe("shared rule files", () => {
  it("the function's copies match src/lib exactly", () => {
    for (const f of SHARED) {
      expect(fs.readFileSync(path.resolve("supabase/functions/genflow-mcp/shared", f), "utf8")).toBe(fs.readFileSync(path.resolve("src/lib", f), "utf8"));
    }
  });
  it("the function holds no service role key or Resend key", () => {
    for (const f of ["index.ts", "server.js", "tools.js"]) {
      expect(fs.readFileSync(path.resolve("supabase/functions/genflow-mcp", f), "utf8")).not.toMatch(/SERVICE_ROLE|RESEND|\/auth\/v1\/user`|\/api\//);
    }
  });
});

describe("finance tools (Part C)", () => {
  const exp = (o = {}) => ({ date: "2026-11-03", amount: 42.17, vendor: "Home Depot", category: "Parts & Supplies", source: "receipt", ...o });
  it("finance_summary uses the app's own calculation, with card fees as their own line", async () => {
    db.invoices = [
      { id: "i1", status: "paid", paid_date: "2026-11-09T17:22:23Z", total: 356.2, surcharge_amount: 9.67, tax_amount: 0, line_items: [] },
      { id: "i2", status: "paid", paid_date: "2026-10-31T12:00:00Z", total: 999, line_items: [] },
      { id: "i3", status: "sent", total: 150, invoice_number: "INV-3", customer_name: "QA Pat", created_at: "2026-11-01T12:00:00Z" },
    ];
    db.expenses = [{ date: "2026-11-09", amount: 9.67, category: "Card processing fees" }, { date: "2026-11-05", amount: 40, category: "Fuel" }];
    const r = await call("finance_summary", { from: "2026-11-01", to: "2026-11-30" });
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent).toMatchObject({ revenue: 356.2, expenses: 49.67, card_processing_fees: 9.67, card_processing_fee_count: 1, net: 306.53, card_surcharges_in_revenue: 9.67 });
    expect(r.structuredContent.unpaid_invoices).toMatchObject({ count: 1, total: 150 });
    expect(r.content[0].text).toContain("card processing fees $9.67");
  });
  it("finance_summary refuses a bad or huge range before touching the database", async () => {
    expect((await call("finance_summary", { from: "2026-11-30", to: "2026-11-01" })).isError).toBe(true);
    expect((await call("finance_summary", { from: "2020-01-01", to: "2026-11-01" })).isError).toBe(true);
    expect(calls.filter((c) => c.u.includes("finance"))).toEqual([]);
  });
  it("list_expenses filters and totals; list_expense_categories marks fees as automatic", async () => {
    db.expenses = [exp(), exp({ date: "2026-11-04", amount: 10, vendor: "Shell", category: "Fuel" })];
    const r = await call("list_expenses", { from: "2026-11-01", to: "2026-11-30", category: "Fuel" });
    expect(r.structuredContent).toMatchObject({ total: 1, total_amount: 10 });
    expect((await call("list_expenses", { from: "2026-11-01", to: "2026-11-30", category: "Snacks" })).isError).toBe(true);
    const c = await call("list_expense_categories", {});
    expect(c.structuredContent.categories.find((x) => x.category === "Card processing fees").can_add).toBe(false);
  });
  it("add_expense validates, refuses a likely duplicate, and proceeds only when told", async () => {
    expect((await call("add_expense", exp({ amount: -5 }))).isError).toBe(true);
    expect((await call("add_expense", exp({ amount: 42.175 }))).isError).toBe(true);
    expect((await call("add_expense", exp({ category: "Card processing fees" }))).isError).toBe(true);
    expect((await call("add_expense", exp({ source: "stripe" }))).isError).toBe(true);
    expect((await call("add_expense", exp({ date: "2099-01-01" }))).isError).toBe(true);
    expect((await call("add_expense", exp({ vendor: undefined, description: undefined }))).isError).toBe(true);
    expect((await call("add_expense", exp({ receipt_url: "x" }))).isError).toBe(true);
    expect(calls.filter((c) => c.u.endsWith("connector_add_expense"))).toEqual([]);
    expect((await call("add_expense", exp())).isError).toBeUndefined();
    const dupe = await call("add_expense", exp({ date: "2026-11-05", vendor: "HOME DEPOT #1234 PARSIPPANY" }));
    expect(dupe.isError).toBe(true);
    expect(dupe.structuredContent.likely_duplicates).toHaveLength(1);
    expect((await call("add_expense", exp({ date: "2026-11-05", vendor: "HOME DEPOT #1234 PARSIPPANY", proceed_despite_duplicate: true }))).isError).toBeUndefined();
    expect(db.expenses).toHaveLength(2);
  });
  it("add_expense accepts '$1,234.50' as an amount", async () => {
    const r = await call("add_expense", exp({ amount: "$1,234.50" }));
    expect(r.structuredContent.amount).toBe(1234.5);
  });
  it("add_expenses_bulk adds good rows and reports skipped rows with their row numbers and reasons", async () => {
    db.expenses = [exp()];
    const r = await call("add_expenses_bulk", { expenses: [
      exp({ date: "2026-11-02" }),                          // 1: duplicate of the existing one
      exp({ amount: 0 }),                                   // 2: bad amount, skipped before the database
      exp({ amount: 19.99, vendor: "Verizon", category: "Software & Subscriptions", source: "bank statement" }), // 3: added
      exp({ amount: 19.99, vendor: "Verizon", category: "Software & Subscriptions", source: "bank statement" }), // 4: duplicate of row 3
    ] });
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent.added.map((a) => a.row)).toEqual([3]);
    expect(r.structuredContent.skipped.map((x) => [x.row, x.reason.slice(0, 16)])).toEqual([[1, "likely duplicate"], [2, "amount must be a "], [4, "likely duplicate"]].map(([n, t]) => [n, t.slice(0, 16)]));
    expect(r.content[0].text).toContain("Added 1 expense");
  });
  it("add_expenses_bulk refuses an empty or oversized list", async () => {
    expect((await call("add_expenses_bulk", { expenses: [] })).isError).toBe(true);
    expect((await call("add_expenses_bulk", { expenses: Array.from({ length: 201 }, () => exp()) })).isError).toBe(true);
  });
  it("finance tools also only ever call connector functions", async () => {
    calls = [];
    await call("finance_summary", { from: "2026-11-01", to: "2026-11-30" });
    await call("list_expenses", { from: "2026-11-01", to: "2026-11-30" });
    await call("list_expense_categories", {});
    await call("add_expense", exp());
    await call("add_expenses_bulk", { expenses: [exp({ amount: 1 })] });
    for (const c of calls) expect(c.u).toMatch(/\/rest\/v1\/rpc\/connector_[a-z_]+$/);
  });
});
