import { describe, it, expect } from 'vitest'
import {
  etDate, rangeFor, previousRange, reportRange, computeFinance, computeSeries, bucketsFor, change, revenueType,
  addMonths, startOfWeek, inRange,
} from '../lib/finance/core.js'

const NOW = new Date('2026-10-24T16:00:00Z') // Sat Oct 24 2026, noon ET

const data = {
  jobs: [
    { id: 'j1', job_type: 'maintenance', assigned_to_name: 'Jeremy', status: 'completed', completed_date: '2026-10-02T15:00:00Z' },
    { id: 'j2', job_type: 'diagnostic_repair', assigned_to_name: 'Alex', status: 'invoiced', completed_date: '2026-10-21T18:00:00Z' },
    { id: 'j3', job_type: 'quote', assigned_to_name: 'Alex', status: 'completed', completed_date: '2026-10-10T18:00:00Z' }, // legacy type
    { id: 'j4', job_type: 'maintenance', status: 'completed', completed_date: '2026-09-15T18:00:00Z' },
    { id: 'j5', job_type: 'diagnostic_repair', status: 'scheduled' },
  ],
  invoices: [
    { id: 'i1', status: 'paid', job_id: 'j1', customer_id: 'c1', total: 300, tax_amount: 18.63, surcharge_amount: 0, payment_method: 'check', paid_date: '2026-10-02T16:00:00Z', line_items: [{ description: 'Annual Service Agreement — Air-Cooled', total: 281.37 }] },
    // $0 no-charge diagnostic (warranty work): still listed by type, with its job
    { id: 'i2', status: 'paid', job_id: 'j2', customer_id: 'c2', total: 0, tax_amount: 0, payment_method: 'no_charge', paid_date: '2026-10-21T19:00:00Z' },
    // legacy "quote" job typed from its invoice lines
    { id: 'i3', status: 'paid', job_id: 'j3', customer_id: 'c3', total: 528.8, tax_amount: 31.94, surcharge_amount: 14.33, payment_method: 'stripe_app', paid_date: '2026-10-11T02:30:00Z', line_items: [{ description: 'Battery 26R Replacement', total: 482.53 }] }, // Oct 10 10:30 pm ET
    { id: 'i4', status: 'paid', job_id: 'j4', customer_id: 'c1', total: 200, tax_amount: 12.42, payment_method: 'cash', paid_date: '2026-09-15T19:00:00Z' },
    { id: 'i5', status: 'draft', job_id: 'j5', customer_id: 'c4', total: 999 }, // not paid: never revenue
    { id: 'i6', status: 'paid', job_id: 'j4', customer_id: 'c1', total: 50, paid_date: '2026-11-01T03:30:00Z' }, // Oct 31 11:30 pm ET
  ],
  warrantyClaims: [
    { id: 'w1', amount_paid: 412.5, date_paid: '2026-10-20', paid_via: 'check', customer_name: 'Don Grennon' },
    { id: 'w2', amount_paid: 90, date_paid: '2026-09-30', paid_via: 'distributor_credit' },
  ],
  expenses: [
    { id: 'e1', date: '2026-10-05', amount: 100, category: 'Fuel' },
    { id: 'e2', date: '2026-10-06', amount: 250.25, category: 'Parts & Supplies' },
    { id: 'e3', date: '2026-09-30', amount: 40, category: 'Mystery' },
  ],
  jobParts: [
    { job_id: 'j1', total_cost: 30 }, { job_id: 'j3', cost: 120, quantity: 1, total_cost: null }, { job_id: 'j4', total_cost: 500 },
  ],
  customers: [
    { id: 'c1', membership_signed: true, membership_start: '2026-10-02T16:00:00Z', membership_expiry: '2027-10-02T16:00:00Z' },
    { id: 'c9', membership_signed: true, membership_start: '2025-09-01T16:00:00Z', membership_expiry: '2026-09-01T16:00:00Z' }, // lapsed
    { id: 'c8', membership_signed: false, membership_start: '2026-10-03T16:00:00Z' },
  ],
}

describe('dates in New York time', () => {
  it('a late-evening payment counts on its ET day', () => {
    expect(etDate('2026-11-01T03:30:00Z')).toBe('2026-10-31')
    expect(etDate('2026-10-11T02:30:00Z')).toBe('2026-10-10')
    expect(etDate('2026-10-05')).toBe('2026-10-05')
    expect(etDate(null)).toBeNull()
  })
  it('ranges and their previous period', () => {
    expect(rangeFor('week', { now: NOW })).toMatchObject({ from: '2026-10-18', to: '2026-10-24' })
    expect(rangeFor('month', { now: NOW })).toMatchObject({ from: '2026-10-01', to: '2026-10-24' })
    expect(rangeFor('last_month', { now: NOW })).toMatchObject({ from: '2026-09-01', to: '2026-09-30' })
    expect(rangeFor('quarter', { now: NOW })).toMatchObject({ from: '2026-10-01', to: '2026-10-24' })
    expect(rangeFor('ytd', { now: NOW })).toMatchObject({ from: '2026-01-01', to: '2026-10-24' })
    expect(rangeFor('last12', { now: NOW })).toMatchObject({ from: '2025-10-25', to: '2026-10-24' })
    expect(rangeFor('custom', { now: NOW, from: '2026-10-20', to: '2026-10-01' })).toMatchObject({ from: '2026-10-01', to: '2026-10-20' })
    expect(previousRange(rangeFor('month', { now: NOW }))).toMatchObject({ from: '2026-09-01', to: '2026-09-24' })
    expect(previousRange(rangeFor('last_month', { now: NOW }))).toMatchObject({ from: '2026-08-01', to: '2026-08-31' })
    expect(previousRange(rangeFor('week', { now: NOW }))).toMatchObject({ from: '2026-10-11', to: '2026-10-17' })
    expect(previousRange(rangeFor('custom', { now: NOW, from: '2026-10-11', to: '2026-10-20' }))).toMatchObject({ from: '2026-10-01', to: '2026-10-10' })
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28')
    expect(startOfWeek('2026-10-24')).toBe('2026-10-18')
  })
  it('weekly report = last complete Sun–Sat week, in ET', () => {
    expect(reportRange('weekly', new Date('2026-10-25T12:00:00Z'))).toMatchObject({ from: '2026-10-18', to: '2026-10-24' })
    expect(reportRange('monthly', new Date('2026-11-01T12:00:00Z'))).toMatchObject({ from: '2026-10-01', to: '2026-10-31' })
  })
})

