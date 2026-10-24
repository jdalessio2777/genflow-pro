// Weekly / monthly financial report (Run 9, D3): the data, the Excel file and
// the email HTML. Every number comes from the app's shared finance module
// (src/lib/finance/core.js) — the same one Finance > Overview and Insights
// use — so the email, the spreadsheet and the app always agree.
// api/generate-report.js only checks the cron secret, calls these and sends.
import ExcelJS from 'exceljs';
import {
  computeFinance, reportRange, jobTypeLabel, paymentMethodLabel, paidViaLabel,
  EXPENSE_CATEGORIES, JOB_TYPE_ORDER, etDate, inRange, todayET, daysBetween, revenueType,
} from '../../src/lib/finance/core.js';

export { reportRange };
export const REPORT_RECIPIENTS = ['derek.j.sainz@gmail.com', 'contact@genshieldservice.com'];

const CURRENCY_FMT = '$#,##0.00';
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
export const fmtMoney = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shortDay = (k) => new Date(`${k}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });

// ── data ──────────────────────────────────────────────────────────────────────
export async function fetchReportData(supabase) {
  const q = (table, cols, build = (x) => x) => build(supabase.from(table).select(cols));
  const [inv, exp, jobs, parts, cust, claims] = await Promise.all([
    q('invoices', 'id,status,job_id,customer_id,customer_name,invoice_number,total,tax_amount,surcharge_amount,payment_method,paid_date,created_at,parts_total,labor_total,line_items'),
    q('expenses', 'date,amount,category,description'),
    q('jobs', 'id,job_type,status,assigned_to_name,completed_date,customer_id,created_at'),
    q('job_parts', 'job_id,cost,quantity,total_cost'),
    q('customers', 'id,membership_signed,membership_start,membership_expiry'),
    q('warranty_claims', 'id,customer_name,claim_number,description,amount_paid,date_paid,paid_via'),
  ]);
  for (const [label, r] of [['invoices', inv], ['expenses', exp], ['jobs', jobs], ['job parts', parts], ['customers', cust]]) {
    if (r.error) throw new Error(`${label} query failed: ${r.error.message}`);
  }
  // Warranty table missing (migration not applied): the report still goes out, without it.
  const warrantyMissing = !!claims.error;
  return {
    invoices: inv.data || [], expenses: exp.data || [], jobs: jobs.data || [], jobParts: parts.data || [],
    customers: cust.data || [], warrantyClaims: claims.error ? [] : (claims.data || []), warrantyMissing,
  };
}

export function buildReport(data, type, now = new Date()) {
  const range = reportRange(type, now);
  const f = computeFinance(data, range);
  const outstanding = (data.invoices || []).filter(i => i.status === 'sent');
  const today = todayET(now);
  const aging = { '0–13 days': { count: 0, amount: 0 }, '14–29 days': { count: 0, amount: 0 }, '30+ days': { count: 0, amount: 0 } };
  for (const i of outstanding) {
    const days = daysBetween(etDate(i.created_at) || today, today);
    const k = days >= 30 ? '30+ days' : days >= 14 ? '14–29 days' : '0–13 days';
    aging[k].count++; aging[k].amount += Number(i.total) || 0;
  }
  const paid = (data.invoices || []).filter(i => i.status === 'paid' && inRange(etDate(i.paid_date), range));
  const claims = (data.warrantyClaims || []).filter(c => inRange(etDate(c.date_paid), range));
  const jobById = new Map((data.jobs || []).map(j => [j.id, j]));
  return {
    typeOf: (i) => revenueType(i, jobById.get(i.job_id)),
    type, range, f, paid, claims, outstanding, aging,
    outstandingTotal: outstanding.reduce((s, i) => s + (Number(i.total) || 0), 0),
    subject: `GenShield ${type === 'weekly' ? 'Weekly' : 'Monthly'} Report — ${range.label}`,
    filename: type === 'weekly' ? `genshield-weekly-${range.from}.xlsx` : `genshield-monthly-${range.from.slice(0, 7)}.xlsx`,
    warrantyMissing: !!data.warrantyMissing,
  };
}

// ── Excel ─────────────────────────────────────────────────────────────────────
function styleHeader(row) { row.eachCell({ includeEmpty: true }, c => { c.font = { bold: true }; c.fill = HEADER_FILL; }); row.commit(); }
function autoFit(sheet) { sheet.columns.forEach(col => { let max = 8; col.eachCell({ includeEmpty: false }, c => { const l = c.value != null ? String(c.value).length : 0; if (l > max) max = l; }); col.width = Math.min(max + 2, 55); }); }
function addSheet(wb, name, argb) { const s = wb.addWorksheet(name, { properties: { tabColor: { argb } } }); s.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }]; return s; }
const money = (row, ...cols) => cols.forEach(c => { row.getCell(c).numFmt = CURRENCY_FMT; });

export async function buildWorkbook(r, { generatedAt = new Date() } = {}) {
  const { f, range } = r;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'GenShield GenFlow Pro'; wb.created = generatedAt;

  const s1 = addSheet(wb, 'Summary', 'FF00B050');
  s1.columns = [{ key: 'a', width: 32 }, { key: 'b', width: 25 }];
  styleHeader(s1.addRow(['Metric', 'Value']));
  const kv = (l, v, bold) => { const row = s1.addRow([l, v]); if (bold) { row.getCell(1).font = { bold: true }; row.getCell(2).font = { bold: true }; } return row; };
  const m = (l, v) => { const row = kv(l, v, true); money(row, 2); };
  kv('Report Period', range.label, true);
  kv('Report Type', r.type === 'weekly' ? 'Weekly (Sun–Sat, New York time)' : 'Monthly');
  kv('Generated', generatedAt.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET');
  s1.addRow([]);
  m('Total Revenue', f.revenue);
  m('  Paid invoices', f.invoiceRevenue);
  m('  Warranty reimbursements', f.warranty);
  m('NJ Tax Collected', f.tax);
  m('Card Surcharges Collected', f.surcharge);
  m('Total Expenses', f.expenses);
  m('Net Profit', f.net);
  kv('Profit Margin', f.margin == null ? '—' : `${f.margin.toFixed(1)}%`);
  s1.addRow([]);
  kv('Jobs Completed', f.jobsCompleted);
  kv('Invoices Paid', f.paidInvoices);
  kv('Warranty Claims Paid', f.warrantyClaims);
  m('Average Ticket', f.avgTicket);
  m('Parts Used on Jobs (catalog cost)', f.partsSpend);
  kv('Agreements Sold', f.agreementsSold);
  kv('Active Members', f.activeMembers);
  s1.addRow([]);
  m('Outstanding AR', r.outstandingTotal);
  kv('Invoices Outstanding', r.outstanding.length);
  for (const [b, { count, amount }] of Object.entries(r.aging)) kv(`Aging — ${b}`, `${count} invoice${count !== 1 ? 's' : ''} / ${fmtMoney(amount)}`);
  autoFit(s1);

  const s2 = addSheet(wb, 'Revenue Detail', 'FF4472C4');
  styleHeader(s2.addRow(['Invoice #', 'Customer', 'Job Type', 'Amount', 'Tax Collected', 'Card Surcharge', 'Payment Method', 'Paid Date', 'Parts', 'Labor']));
  for (const i of r.paid) {
    const row = s2.addRow([i.invoice_number || String(i.id).slice(0, 8), i.customer_name || '—', jobTypeLabel(r.typeOf(i)), Number(i.total) || 0, Number(i.tax_amount) || 0, Number(i.surcharge_amount) || 0, paymentMethodLabel(i.payment_method), etDate(i.paid_date) || '—', Number(i.parts_total) || 0, Number(i.labor_total) || 0]);
    money(row, 4, 5, 6, 9, 10);
  }
  autoFit(s2);

  const s3 = addSheet(wb, 'Warranty', 'FF7030A0');
  styleHeader(s3.addRow(['Date Paid', 'Customer', 'Claim / Control #', 'Description', 'Paid Via', 'Amount']));
  for (const c of r.claims) { const row = s3.addRow([c.date_paid, c.customer_name || '—', c.claim_number || '—', c.description || '—', paidViaLabel(c.paid_via), Number(c.amount_paid) || 0]); money(row, 6); }
  const wt = s3.addRow(['TOTAL', '', '', '', '', f.warranty]); wt.eachCell(c => { c.font = { bold: true }; }); money(wt, 6);
  autoFit(s3);

  const s4 = addSheet(wb, 'Expenses by Category', 'FFED7D31');
  styleHeader(s4.addRow(['Category', 'Total Amount', '# of Expenses']));
  const byCat = Object.fromEntries(f.expensesByCategory.map(e => [e.category, e]));
  for (const c of EXPENSE_CATEGORIES) { const row = s4.addRow([c, byCat[c]?.amount || 0, byCat[c]?.count || 0]); money(row, 2); }
  const et = s4.addRow(['TOTAL', f.expenses, f.expenseCount]); et.eachCell(c => { c.font = { bold: true }; }); money(et, 2);
  autoFit(s4);

  const s5 = addSheet(wb, 'Outstanding Invoices', 'FFFF0000');
  styleHeader(s5.addRow(['Invoice #', 'Customer', 'Amount', 'Invoice Date', 'Days Outstanding']));
  const today = range.to;
  for (const i of [...r.outstanding].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
    const row = s5.addRow([i.invoice_number || String(i.id).slice(0, 8), i.customer_name || '—', Number(i.total) || 0, etDate(i.created_at), Math.max(0, daysBetween(etDate(i.created_at), today))]); money(row, 3);
  }
  autoFit(s5);

  const s6 = addSheet(wb, 'Jobs by Type', 'FF7030A0');
  styleHeader(s6.addRow(['Job Type', '# Completed', 'Revenue', 'Paid Invoices / Claims']));
  const rev = Object.fromEntries(f.byJobType.map(t => [t.type, t]));
  for (const t of JOB_TYPE_ORDER) { const row = s6.addRow([jobTypeLabel(t), f.completedByType[t] || 0, rev[t]?.revenue || 0, rev[t]?.count || 0]); money(row, 3); }
  autoFit(s6);

  return wb.xlsx.writeBuffer();
}

// ── Email (single column, phone-first; inline styles only) ───────────────────
const C = { ink: '#111827', muted: '#6b7280', line: '#e5e7eb', bg: '#f3f4f6', card: '#ffffff', brand: '#1e3a5f', good: '#166534', bad: '#991b1b' };
const tile = (label, value, color) => `<td class="t" style="width:50%;padding:6px;vertical-align:top;"><div style="background:${C.card};border:1px solid ${C.line};border-radius:12px;padding:12px 14px;"><div style="font-size:12px;color:${C.muted};font-weight:600;">${label}</div><div style="font-size:20px;font-weight:700;color:${color || C.ink};margin-top:2px;">${value}</div></div></td>`;
const h2 = (t) => `<h2 style="font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:${C.muted};margin:22px 0 8px;font-weight:700;">${t}</h2>`;
const table = (rows, { total } = {}) => `<table role="presentation" style="width:100%;border-collapse:collapse;background:${C.card};border:1px solid ${C.line};border-radius:12px;font-size:14px;">${rows.map(([a, b, sub], i) => `<tr><td style="padding:9px 14px;${i ? `border-top:1px solid ${C.line};` : ''}color:${C.ink};">${esc(a)}${sub ? `<div style="font-size:12px;color:${C.muted};">${esc(sub)}</div>` : ''}</td><td style="padding:9px 14px;${i ? `border-top:1px solid ${C.line};` : ''}text-align:right;white-space:nowrap;color:${C.ink};font-variant-numeric:tabular-nums;">${b}</td></tr>`).join('')}${total ? `<tr><td style="padding:9px 14px;border-top:2px solid ${C.line};font-weight:700;">${esc(total[0])}</td><td style="padding:9px 14px;border-top:2px solid ${C.line};text-align:right;font-weight:700;white-space:nowrap;">${total[1]}</td></tr>` : ''}</table>`;

export function buildReportHtml(r) {
  const { f, range } = r;
  const netColor = f.net >= 0 ? C.good : C.bad;
  const types = f.byJobType.length ? f.byJobType.map(t => [t.label, fmtMoney(t.revenue), `${t.count} ${t.type === 'warranty' ? 'claim' : 'invoice'}${t.count !== 1 ? 's' : ''}`]) : [['No paid work this period', fmtMoney(0)]];
  const cats = f.expensesByCategory.length ? f.expensesByCategory.map(e => [e.category, fmtMoney(e.amount), `${e.count} expense${e.count !== 1 ? 's' : ''}`]) : [['No expenses this period', fmtMoney(0)]];
  const claimRows = r.claims.map(c => [[c.customer_name, c.claim_number && `#${c.claim_number}`].filter(Boolean).join(' · ') || 'Warranty claim', fmtMoney(c.amount_paid), [c.description, shortDay(c.date_paid), paidViaLabel(c.paid_via)].filter(Boolean).join(' · ')]);
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><style>@media (max-width:480px){.t{display:block!important;width:100%!important;}}</style></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${C.ink};">
<div style="max-width:560px;margin:0 auto;padding:16px 12px 28px;">
  <div style="background:${C.brand};border-radius:14px;padding:18px 20px;color:#fff;">
    <div style="font-size:13px;color:#a8c4e0;font-weight:600;">GenShield Generator Service</div>
    <div style="font-size:20px;font-weight:700;margin-top:2px;">${r.type === 'weekly' ? 'Weekly' : 'Monthly'} financial report</div>
    <div style="font-size:14px;color:#dbe7f3;margin-top:4px;">${esc(range.label)}</div>
  </div>
  <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:10px;" data-summary>
    <tr>${tile('Revenue', fmtMoney(f.revenue))}${tile('Expenses', fmtMoney(f.expenses))}</tr>
    <tr>${tile('Net profit', fmtMoney(f.net), netColor)}${tile('Jobs completed', String(f.jobsCompleted))}</tr>
  </table>
  ${h2('Revenue')}
  ${table([
    ['Paid invoices', fmtMoney(f.invoiceRevenue), `${f.paidInvoices} invoice${f.paidInvoices !== 1 ? 's' : ''} · avg ticket ${fmtMoney(f.avgTicket)}`],
    ['Warranty reimbursements', fmtMoney(f.warranty), `${f.warrantyClaims} claim${f.warrantyClaims !== 1 ? 's' : ''}${r.warrantyMissing ? ' · warranty table not set up yet' : ''}`],
    ['Card surcharges (included above)', fmtMoney(f.surcharge)],
    ['NJ sales tax collected (included above)', fmtMoney(f.tax)],
  ], { total: ['Total revenue', fmtMoney(f.revenue)] })}
  ${h2('Revenue by job type')}
  ${table(types)}
  ${claimRows.length ? h2('Warranty claims paid') + table(claimRows, { total: ['Warranty total', fmtMoney(f.warranty)] }) : ''}
  ${h2('Expenses by category')}
  ${table(cats, { total: ['Total expenses', fmtMoney(f.expenses)] })}
  ${h2('Also')}
  ${table([
    ['Parts used on jobs (catalog cost)', fmtMoney(f.partsSpend)],
    ['Outstanding invoices', fmtMoney(r.outstandingTotal), `${r.outstanding.length} unpaid`],
    ['Maintenance agreements sold', String(f.agreementsSold), `${f.activeMembers} active members`],
  ])}
  <p style="font-size:12px;color:${C.muted};margin:18px 4px 0;line-height:1.5;">The attached Excel file has every invoice, warranty claim, expense category, outstanding invoice and job type. Revenue = paid invoices (incl. NJ tax and card surcharges) + warranty reimbursements, by the day paid (New York time) — the same numbers as Finance in the app.</p>
</div></body></html>`;
}
