import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { requireStaff } from "../../api/_lib/staffAuth.js";

// Run 13, A2. is_staff() refuses OAuth tokens in the database. This proves the /api layer turns
// that into a refusal, and that no route has a way around it.
const ROUTES = fs.readdirSync(path.resolve("api")).filter((f) => f.endsWith(".js"));
const source = (f) => fs.readFileSync(path.resolve("api", f), "utf8");
const STAFF = ["send-email.js", "create-payment-intent.js", "update-payment-intent.js", "send-job-summary.js", "refresh-google-token.js"];
const OTHER = {
  "stripe-webhook.js": /constructEvent/,
  "generate-report.js": /CRON_SECRET/,
  "generate-parts-usage-report.js": /CRON_SECRET/,
  "check-renewals.js": /isAuthorizedCron/,
  "register-apple-pay-domain.js": /CRON_SECRET/,
  "validate-quote-token.js": /quote_approval_token/,
};

describe("/api refuses OAuth tokens", () => {
  it("a token is_staff() says no to gets 403", async () => {
    const db = { auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) } };
    const r = await requireStaff({ headers: { authorization: "Bearer oauth-token" } }, { db, staffCheck: async () => false });
    expect(r).toMatchObject({ ok: false, status: 403 });
  });
  it("a token Auth refuses (once Supabase's fix arrives) gets 401", async () => {
    const db = { auth: { getUser: async () => ({ data: { user: null }, error: { status: 403 } }) } };
    const r = await requireStaff({ headers: { authorization: "Bearer oauth-token" } }, { db, staffCheck: async () => true });
    expect(r).toMatchObject({ ok: false, status: 401 });
  });
  it("a failed check is never treated as staff", async () => {
    const db = { auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) } };
    const r = await requireStaff({ headers: { authorization: "Bearer t" } }, { db, staffCheck: async () => { throw new Error("down"); } });
    expect(r).toMatchObject({ ok: false, status: 503 });
  });
  it("every route is accounted for", () => {
    expect([...ROUTES].sort()).toEqual([...STAFF, ...Object.keys(OTHER)].sort());
  });
  it("every staff route calls requireStaff", () => {
    for (const f of STAFF) expect(source(f), f).toMatch(/requireStaff\(/);
  });
  it("the other routes use their own secret, signature or quote token, never a staff token", () => {
    for (const [f, marker] of Object.entries(OTHER)) {
      expect(source(f), f).toMatch(marker);
      expect(source(f), f).not.toMatch(/isStaffToken|\.rpc\(['"]is_staff/);
    }
  });
});
