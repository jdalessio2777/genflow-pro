import { describe, it, expect, vi } from 'vitest'
import ExcelJS from 'exceljs'
import { buildReport, buildWorkbook, buildReportHtml, REPORT_RECIPIENTS, fetchReportData } from '../../api/_lib/financeReport.js'
import { computeFinance } from '../lib/finance/core.js'

// D3: weekly report = the shared finance module's numbers + a Warranty line.
// Sunday Oct 25 2026, 8 am ET (the cron's 12:00 UTC): covers Sun Oct 18 – Sat Oct 24.
const NOW = new Date('2026-10-25T12:00:00Z')
const data = {
  jobs: [
    { id: 'j1', job_type: 'maintenance', assigned_to_name: 'Jeremy', status: 'completed', completed_date: '2026-10-20T15:00:00Z' },
    { id: 'j2', job_type: 'diagnostic_repair', assigned_to_name: 'Alex', status: 'completed', completed_date: '2026-10-24T22:00:00Z' },
    { id: 'j3', job_type: 'maintenance', status: 'completed', completed_date: '2026-10-25T05:00:00Z' }, // Oct 25 1 am ET: next week
  ],
  invoices: [
    { id: 'i1', invoice_number: 'INV-1', customer_name: 'Pat <script>', status: 'paid', job_id: 'j1', customer_id: 'c1', total: 528.8, tax_amount: 31.94, surcharge_amount: 14.33, payment_method: 'stripe_app', paid_date: '2026-10-20T16:00:00Z' },
    { id: 'i2', invoice_number: 'INV-2', customer_name: 'Lee', status: 'paid', job_id: 'j2', customer_id: 'c2', total: 300, tax_amount: 18.63, payment_method: 'check', paid_date: '2026-10-25T03:00:00Z' }, // Sat 11 pm ET: this week
    { id: 'i3', invoice_number: 'INV-3', customer_name: 'Old', status: 'paid', job_id: 'j1', customer_id: 'c1', total: 100, paid_date: '2026-10-17T15:00:00Z' }, // last week
    { id: 'i4', invoice_number: 'INV-4', customer_name: 'Owes', status: 'sent', total: 250, created_at: '2026-09-20T12:00:00Z' },
  ],
  warrantyClaims: [
    { id: 'w1', customer_name: 'Don Grennon', claim_number: 'GC-123', description: 'Fuel plenum SIB17-01', amount_paid: 412.5, date_paid: '2026-10-22', paid_via: 'check' },
    { id: 'w2', customer_name: 'Other', amount_paid: 99, date_paid: '2026-10-26', paid_via: 'ach' }, // next week
  ],
  expenses: [{ date: '2026-10-19', amount: 120.25, category: 'Fuel' }, { date: '2026-10-24', amount: 80, category: 'Parts & Supplies' }, { date: '2026-10-25', amount: 999, category: 'Fuel' }],
  jobParts: [{ job_id: 'j1', total_cost: 45 }],
  customers: [],
}

describe('weekly report', () => {
  const r = buildReport(data, 'weekly', NOW)
  it('covers the last Sun–Sat week in New York time, with the same numbers as the app', () => {
    expect(r.range).toMatchObject({ from: '2026-10-18', to: '2026-10-24' })
    expect(r.f).toEqual(computeFinance(data, r.range)) // the one module
    expect(r.f.invoiceRevenue).toBe(828.8)
    expect(r.f.warranty).toBe(412.5)
    expect(r.f.revenue).toBe(1241.3)
    expect(r.f.expenses).toBe(200.25)
    expect(r.f.net).toBe(1041.05)
    expect(r.f.jobsCompleted).toBe(2)
    expect(r.subject).toBe('GenShield Weekly Report — Oct 18 – Oct 24, 2026')
    expect(r.filename).toBe('genshield-weekly-2026-10-18.xlsx')
  })
  it('the email: summary up top, a Warranty line, small tables, escaped text, no undefined/NaN', () => {
    const html = buildReportHtml(r)
    const summary = html.slice(html.indexOf('data-summary'), html.indexOf('</table>', html.indexOf('data-summary')))
    for (const [label, v] of [['Revenue', '$1,241.30'], ['Expenses', '$200.25'], ['Net profit', '$1,041.05'], ['Jobs completed', '2']]) {
      expect(summary).toContain(label); expect(summary).toContain(v)
    }
    expect(html).toContain('Warranty reimbursements')
    expect(html).toContain('$412.50')
    expect(html).toContain('Don Grennon · #GC-123')
    expect(html).toContain('Fuel plenum SIB17-01')
    expect(html).toContain('max-width:560px')
    expect(html).toContain('width=device-width')
    expect(html).not.toMatch(/undefined|NaN|\[object/)
    expect(html).not.toContain('<script>')
  })
  it('the Excel file still opens, with a Warranty sheet and the same totals', async () => {
    const buf = await buildWorkbook(r, { generatedAt: NOW })
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf)
    expect(wb.worksheets.map(s => s.name)).toEqual(['Summary', 'Revenue Detail', 'Warranty', 'Expenses by Category', 'Outstanding Invoices', 'Jobs by Type'])
    const sum = Object.fromEntries(wb.getWorksheet('Summary').getSheetValues().filter(Boolean).map(row => [String(row[1]).trim(), row[2]]))
    expect(sum['Total Revenue']).toBe(1241.3)
    expect(sum['Warranty reimbursements']).toBe(412.5)
    expect(sum['Net Profit']).toBe(1041.05)
    const w = wb.getWorksheet('Warranty').getSheetValues().filter(Boolean)
    expect(w[1].slice(1, 7)).toEqual(['2026-10-22', 'Don Grennon', 'GC-123', 'Fuel plenum SIB17-01', 'Check', 412.5])
    const rev = wb.getWorksheet('Revenue Detail').getSheetValues().filter(Boolean)
    expect(rev.length).toBe(3) // header + 2 paid this week
    expect(rev[1][3]).toBe('Maintenance')
  })
  it('same recipients as before', () => {
    expect(REPORT_RECIPIENTS).toEqual(['derek.j.sainz@gmail.com', 'contact@genshieldservice.com'])
  })
  it('still sends without the warranty table (migration missing)', async () => {
    const ok = (rows) => ({ select: () => Promise.resolve({ data: rows, error: null }) })
    const sb = { from: (t) => (t === 'warranty_claims' ? { select: () => Promise.resolve({ data: null, error: { message: 'relation does not exist' } }) } : ok([])) }
    const d = await fetchReportData(sb)
    expect(d.warrantyMissing).toBe(true)
    expect(buildReportHtml(buildReport(d, 'weekly', NOW))).toContain('warranty table not set up yet')
  })
})

describe('the cron endpoint is never callable without its secret', () => {
  it('401 with no secret (nothing fetched, nothing sent)', async () => {
    vi.resetModules()
    const sent = vi.fn()
    vi.doMock('../../api/_lib/sendEmail.js', () => ({ sendEmail: sent }))
    const { default: handler } = await import('../../api/generate-report.js')
    const res = { status: vi.fn(() => res), json: vi.fn(() => res) }
    await handler({ headers: {}, query: { type: 'weekly' } }, res)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(sent).not.toHaveBeenCalled()
  })
})
