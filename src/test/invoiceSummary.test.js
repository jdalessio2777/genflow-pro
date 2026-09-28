import { describe, it, expect } from 'vitest'
import { invoiceSummaryHTML, jobSummaryEmailHTML } from '@/lib/emailTemplates'
import { invoiceTotalCents, isZeroDollarInvoice, isZeroDollarJob, buildInvoiceLineItems } from '@/lib/utils/invoiceTotals'
import { goldenCases, goldenCustomer } from './fixtures/invoiceCases'
// Captured from the UNMODIFIED invoiceSummaryHTML at base commit 39ec302
// (before the $0 branch existed). Never regenerate this file from new code.
import golden from './fixtures/invoiceSummary.golden.json'

const PAYMENT_LANGUAGE = [/PAYMENT DUE/i, /\bPAID\b/, /THANK YOU!/, /Cash · Check/, /payable to/i, /\bunpaid\b/i]

describe('invoiceSummaryHTML — every invoice that is not exactly $0.00 is byte-identical to the pre-change output', () => {
  for (const [name, invoice] of Object.entries(goldenCases)) {
    it(`${name}`, () => {
      expect(isZeroDollarInvoice(invoice)).toBe(false)
      expect(invoiceSummaryHTML({ invoice, customer: goldenCustomer })).toBe(golden[name])
    })
  }
  it('no_customer_unpaid', () => {
    expect(invoiceSummaryHTML({ invoice: goldenCases.unpaid, customer: null })).toBe(golden.no_customer_unpaid)
  })
  it('golden fixture still covers paid and unpaid cases', () => {
    expect(golden.unpaid).toContain('PAYMENT DUE')
    expect(golden.paid_cash).toContain('✓ PAID — THANK YOU!')
    expect(golden.unpaid_negative).toContain('PAYMENT DUE') // negative total keeps the existing path
  })
})

describe('invoiceTotalCents / isZeroDollarInvoice (integer cents, strict)', () => {
  it('sums parts + labor + tax + surcharge in cents', () => {
    expect(invoiceTotalCents({ parts_total: 42.5, labor_total: 245.05, tax_amount: 19.05, surcharge_amount: 9.2 })).toBe(31580)
  })
  it('treats float noise that rounds to 0 cents as $0.00', () => {
    expect(isZeroDollarInvoice({ parts_total: 0.1 + 0.2, labor_total: -0.3 })).toBe(true)
    expect(isZeroDollarInvoice({ labor_total: 0.004 })).toBe(true)
    expect(isZeroDollarInvoice({ labor_total: -0.004 })).toBe(true)
  })
  it('one cent is not $0', () => {
    expect(isZeroDollarInvoice({ labor_total: 0.01 })).toBe(false)
    expect(isZeroDollarInvoice({ labor_total: 0.005 })).toBe(false) // rounds to 1 cent
  })
  it('negative totals are NOT $0 (they use the existing path)', () => {
    expect(isZeroDollarInvoice({ labor_total: -25 })).toBe(false)
    expect(isZeroDollarInvoice({ labor_total: -0.01 })).toBe(false)
  })
  it('discount that exactly cancels charges is $0', () => {
    expect(isZeroDollarInvoice({ parts_total: 50, labor_total: -50, tax_amount: 0 })).toBe(true)
  })
  it('missing/null fields count as 0; null invoice is not a $0 invoice', () => {
    expect(isZeroDollarInvoice({})).toBe(true)
    expect(isZeroDollarInvoice(null)).toBe(false)
  })
  it('isZeroDollarJob works off computeJobFinancials().total', () => {
    expect(isZeroDollarJob({ total: 0 })).toBe(true)
    expect(isZeroDollarJob({ total: 0.01 })).toBe(false)
    expect(isZeroDollarJob({ total: -1 })).toBe(false)
  })
})

describe('buildInvoiceLineItems', () => {
  const parts = [
    { name: 'Oil Filter', quantity: 1, price: 18.5, total_price: 18.5, charge_for_part: true },
    { name: 'Warranty Board', quantity: 1, price: 0, total_price: 0, charge_for_part: false },
  ]
  const labor = [
    { description: 'Hourly', is_flat_rate: false, hours: 2, rate: 95, total_price: 190 },
    { description: 'Flat', is_flat_rate: true, flat_rate_amount: 50, total_price: 50 },
  ]
  // Exact replica of the historical buildInvoiceData() mapping in JobDetail.jsx
  const legacy = (p, l) => [
    ...p.filter(x => x.charge_for_part !== false).map(x => ({ type: 'part', description: x.name, quantity: x.quantity, unit_price: x.price, total: x.total_price })),
    ...l.map(x => ({ type: 'labor', description: x.description, quantity: x.is_flat_rate ? 1 : x.hours, unit_price: x.is_flat_rate ? x.flat_rate_amount : x.rate, total: x.total_price })),
  ]
  it('default output equals the historical mapping exactly (no-charge parts hidden)', () => {
    expect(buildInvoiceLineItems(parts, labor)).toEqual(legacy(parts, labor))
    expect(JSON.stringify(buildInvoiceLineItems(parts, labor))).toBe(JSON.stringify(legacy(parts, labor)))
  })
  it('includeNoChargeParts lists "Don\'t charge" parts flagged no_charge at $0', () => {
    const items = buildInvoiceLineItems(parts, labor, { includeNoChargeParts: true })
    expect(items).toHaveLength(4)
    expect(items[1]).toEqual({ type: 'part', description: 'Warranty Board', quantity: 1, unit_price: 0, total: 0, no_charge: true })
  })
})