describe('computeFinance', () => {
  const oct = rangeFor('custom', { from: '2026-10-01', to: '2026-10-31' })
  const f = computeFinance(data, oct)
  it('revenue = paid invoices (incl. tax + surcharge) + warranty reimbursements, nothing twice', () => {
    expect(f.invoiceRevenue).toBe(878.8) // 300 + 0 + 528.80 + 50 (Oct 31 ET)
    expect(f.warranty).toBe(412.5)
    expect(f.revenue).toBe(1291.3)
    expect(f.surcharge).toBe(14.33)
    expect(f.tax).toBe(50.57)
    expect(f.paidInvoices).toBe(4)
    expect(f.expenses).toBe(350.25)
    expect(f.net).toBe(941.05)
  })
  it('revenue by job type lists every type (the Overview bug: only Maintenance showed)', () => {
    const t = Object.fromEntries(f.byJobType.map(x => [x.type, x]))
    expect(t.maintenance.revenue).toBe(350) // 300 + the Oct 31 50
    expect(t.battery_replacement.revenue).toBe(528.8) // legacy "quote" job typed from its lines
    expect(t.diagnostic_repair).toMatchObject({ revenue: 0, count: 1, label: 'Diagnostic/Repair' }) // $0 type still listed
    expect(t.warranty).toMatchObject({ revenue: 412.5, count: 1, label: 'Warranty' })
    expect(f.byJobType.reduce((s, x) => s + x.revenue, 0)).toBeCloseTo(f.revenue, 2) // adds up to revenue
    expect(revenueType({ line_items: [] }, { job_type: 'quote' })).toBe('other')
  })
  it('by tech, by payment method (warranty by how it was paid)', () => {
    expect(f.byTech.find(x => x.tech === 'Alex').revenue).toBe(528.8)
    expect(f.byTech.find(x => x.tech === 'Unassigned').revenue).toBe(50)
    expect(f.byPaymentMethod.map(m => m.label)).toEqual(['Card (Stripe App)', 'Warranty · Check', 'Check', 'Not recorded', 'No charge'])
  })
  it('jobs, parts spend, customers, average ticket, agreements', () => {
    expect(f.jobsCompleted).toBe(3) // j1, j2, j3 (j4 in Sept, j5 not done)
    expect(f.partsSpend).toBe(150) // 30 + 120x1
    expect(f.customersServed).toBe(3) // c1, c2, c3
    expect(f.newCustomers).toBe(2) // c1 first paid in Sept
    expect(f.returningCustomers).toBe(1)
    expect(f.avgTicket).toBe(292.93) // (300 + 528.8 + 50) / 3 charged
    expect(f.agreementsSold).toBe(1) // c1 signed Oct 2 (c8 not signed)
    expect(f.activeMembers).toBe(1) // c9 lapsed
    expect(f.agreementRevenue).toBe(281.37)
    expect(f.expensesByCategory[0]).toEqual({ category: 'Parts & Supplies', amount: 250.25, count: 1 })
  })
  it('an unknown expense category counts as Other; drafts never count', () => {
    const s = computeFinance(data, rangeFor('custom', { from: '2026-09-01', to: '2026-09-30' }))
    expect(s.expensesByCategory).toEqual([{ category: 'Other', amount: 40, count: 1 }])
    expect(s.revenue).toBe(290) // 200 + 90 warranty
  })
  it('change vs previous', () => {
    expect(change(150, 100)).toBe(50); expect(change(50, 100)).toBe(-50); expect(change(5, 0)).toBeNull(); expect(change(0, 0)).toBe(0)
  })
})

describe('series over time', () => {
  it('buckets: days <= 14 days, weeks <= ~3 months, months beyond', () => {
    expect(bucketsFor(rangeFor('week', { now: NOW })).unit).toBe('day')
    expect(bucketsFor(rangeFor('month', { now: NOW })).unit).toBe('week')
    expect(bucketsFor(rangeFor('ytd', { now: NOW })).unit).toBe('month')
  })
  it('the buckets add up to the range total', () => {
    const r = rangeFor('custom', { from: '2026-09-01', to: '2026-10-31' })
    const s = computeSeries(data, r); const f = computeFinance(data, r)
    expect(s.points.reduce((a, p) => a + p.revenue, 0)).toBeCloseTo(f.revenue, 2)
    expect(s.points.reduce((a, p) => a + p.expenses, 0)).toBeCloseTo(f.expenses, 2)
    expect(s.points.reduce((a, p) => a + p.jobs, 0)).toBe(f.jobsCompleted)
    expect(s.points.every(p => inRange(p.from, r) && inRange(p.to, r))).toBe(true)
  })
})
