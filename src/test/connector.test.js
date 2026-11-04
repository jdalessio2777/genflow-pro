import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createHandler } from "../../supabase/functions/genflow-mcp/server.js";
import { TOOLS, summarizeInputs } from "../../supabase/functions/genflow-mcp/tools.js";
import { SHARED } from "../../scripts/connector/sync-shared.mjs";

const SUPA = "https://proj.supabase.co";
const URL_ = `${SUPA}/functions/v1/genflow-mcp`;
const claims = (o) => `h.${btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}.s`;
const TOKEN = claims({ sub: "u1", client_id: "claude-client" });
const CUST = "11111111-1111-4111-8111-111111111111";
const future = "2030-06-04";

let db; let calls; let audits; let staff; let userStatus; let sent;
const res = (status, body) => new Response(body === undefined ? "" : JSON.stringify(body), { status });
const fakeFetch = async (url, init = {}) => {
  const u = String(url); const method = init.method || "GET";
  calls.push({ method, u, body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers?.Authorization, prefer: init.headers?.Prefer });
  if (u.endsWith("/auth/v1/user")) return userStatus === 200 ? res(200, { id: "u1", email: "tech@genshieldservice.com" }) : res(userStatus, {});
  if (u.endsWith("/rpc/is_staff")) return res(200, staff);
  if (u.endsWith("/rpc/log_connector_call")) { audits.push(JSON.parse(init.body)); return res(200, null); }
  if (u.includes("/api/send-job-summary")) { sent.push(JSON.parse(init.body)); return res(200, { ok: true, id: "re_1" }); }
  const table = u.split("/rest/v1/")[1].split("?")[0];
  if (method === "GET") {
    let rows = db[table] || [];
    const id = u.match(/[?&]id=eq\.([^&]+)/); if (id) rows = rows.filter((r) => r.id === id[1]);
    const cid = u.match(/customer_id=eq\.([^&]+)/); if (cid) rows = rows.filter((r) => r.customer_id === cid[1]);
    return res(200, rows);
  }
  if (method === "POST") { const row = { id: `${table}-${db[table].length + 1}`, ...JSON.parse(init.body) }; db[table].push(row); return res(201, [row]); }
  if (method === "PATCH") { const id = u.match(/[?&]id=eq\.([^&]+)/)[1]; const r = db[table].find((x) => x.id === id); Object.assign(r, JSON.parse(init.body)); return res(200, [r]); }
  return res(500, {});
};
const handler = (over = {}) => createHandler({ supabaseUrl: SUPA, anonKey: "anon", publicUrl: URL_, appUrl: "https://app.test", oauthClientId: "claude-client", fetchImpl: fakeFetch, ...over });
const post = (body, { token = TOKEN, headers = {} } = {}) => new Request(URL_, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: JSON.stringify(body) });
const call = async (name, args, over) => {
  const r = await handler(over)(post({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }));
  return (await r.json()).result;
};
const baseJob = { customer_id: CUST, service_type: "maintenance", techs: ["Jeremy"], date: future, arrival_window: "10-12" };

