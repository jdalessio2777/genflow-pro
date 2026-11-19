// Run 14 (D): one "unpaid" rule, and an emailed draft becomes "sent".
import { describe, it, expect } from 'vitest'
import { isUnpaidInvoice, shouldMarkSentAfterEmail } from '@/lib/utils/invoiceTotals'
import { buildReport } from '../../api/_lib/financeReport.js'

const inv = (x) => ({ status: 'sent', parts_total: 100, labor_total: 0, tax_amount: 6.63, surcharge_amount: 0, total: 106.63, ...x })

describe('isUnpaidInvoice', () => {
  it('counts sent and partly paid invoices over $0', () => {
    expect(isUnpaidInvoice(inv())).toBe(true)
    expect(isUnpaidInvoice(inv({ status: 'partial' }))).toBe(true)
  })
  it('never counts draft, paid, no-charge or $0', () => {
    expect(isUnpaidInvoice(inv({ status: 'draft' }))).toBe(false)
    expect(isUnpaidInvoice(inv({ status: 'paid' }))).toBe(false)
    expect(isUnpaidInvoice(inv({ payment_method: 'no_charge' }))).toBe(false)
    expect(isUnpaidInvoice(inv({ parts_total: 0, tax_amount: 0, total: 0 }))).toBe(false)
    expect(isUnpaidInvoice(null)).toBe(false)
  })
  it('lists without parts/labor columns use the stored total', () => {
    expect(isUnpaidInvoice({ status: 'sent', total: 50 })).toBe(true)
    expect(isUnpaidInvoice({ status: 'sent', total: 0 })).toBe(false)
  })
})

describe('shouldMarkSentAfterEmail', () => {
  it('only an unpaid, charged draft', () => {
    expect(shouldMarkSentAfterEmail(inv({ status: 'draft' }))).toBe(true)
    for (const x of [{ status: 'sent' }, { status: 'paid' }, { status: 'partial' }, { status: 'draft', payment_method: 'no_charge' }, { status: 'draft', paid_date: '2026-11-18' }, { status: 'draft', parts_total: 0, tax_amount: 0, total: 0 }]) {
      expect(shouldMarkSentAfterEmail(inv(x))).toBe(false)
    }
  })
})

describe('weekly/monthly report uses the same rule', () => {
  it('outstanding = sent/partial over $0, not draft/no-charge', () => {
    const r = buildReport({ invoices: [inv({ id: 'a' }), inv({ id: 'b', status: 'draft' }), inv({ id: 'c', payment_method: 'no_charge' }), inv({ id: 'd', status: 'partial' })], expenses: [], jobs: [], warrantyClaims: [] }, 'weekly', new Date('2026-11-19T12:00:00Z'))
    expect(r.outstanding.map(i => i.id)).toEqual(['a', 'd'])
  })
})
