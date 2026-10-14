import { escapeHtml, multilineHtml } from './utils/escapeHtml.js'
import { formatDate } from './utils/format.js'

// Customer-facing "Notes" cell for the printable Service History
// (CustomerDetail.jsx). Only customer-facing job text may appear here:
//   invoice_notes        — "Describe work performed for customer invoice"
//                          (also printed as SERVICE NOTES on the invoice)
//   customer_description — "Job Description (customer-facing)"
// Never jobs.notes / generator_notes / quote_notes — those are internal.
export function serviceHistoryNotesHtml(job) {
  const text = [job?.invoice_notes, job?.customer_description]
    .map(v => (v ?? '').trim())
    .find(Boolean)
  return text ? multilineHtml(text) : '—'
}

export function serviceHistoryTitleHtml(job) {
  return escapeHtml(job?.title || '')
}

// The printable Service History document (opened in a new window by
// CustomerDetail.jsx). Every customer/job field is escaped, and a CSP meta
// tag forbids all script in the page as a second line of defense — the
// window is same-origin with the app, so injected script would run with the
// staff session.
export function serviceHistoryDocumentHtml({ customer, completedJobs }) {
  const jobRows = completedJobs.length === 0
    ? `<tr><td colspan="4" style="padding:20px;text-align:center;color:#888;font-size:13px;">No completed service history</td></tr>`
    : completedJobs.map((job, i) => `
        <tr style="background:${i % 2 === 0 ? "#f8f9fa" : "white"};">
          <td style="padding:10px 12px;font-size:13px;">${formatDate(job.completed_date || job.created_date)}</td>
          <td style="padding:10px 12px;font-size:13px;font-weight:600;">${serviceHistoryTitleHtml(job)}</td>
          <td style="padding:10px 12px;font-size:13px;text-align:center;">
            <span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:${job.status === "invoiced" ? "#dcfce7" : "#f0fdf4"};color:#166534;">
              ${job.status === "invoiced" ? "Invoiced" : "Completed"}
            </span>
          </td>
          <td style="padding:10px 12px;font-size:12px;color:#555;">${serviceHistoryNotesHtml(job)}</td>
        </tr>`).join("");

  const totalJobs = completedJobs.length;
  const firstService = completedJobs.length > 0
    ? formatDate(completedJobs[completedJobs.length - 1].completed_date || completedJobs[completedJobs.length - 1].created_date)
    : "—";
  const lastService = completedJobs.length > 0
    ? formatDate(completedJobs[0].completed_date || completedJobs[0].created_date)
    : "—";

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https:">
<title>Service History — ${escapeHtml(customer.name)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #1a1a1a; background: white; padding: 32px; max-width: 800px; margin: 0 auto; }
  @media print { body { padding: 0; } @page { margin: 0.75in; } .no-print { display: none !important; } }
</style>
</head>
<body>
  <div class="no-print" style="max-width:800px;margin:0 auto 16px;display:flex;justify-content:flex-end;">
    <button id="close-history" style="font-family:Arial,sans-serif;font-size:13px;font-weight:600;color:#1e3a5f;background:#f0f4f8;border:1px solid #cbd5e1;border-radius:8px;padding:8px 16px;cursor:pointer;">
  ✕ Close & Return to GenFlow Pro
    </button>
  </div>
  <div style="background:#1e3a5f;color:white;padding:24px 28px;border-radius:8px;margin-bottom:24px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
  <div>
    <h1 style="font-size:20px;font-weight:bold;margin-bottom:3px;">GenShield</h1>
    <p style="font-size:12px;color:#a8c4e0;">Professional Generator Service &amp; Maintenance</p>
  </div>
  <div style="text-align:right;">
    <p style="font-size:15px;font-weight:bold;color:#a8c4e0;">SERVICE HISTORY</p>
    <p style="font-size:11px;color:#a8c4e0;margin-top:3px;">Generated ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
  </div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
    <div style="background:#f8f9fa;border-radius:8px;padding:16px;">
  <p style="font-size:10px;font-weight:bold;color:#888;letter-spacing:0.5px;margin-bottom:8px;">CUSTOMER</p>
  <p style="font-size:14px;font-weight:bold;margin-bottom:3px;">${escapeHtml(customer.name)}</p>
  ${customer.address ? `<p style="font-size:12px;color:#555;margin-bottom:2px;">${escapeHtml(customer.address)}</p>` : ""}
  ${customer.phone ? `<p style="font-size:12px;color:#555;">${escapeHtml(customer.phone)}</p>` : ""}
    </div>
    <div style="background:#f8f9fa;border-radius:8px;padding:16px;">
  <p style="font-size:10px;font-weight:bold;color:#888;letter-spacing:0.5px;margin-bottom:8px;">GENERATOR</p>
  <p style="font-size:14px;font-weight:bold;margin-bottom:3px;">${escapeHtml(customer.generator_model || "Not specified")}</p>
  ${customer.generator_serial ? `<p style="font-size:12px;color:#555;margin-bottom:2px;">S/N: ${escapeHtml(customer.generator_serial)}</p>` : ""}
  ${customer.generator_install_date ? `<p style="font-size:12px;color:#555;">Installed: ${formatDate(customer.generator_install_date)}</p>` : ""}
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px;">
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px;text-align:center;">
  <p style="font-size:22px;font-weight:bold;color:#1e40af;">${totalJobs}</p>
  <p style="font-size:11px;color:#3b82f6;margin-top:2px;">Total Service Visits</p>
    </div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;text-align:center;">
  <p style="font-size:13px;font-weight:bold;color:#166534;">${firstService}</p>
  <p style="font-size:11px;color:#22c55e;margin-top:2px;">First Service</p>
    </div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;text-align:center;">
  <p style="font-size:13px;font-weight:bold;color:#166534;">${lastService}</p>
  <p style="font-size:11px;color:#22c55e;margin-top:2px;">Most Recent</p>
    </div>
  </div>
  <p style="font-size:13px;font-weight:bold;color:#1e3a5f;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;">Service Records</p>
  <table style="width:100%;border-collapse:collapse;">
    <thead>
  <tr style="background:#1e3a5f;color:white;">
    <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;width:120px;">Date</th>
    <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;">Service</th>
    <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;width:100px;">Status</th>
    <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;">Notes</th>
  </tr>
    </thead>
    <tbody>${jobRows}</tbody>
  </table>
  <div style="margin-top:32px;text-align:center;border-top:1px solid #e5e7eb;padding-top:16px;">
    <p style="font-size:11px;color:#aaa;">GenShield · This document is a record of service visits performed by GenShield</p>
  </div>
</body>
</html>`;
  return html;
}