beforeEach(() => {
  calls = []; audits = []; staff = true; userStatus = 200; sent = [];
  db = {
    customers: [{ id: CUST, name: "QA Pat", phone: "(973) 555-0100", email: "pat@example.com", address: "1 Elm St", generator_brand: "Generac", generator_kw: 17, generator_model: "0060531", generator_serial: "6737426" }],
    jobs: [], invoices: [],
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
  it("revoked or forged token: 401 with the pointer", async () => {
    userStatus = 401;
    const r = await handler()(post({ jsonrpc: "2.0", id: 1, method: "ping" }));
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });
  it("not staff: 403, and an ordinary app token is refused", async () => {
    staff = false;
    expect((await handler()(post({ jsonrpc: "2.0", id: 1, method: "ping" }))).status).toBe(403);
    staff = true;
    expect((await handler()(post({ jsonrpc: "2.0", id: 1, method: "ping" }, { token: claims({ sub: "u1" }) }))).status).toBe(403);
    expect((await handler()(post({ jsonrpc: "2.0", id: 1, method: "ping" }, { token: claims({ sub: "u1", client_id: "someone-else" }) }))).status).toBe(403);
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
    expect(list.result.tools.map((t) => t.name)).toEqual(["search_customers", "get_customer", "create_customer", "update_customer_contact", "list_schedule", "check_availability", "create_job"]);
  });
  it("no delete tool, and every database call carries the caller's token", async () => {
    expect(TOOLS.some((t) => /delete|remove|cancel/i.test(t.name))).toBe(false);
    expect(TOOLS.every((t) => t.annotations.destructiveHint === false)).toBe(true);
    await call("search_customers", { query: "Pat" });
    expect(calls.filter((c) => c.u.includes("/rest/v1/")).every((c) => c.auth === `Bearer ${TOKEN}`)).toBe(true);
  });
});

describe("audit", () => {
  it("reads log once; writes log started + outcome", async () => {
    await call("search_customers", { query: "Pat" });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ p_tool: "search_customers", p_ok: true, p_client_id: "claude-client", p_inputs: { query: "Pat" } });
    audits = [];
    await call("create_job", baseJob);
    expect(audits.map((a) => [a.p_result === "started", a.p_ok])).toEqual([[true, null], [false, true]]);
  });
  it("failures are logged too", async () => {
    await call("create_job", { ...baseJob, techs: ["Bob"] });
    expect(audits.at(-1)).toMatchObject({ p_ok: false });
    expect(audits.at(-1).p_result).toContain("isn't a tech");
  });
  it("a write nobody can audit doesn't happen", async () => {
    const r = await call("create_job", baseJob, { audit: async () => { throw new Error("down"); } });
    expect(r.isError).toBe(true);
    expect(db.jobs).toHaveLength(0);
  });
  it("long inputs are cut", () => {
    expect(summarizeInputs({ notes: "x".repeat(500) }).notes.length).toBeLessThan(210);
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
    expect(calls.find((c) => c.u.includes("customers?")).u).not.toMatch(/credit_card|signature/);
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
    const patch = calls.find((c) => c.method === "PATCH").body;
    expect(patch).toEqual({ name: "Pat Q" });
  });
});

describe("create_job", () => {
  it("defaults to no email; window, techs, invoice and calendar pending as the app would", async () => {
    const r = await call("create_job", { ...baseJob, techs: ["Alex", "jeremy"], description: "Tune-up", notes: "Gate code" });
    const job = db.jobs[0];
    expect(sent).toEqual([]);
    expect(job).toMatchObject({
      customer_id: CUST, customer_name: "QA Pat", title: "Maintenance", job_type: "maintenance", status: "scheduled",
      scheduled_date: "2030-06-04T14:00:00.000Z", arrival_window_end: "2030-06-04T16:00:00.000Z", estimated_minutes: 120,
      assigned_techs: ["Alex", "Jeremy"], assigned_to_name: "Alex", customer_description: "Tune-up", notes: "Gate code", calendar_sync_pending: true,
    });
    expect(db.invoices[0]).toMatchObject({ job_id: job.id, customer_id: CUST, status: "draft", total: 0 });
    expect(r.content[0].text).toContain("not notified");
    expect(r.content[0].text).toContain("next time GenFlow is open");
    expect(r.structuredContent).toMatchObject({ customer_notified: false, calendar: "pending", arrival_window: "10 AM – 12 PM" });
  });
  it("sends only on send_confirmation: true", async () => {
    for (const v of ["true", 1, "yes"]) {
      const r = await call("create_job", { ...baseJob, send_confirmation: v });
      expect(r.isError).toBe(true);
    }
    expect(sent).toEqual([]);
    await call("create_job", { ...baseJob, send_confirmation: false });
    expect(sent).toEqual([]);
    db.jobs = [];
    const r = await call("create_job", { ...baseJob, send_confirmation: true });
    expect(sent).toEqual([{ job_id: db.jobs[0].id, kind: "confirmation" }]);
    expect(r.structuredContent.customer_notified).toBe(true);
    expect(calls.find((c) => c.u.includes("send-job-summary")).auth).toBe(`Bearer ${TOKEN}`);
  });
  it("send with no email on file refuses before creating", async () => {
    db.customers[0].email = "";
    expect((await call("create_job", { ...baseJob, send_confirmation: true })).isError).toBe(true);
    expect(db.jobs).toHaveLength(0);
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
  it("a failed email is reported, job kept", async () => {
    const failing = (u, i) => (String(u).includes("send-job-summary") ? Promise.resolve(res(502, { error: "x" })) : fakeFetch(u, i));
    const r = await call("create_job", { ...baseJob, send_confirmation: true }, { fetchImpl: failing });
    expect(db.jobs).toHaveLength(1);
    expect(r.content[0].text).toContain("FAILED");
    expect(r.structuredContent.customer_notified).toBe(false);
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
      expect(fs.readFileSync(path.resolve("supabase/functions/genflow-mcp", f), "utf8")).not.toMatch(/SERVICE_ROLE|RESEND/);
    }
  });
});
