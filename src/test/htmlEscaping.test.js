import { describe, it, expect, vi } from "vitest";

// notifyTeam imports the Supabase client; the HTML helpers under test need no network/env.
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));
import {
  quoteEmailHTML, confirmationEmailHTML, completionEmailHTML, invoiceSummaryHTML,
  checklistSummaryHTML, jobSummaryEmailHTML, combineEmailSections, serviceNotesHTML,
} from "@/lib/emailTemplates";
import { renewalEmailHTML } from "@/lib/emailTemplates/renewalEmail";
import { serviceHistoryDocumentHtml } from "@/lib/serviceHistory";
import { buildRow, buildEventBadge } from "@/lib/notifyTeam";
import { escapeHtml, safeImageSrc } from "@/lib/utils/escapeHtml";

// C-2: every generated HTML document must show user-entered text literally.
// The payload is harmless; if any template interpolates it raw, the parsed
// document contains a live <img onerror> element.
const P = `<img src=x onerror="document.title='XSS'">`;
const P2 = `"><script>window.__x=1</script>`;

const customer = {
  name: `QA-AUDIT ${P}`, address: `1 Lane ${P2}`, phone: `555 ${P}`, email: "a@b.c",
  generator_model: `22kW ${P}`, generator_serial: `SN ${P2}`,
};
const job = { id: "abcdef12-0000", title: `Job ${P}`, job_type: `maint${P}`, scheduled_date: "2026-11-01T14:00:00Z",
  customer_description: `Desc ${P}`, invoice_notes: `Notes ${P}`, status: "completed", completed_date: "2026-11-01T15:00:00Z" };
const invoice = {
  invoice_number: `INV-${P}`, customer_name: `Name ${P}`, created_date: "2026-11-01T15:00:00Z",
  parts_total: 10, labor_total: 20, tax_amount: 1.99, surcharge_amount: 0,
  line_items: [{ type: "part", description: `Part ${P}`, quantity: 1, unit_price: 10, total: 10 },
    { type: "labor", description: `Labor ${P2}`, quantity: 1, unit_price: 20, total: 20 }],
  notes: `Summary ${P}`, paid_date: "2026-11-02T00:00:00Z", payment_method: `check${P}`, payment_reference: `#${P2}`,
  customer_signature: `javascript:alert(1)`,
};
const zeroInvoice = { ...invoice, parts_total: 0, labor_total: 0, tax_amount: 0, paid_date: null,
  line_items: [{ type: "part", description: `Free ${P}`, quantity: 1, unit_price: 0, total: 0, no_charge: true }] };
const doc = { template_name: `Checklist ${P}`, status: "completed",
  field_definitions: [{ id: "h", type: "section_header", label: `Sec ${P}` }, { id: "c", type: "checkbox", label: `Chk ${P}` },
    { id: "t", type: "text", label: `Txt ${P}` }],
  field_values: { c: true, t: `Value ${P2}` } };

function assertInert(html) {
  const d = new DOMParser().parseFromString(html, "text/html");
  expect(d.querySelectorAll("script").length).toBe(0);
  for (const el of d.querySelectorAll("*")) {
    for (const a of el.attributes) expect(a.name.startsWith("on"), `${el.tagName} ${a.name}`).toBe(false);
  }
  for (const img of d.querySelectorAll("img")) expect(img.getAttribute("src")).not.toBe("x");
  return d;
}

const outputs = {
  quote: () => quoteEmailHTML({ customer, job, lineItems: [{ description: `Line ${P}`, qty: `×${P2}`, amount: 5 }], subtotal: 5, total: 5, scopeNotes: `Scope ${P}\nline2`, approveUrl: `https://x.test/?a="${P2}` }),
  confirmation: () => confirmationEmailHTML({ customer, job, techFirstName: `Tech ${P}` }),
  completion: () => completionEmailHTML({ customer, job, parts: [{ name: `Part ${P}`, quantity: 1, total_price: 5, charge_for_part: true }], labor: [{ description: `Lab ${P}`, total_price: 5 }], documents: [doc] }),
  invoice: () => invoiceSummaryHTML({ invoice, customer }),
  invoiceZero: () => invoiceSummaryHTML({ invoice: zeroInvoice, customer }),
  checklist: () => checklistSummaryHTML(doc),
  jobSummary: () => jobSummaryEmailHTML({ invoice, customer, attachmentLabels: [`Doc ${P}`] }),
  receipt: () => jobSummaryEmailHTML({ invoice, customer, kind: "receipt" }),
  combined: () => combineEmailSections([invoiceSummaryHTML({ invoice, customer }), checklistSummaryHTML(doc)]),
  serviceNotes: () => serviceNotesHTML(`N ${P}`),
  renewal: () => renewalEmailHTML({ customerName: `Ren ${P}`, plan: `Annual${P}`, expiryDate: "2026-12-01" }),
  serviceHistory: () => serviceHistoryDocumentHtml({ customer, completedJobs: [job] }),
  teamRow: () => `<table>${buildRow(`L ${P}`, `V ${P}`)}</table>${buildEventBadge(`B ${P}`, "green")}`,
};

describe("C-2 every HTML output escapes user-entered text", () => {
  for (const [name, render] of Object.entries(outputs)) {
    it(`${name}: payload is inert and shown literally`, () => {
      const html = render();
      const d = assertInert(html);
      expect(d.body.textContent).toContain(`<img src=x onerror="document.title='XSS'">`.slice(0, 20));
    });
  }

  it("service history page forbids script via CSP and has no inline handlers", () => {
    const html = serviceHistoryDocumentHtml({ customer, completedJobs: [job] });
    expect(html).toMatch(/Content-Security-Policy" content="default-src 'none'/);
    expect(html).not.toMatch(/onclick=/);
    expect(html).toContain("&lt;img src=x onerror=&quot;document.title=&#39;XSS&#39;&quot;&gt;");
  });

  it("escapeHtml / safeImageSrc", () => {
    expect(escapeHtml(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
    expect(escapeHtml(null)).toBe("");
    expect(safeImageSrc("data:image/png;base64,iVBORw0KGgo=")).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(safeImageSrc("https://x.supabase.co/a.png")).toBe("https://x.supabase.co/a.png");
    expect(safeImageSrc("javascript:alert(1)")).toBe("");
    expect(safeImageSrc('data:text/html,<script>')).toBe("");
  });
});
