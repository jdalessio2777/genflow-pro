import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

const EXPENSE_CATEGORIES = [
  'Parts & Supplies', 'Fuel', 'Tools & Equipment', 'Insurance',
  'Marketing', 'Professional Services', 'Vehicle', 'Software & Subscriptions', 'Other',
];

const JOB_TYPES = [
  'maintenance', 'diagnostic_repair', 'emergency', 'battery_replacement',
  'warranty', 'quote', 'other',
];

// ─── period helpers ────────────────────────────────────────────────────────────

function getPeriodDates(type) {
  const now = new Date();

  if (type === 'weekly') {
    // prior complete Mon–Sun week
    const dow = now.getDay(); // 0=Sun
    const daysToThisMon = dow === 0 ? 6 : dow - 1;
    const thisMon = new Date(now);
    thisMon.setDate(now.getDate() - daysToThisMon);
    thisMon.setHours(0, 0, 0, 0);

    const start = new Date(thisMon);
    start.setDate(thisMon.getDate() - 7);
    const end = new Date(thisMon);
    end.setDate(thisMon.getDate() - 1);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  // monthly — prior full calendar month
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function periodLabel(type, start, end) {
  if (type === 'weekly') {
    const o = { month: 'short', day: 'numeric', year: 'numeric' };
    return `${start.toLocaleDateString('en-US', o)} – ${end.toLocaleDateString('en-US', o)}`;
  }
  return start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function buildFilename(type, start) {
  if (type === 'weekly') {
    return `genshield-weekly-${start.toISOString().split('T')[0]}.xlsx`;
  }
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  return `genshield-monthly-${y}-${m}.xlsx`;
}

function buildSubject(type, start, end) {
  const date = type === 'weekly'
    ? `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return `GenShield ${type === 'weekly' ? 'Weekly' : 'Monthly'} Report — ${date}`;
}

// ─── excel helpers ─────────────────────────────────────────────────────────────

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
const CURRENCY_FMT = '$#,##0.00';

function fmtMoney(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

function styleHeader(row) {
  row.eachCell({ includeEmpty: true }, cell => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
  });
  row.commit();
}

function autoFit(sheet) {
  sheet.columns.forEach(col => {
    let max = 8;
    col.eachCell({ includeEmpty: false }, cell => {
      const len = cell.value != null ? String(cell.value).length : 0;
      if (len > max) max = len;
    });
    col.width = Math.min(max + 2, 55);
  });
}

function addSheet(wb, name, tabArgb) {
  const sheet = wb.addWorksheet(name, { properties: { tabColor: { argb: tabArgb } } });
  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
  return sheet;
}

// ─── data fetching ─────────────────────────────────────────────────────────────

async function fetchData(supabase, start, end) {
  const startISO = start.toISOString();
  const endISO = end.toISOString();
  const startDate = startISO.split('T')[0];
  const endDate = endISO.split('T')[0];

  const [r1, r2, r3, r4] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, invoice_number, customer_name, job_id, total, payment_method, paid_date, created_at, parts_total, labor_total')
      .eq('status', 'paid')
      .gte('paid_date', startISO)
      .lte('paid_date', endISO)
      .order('paid_date', { ascending: false }),

    supabase
      .from('invoices')
      .select('id, invoice_number, customer_name, total, created_at')
      .eq('status', 'sent')
      .order('created_at', { ascending: true }),

    supabase
      .from('expenses')
      .select('date, amount, category, description')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false }),

    supabase
      .from('jobs')
      .select('id, job_type, total_price, completed_date')
      .in('status', ['completed', 'invoiced'])
      .gte('completed_date', startISO)
      .lte('completed_date', endISO),
  ]);

  const checks = [['paid invoices', r1], ['outstanding invoices', r2], ['expenses', r3], ['jobs', r4]];
  for (const [label, result] of checks) {
    if (result.error) throw new Error(`${label} query failed: ${result.error.message}`);
  }

  const paidInvoices = r1.data || [];

  // fetch job_type for paid invoices (for revenue detail sheet)
  const jobIds = [...new Set(paidInvoices.map(i => i.job_id).filter(Boolean))];
  let jobMap = {};
  if (jobIds.length > 0) {
    const { data: jobs, error: e5 } = await supabase.from('jobs').select('id, job_type').in('id', jobIds);
    if (e5) throw new Error(`job type lookup failed: ${e5.message}`);
    jobMap = Object.fromEntries((jobs || []).map(j => [j.id, j]));
  }

  return {
    paidInvoices,
    outstandingInvoices: r2.data || [],
    expenses: r3.data || [],
    completedJobs: r4.data || [],
    jobMap,
  };
}

// ─── Sheet 1: Summary ──────────────────────────────────────────────────────────

function buildSummarySheet(wb, data, type, start, end) {
  const { paidInvoices, outstandingInvoices, expenses } = data;
  const sheet = addSheet(wb, 'Summary', 'FF00B050');
  sheet.columns = [{ key: 'a', width: 30 }, { key: 'b', width: 25 }];

  styleHeader(sheet.addRow(['Metric', 'Value']));

  const revenue = paidInvoices.reduce((s, i) => s + (i.total || 0), 0);
  const expTotal = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const netProfit = revenue - expTotal;
  const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  const outstandingTotal = outstandingInvoices.reduce((s, i) => s + (i.total || 0), 0);

  const now = new Date();
  const aging = {
    '0–13 days': { count: 0, amount: 0 },
    '14–29 days': { count: 0, amount: 0 },
    '30+ days': { count: 0, amount: 0 },
  };
  outstandingInvoices.forEach(inv => {
    const days = Math.floor((now - new Date(inv.created_at)) / 86400000);
    const key = days >= 30 ? '30+ days' : days >= 14 ? '14–29 days' : '0–13 days';
    aging[key].count++;
    aging[key].amount += inv.total || 0;
  });

  const addKV = (label, value, bold = false) => {
    const row = sheet.addRow([label, value]);
    if (bold) {
      row.getCell(1).font = { bold: true };
      row.getCell(2).font = { bold: true };
    }
  };

  const addMoney = (label, value) => {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).font = { bold: true };
    row.getCell(2).numFmt = CURRENCY_FMT;
  };

  addKV('Report Period', periodLabel(type, start, end), true);
  addKV('Report Type', type === 'weekly' ? 'Weekly' : 'Monthly');
  addKV('Generated', new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit',
  }) + ' ET');

  sheet.addRow([]);

  addMoney('Total Revenue', revenue);
  addMoney('Total Expenses', expTotal);
  addMoney('Net Profit', netProfit);
  addKV('Profit Margin', `${margin.toFixed(1)}%`);

  sheet.addRow([]);

  addMoney('Outstanding AR', outstandingTotal);
  addKV('Invoices Paid', paidInvoices.length);
  addKV('Invoices Outstanding', outstandingInvoices.length);

  sheet.addRow([]);

  for (const [bucket, { count, amount }] of Object.entries(aging)) {
    addKV(`Aging — ${bucket}`, `${count} invoice${count !== 1 ? 's' : ''} / ${fmtMoney(amount)}`);
  }

  autoFit(sheet);
  return { revenue, expTotal, netProfit };
}

// ─── Sheet 2: Revenue Detail ───────────────────────────────────────────────────

function buildRevenueSheet(wb, paidInvoices, jobMap) {
  const sheet = addSheet(wb, 'Revenue Detail', 'FF4472C4');
  sheet.columns = [
    { key: 'inv', width: 14 },
    { key: 'customer', width: 26 },
    { key: 'job_type', width: 22 },
    { key: 'total', width: 14 },
    { key: 'payment', width: 18 },
    { key: 'paid_date', width: 16 },
    { key: 'parts', width: 14 },
    { key: 'labor', width: 14 },
  ];

  styleHeader(sheet.addRow(['Invoice #', 'Customer', 'Job Type', 'Amount', 'Payment Method', 'Paid Date', 'Parts', 'Labor']));

  paidInvoices.forEach(inv => {
    const rawType = jobMap[inv.job_id]?.job_type;
    const jobType = rawType ? rawType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—';
    const row = sheet.addRow([
      inv.invoice_number || inv.id?.slice(0, 8),
      inv.customer_name || '—',
      jobType,
      inv.total || 0,
      inv.payment_method || '—',
      inv.paid_date ? new Date(inv.paid_date).toLocaleDateString('en-US') : '—',
      inv.parts_total || 0,
      inv.labor_total || 0,
    ]);
    row.getCell(4).numFmt = CURRENCY_FMT;
    row.getCell(7).numFmt = CURRENCY_FMT;
    row.getCell(8).numFmt = CURRENCY_FMT;
  });

  autoFit(sheet);
}

// ─── Sheet 3: Expenses by Category ────────────────────────────────────────────

function buildExpensesSheet(wb, expenses) {
  const sheet = addSheet(wb, 'Expenses by Category', 'FFED7D31');
  sheet.columns = [
    { key: 'cat', width: 28 },
    { key: 'total', width: 16 },
    { key: 'count', width: 14 },
  ];

  styleHeader(sheet.addRow(['Category', 'Total Amount', '# of Expenses']));

  const totals = Object.fromEntries(EXPENSE_CATEGORIES.map(c => [c, 0]));
  const counts = Object.fromEntries(EXPENSE_CATEGORIES.map(c => [c, 0]));

  expenses.forEach(e => {
    const cat = EXPENSE_CATEGORIES.includes(e.category) ? e.category : 'Other';
    totals[cat] += e.amount || 0;
    counts[cat]++;
  });

  EXPENSE_CATEGORIES.forEach(cat => {
    const row = sheet.addRow([cat, totals[cat], counts[cat]]);
    row.getCell(2).numFmt = CURRENCY_FMT;
  });

  const grand = sheet.addRow([
    'TOTAL',
    Object.values(totals).reduce((a, b) => a + b, 0),
    Object.values(counts).reduce((a, b) => a + b, 0),
  ]);
  grand.eachCell(cell => { cell.font = { bold: true }; });
  grand.getCell(2).numFmt = CURRENCY_FMT;

  autoFit(sheet);
}

// ─── Sheet 4: Outstanding Invoices ────────────────────────────────────────────

function buildOutstandingSheet(wb, outstandingInvoices) {
  const sheet = addSheet(wb, 'Outstanding Invoices', 'FFFF0000');
  sheet.columns = [
    { key: 'inv', width: 14 },
    { key: 'customer', width: 26 },
    { key: 'total', width: 14 },
    { key: 'date', width: 16 },
    { key: 'days', width: 18 },
    { key: 'bucket', width: 16 },
  ];

  styleHeader(sheet.addRow(['Invoice #', 'Customer', 'Amount', 'Invoice Date', 'Days Outstanding', 'Aging Bucket']));

  const now = new Date();
  const sorted = [...outstandingInvoices].sort((a, b) => {
    const da = Math.floor((now - new Date(a.created_at)) / 86400000);
    const db = Math.floor((now - new Date(b.created_at)) / 86400000);
    return db - da; // oldest first
  });

  sorted.forEach(inv => {
    const days = Math.floor((now - new Date(inv.created_at)) / 86400000);
    const bucket = days >= 30 ? '30+ days' : days >= 14 ? '14–29 days' : '0–13 days';
    const row = sheet.addRow([
      inv.invoice_number || inv.id?.slice(0, 8),
      inv.customer_name || '—',
      inv.total || 0,
      new Date(inv.created_at).toLocaleDateString('en-US'),
      days,
      bucket,
    ]);
    row.getCell(3).numFmt = CURRENCY_FMT;
    if (days >= 30) {
      row.getCell(6).font = { bold: true, color: { argb: 'FFCC0000' } };
    } else if (days >= 14) {
      row.getCell(6).font = { bold: true, color: { argb: 'FFCC6600' } };
    }
  });

  autoFit(sheet);
}

// ─── Sheet 5: Jobs by Type ─────────────────────────────────────────────────────

function buildJobsSheet(wb, completedJobs, paidInvoices, jobMap) {
  const sheet = addSheet(wb, 'Jobs by Type', 'FF7030A0');
  sheet.columns = [
    { key: 'type', width: 24 },
    { key: 'count', width: 14 },
    { key: 'revenue', width: 18 },
    { key: 'avg', width: 22 },
  ];

  styleHeader(sheet.addRow(['Job Type', '# of Jobs', 'Total Revenue', 'Avg Revenue / Job']));

  const counts = Object.fromEntries(JOB_TYPES.map(t => [t, 0]));
  const revenues = Object.fromEntries(JOB_TYPES.map(t => [t, 0]));

  completedJobs.forEach(j => {
    const key = JOB_TYPES.includes(j.job_type) ? j.job_type : 'other';
    counts[key]++;
  });

  paidInvoices.forEach(inv => {
    const jType = jobMap[inv.job_id]?.job_type;
    const key = JOB_TYPES.includes(jType) ? jType : 'other';
    revenues[key] += inv.total || 0;
  });

  JOB_TYPES.forEach(type => {
    const count = counts[type];
    const rev = revenues[type];
    const row = sheet.addRow([
      type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      count,
      rev,
      count > 0 ? rev / count : 0,
    ]);
    row.getCell(3).numFmt = CURRENCY_FMT;
    row.getCell(4).numFmt = CURRENCY_FMT;
  });

  autoFit(sheet);
}

// ─── email via Resend ─────────────────────────────────────────────────────────

async function sendReport(buffer, filename, subject, { revenue, expTotal, netProfit }) {
  const profitColor = netProfit >= 0 ? '#1e40af' : '#991b1b';
  const profitBg = netProfit >= 0 ? '#eff6ff' : '#fef2f2';

  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:#1e3a5f;padding:20px 24px;border-radius:8px 8px 0 0;">
    <h1 style="color:white;margin:0;font-size:18px;">GenShield Generator Service</h1>
    <p style="color:#a8c4e0;margin:4px 0 0;font-size:13px;">Financial Report</p>
  </div>
  <div style="background:#f8f9fa;padding:22px 24px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;border-top:none;">
    <p style="font-size:14px;color:#1a1a1a;margin:0 0 16px;">Your financial report is attached. Quick summary:</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr>
        <td style="padding:9px 14px;background:#f0fdf4;border-radius:6px;font-weight:600;color:#166534;">Revenue</td>
        <td style="padding:9px 14px;background:#f0fdf4;border-radius:6px;font-weight:bold;color:#166534;text-align:right;font-size:17px;">${fmtMoney(revenue)}</td>
      </tr>
      <tr><td colspan="2" style="height:5px;"></td></tr>
      <tr>
        <td style="padding:9px 14px;background:#fef2f2;border-radius:6px;font-weight:600;color:#991b1b;">Expenses</td>
        <td style="padding:9px 14px;background:#fef2f2;border-radius:6px;font-weight:bold;color:#991b1b;text-align:right;font-size:17px;">${fmtMoney(expTotal)}</td>
      </tr>
      <tr><td colspan="2" style="height:5px;"></td></tr>
      <tr>
        <td style="padding:9px 14px;background:${profitBg};border-radius:6px;font-weight:600;color:${profitColor};">Net Profit</td>
        <td style="padding:9px 14px;background:${profitBg};border-radius:6px;font-weight:bold;color:${profitColor};text-align:right;font-size:17px;">${fmtMoney(netProfit)}</td>
      </tr>
    </table>
    <p style="font-size:12px;color:#888;margin:18px 0 0;">Open the attached Excel file for full details including invoice breakdown, expenses by category, outstanding AR, and jobs by type.</p>
  </div>
</div>`;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'GenShield Reports <contact@genshieldservice.com>',
      to: ['derek.j.sainz@gmail.com', 'contact@genshieldservice.com'],
      subject,
      html,
      attachments: [{ filename, content: buffer.toString('base64') }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Resend error ${resp.status}: ${JSON.stringify(err)}`);
  }

  return resp.json();
}

// ─── handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.query.debug === 'env') {
    return res.json({
      supabase_url: process.env.SUPABASE_URL?.slice(0,30),
      service_key_start: process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0,20),
      service_key_length: process.env.SUPABASE_SERVICE_ROLE_KEY?.length,
      resend_key_start: process.env.RESEND_API_KEY?.slice(0,10),
      report_secret_set: !!process.env.REPORT_SECRET,
    });
  }

  // Vercel cron: x-vercel-cron-authorization header is present,
  //              or Authorization: Bearer <CRON_SECRET> (newer Vercel)
  const isVercelCron =
    !!req.headers['x-vercel-cron-authorization'] ||
    (process.env.CRON_SECRET && req.headers['authorization'] === `Bearer ${process.env.CRON_SECRET}`);

  // Manual trigger: x-report-secret header must match REPORT_SECRET env var
  const isManual =
    !!process.env.REPORT_SECRET &&
    req.headers['x-report-secret'] === process.env.REPORT_SECRET;

  if (!isVercelCron && !isManual) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const type = String(req.query.type || 'monthly').toLowerCase();
  if (type !== 'weekly' && type !== 'monthly') {
    return res.status(400).json({ error: 'type must be "weekly" or "monthly"' });
  }

  try {
    const { start, end } = getPeriodDates(type);
    const fname = buildFilename(type, start);
    const subject = buildSubject(type, start, end);
    const label = periodLabel(type, start, end);

    console.log(`[report] ${type} | ${label}`);

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    const data = await fetchData(supabase, start, end);
    console.log(`[report] ${data.paidInvoices.length} paid, ${data.expenses.length} expenses, ${data.completedJobs.length} jobs, ${data.outstandingInvoices.length} outstanding`);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'GenShield GenFlow Pro';
    wb.created = new Date();

    const summaryNums = buildSummarySheet(wb, data, type, start, end);
    buildRevenueSheet(wb, data.paidInvoices, data.jobMap);
    buildExpensesSheet(wb, data.expenses);
    buildOutstandingSheet(wb, data.outstandingInvoices);
    buildJobsSheet(wb, data.completedJobs, data.paidInvoices, data.jobMap);

    const buffer = await wb.xlsx.writeBuffer();
    console.log(`[report] workbook: ${buffer.length} bytes`);

    await sendReport(buffer, fname, subject, summaryNums);
    console.log('[report] email sent via Resend');

    return res.status(200).json({
      ok: true,
      period: label,
      filename: fname,
      paid_invoices: data.paidInvoices.length,
      expenses: data.expenses.length,
      revenue: summaryNums.revenue,
      net_profit: summaryNums.netProfit,
    });
  } catch (err) {
    console.error('[report] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