describe('invoiceSummaryHTML — exactly $0.00', () => {
  const zeroInvoice = {
    invoice_number: 'INV-ZERO1',
    created_date: '2026-06-10T12:00:00.000Z',
    customer_name: 'Big BOB',
    parts_total: 0, labor_total: 0, tax_amount: 0, surcharge_amount: 0, total: 0,
    status: 'paid', payment_method: 'no_charge', paid_date: '2026-06-10T12:00:00.000Z',
    notes: 'Warranty visit <b>free</b>\nSecond line',
    line_items: [
      { type: 'part', description: 'Warranty Board', quantity: 1, unit_price: 0, total: 0, no_charge: true },
      { type: 'labor', description: 'Warranty labor', quantity: 1, unit_price: 0, total: 0 },
    ],
  }
  const html = invoiceSummaryHTML({ invoice: zeroInvoice, customer: goldenCustomer })

  it('renders the full summary: line items and a $0.00 total', () => {
    expect(html).toContain('INV-ZERO1')
    expect(html).toContain('Warranty Board')
    expect(html).toContain('Warranty labor')
    expect(html).toContain('No charge')
    expect(html).toMatch(/Total<\/td>\s*<td[^>]*>\$0\.00<\/td>/)
    expect(html).toContain('Big BOB')
    expect(html).toContain('Generac 22kW')
  })
  it('has NO paid / unpaid / payment-due language or boxes (even with paid_date set)', () => {
    for (const re of PAYMENT_LANGUAGE) expect(html).not.toMatch(re)
    expect(html).not.toContain('No charge (')
    expect(html).not.toContain('#16a34a') // green paid colour
    expect(html).not.toContain('#d97706') // amber due colour
  })
  it('also has no payment language when unpaid (legacy $0 draft)', () => {
    const h = invoiceSummaryHTML({ invoice: { ...zeroInvoice, status: 'draft', paid_date: null, payment_method: null }, customer: goldenCustomer })
    for (const re of PAYMENT_LANGUAGE) expect(h).not.toMatch(re)
  })
  it('escapes user text in the $0 path', () => {
    expect(html).toContain('Warranty visit &lt;b&gt;free&lt;/b&gt;<br>Second line')
  })
  it('an empty $0 invoice shows a placeholder row instead of an empty table', () => {
    const h = invoiceSummaryHTML({ invoice: { ...zeroInvoice, line_items: [] }, customer: goldenCustomer })
    expect(h).toContain('no billable items')
  })
  it('rounding-to-zero totals take the $0 path; 1 cent does not', () => {
    const tiny = invoiceSummaryHTML({ invoice: { ...zeroInvoice, labor_total: 0.004, paid_date: null }, customer: goldenCustomer })
    expect(tiny).not.toContain('PAYMENT DUE')
    const cent = invoiceSummaryHTML({ invoice: { ...zeroInvoice, labor_total: 0.01, paid_date: null }, customer: goldenCustomer })
    expect(cent).toContain('PAYMENT DUE')
  })
})

describe('jobSummaryEmailHTML', () => {
  it('wraps greeting + attachment line + inline invoice (unchanged >$0 invoice markup)', () => {
    const html = jobSummaryEmailHTML({ invoice: goldenCases.unpaid, customer: goldenCustomer, attachmentLabels: ['Annual Maintenance Checklist', 'Signed Maintenance Agreement'] })
    expect(html).toContain('Hi Big,')
    expect(html).toContain('Attached (PDF): Annual Maintenance Checklist, Signed Maintenance Agreement.')
    expect(html).toContain(golden.unpaid)
  })
  it('receipt wording for pay-later receipts', () => {
    const html = jobSummaryEmailHTML({ invoice: goldenCases.paid_cash, customer: goldenCustomer, kind: 'receipt' })
    expect(html).toContain('We received your payment')
    expect(html).toContain(golden.paid_cash)
    expect(html).not.toContain('Attached (PDF)')
  })
})
