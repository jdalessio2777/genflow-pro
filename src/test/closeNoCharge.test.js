import { describe, it, expect } from 'vitest'
import { canCloseAsNoCharge } from '../lib/utils/invoiceTotals.js'

const stuckInvoice = { status: 'draft', parts_total: 0, labor_total: 0, tax_amount: 0, total: 0, line_items: [], paid_date: null }
const zero = { total: 0 }

describe('canCloseAsNoCharge (legacy stuck $0 jobs)', () => {
  it('allows a completed job with a $0 draft invoice and $0 live rows', () => {
    expect(canCloseAsNoCharge({ jobStatus: 'completed', invoice: stuckInvoice, financials: zero })).toBe(true)
    expect(canCloseAsNoCharge({ jobStatus: 'completed', invoice: { ...stuckInvoice, total: null, parts_total: null }, financials: { total: 0.004 } })).toBe(true)
  })

  it('refuses when the job is not completed', () => {
    for (const s of ['scheduled', 'dispatched', 'on_site', 'invoiced', 'canceled']) {
      expect(canCloseAsNoCharge({ jobStatus: s, invoice: stuckInvoice, financials: zero })).toBe(false)
    }
  })

  it('refuses paid or missing invoices, or missing financials', () => {
    expect(canCloseAsNoCharge({ jobStatus: 'completed', invoice: { ...stuckInvoice, status: 'paid' }, financials: zero })).toBe(false)
    expect(canCloseAsNoCharge({ jobStatus: 'completed', invoice: null, financials: zero })).toBe(false)
    expect(canCloseAsNoCharge({ jobStatus: 'completed', invoice: stuckInvoice, financials: null })).toBe(false)
  })

  it('refuses anything that is not exactly 0 cents', () => {
    expect(canCloseAsNoCharge({ jobStatus: 'completed', invoice: stuckInvoice, financials: { total: 0.01 } })).toBe(false)
    expect(canCloseAsNoCharge({ jobStatus: 'completed', invoice: stuckInvoice, financials: { total: -5 } })).toBe(false)
    expect(canCloseAsNoCharge({ jobStatus: 'completed', invoice: { ...stuckInvoice, labor_total: 0.01 }, financials: zero })).toBe(false)
    expect(canCloseAsNoCharge({ jobStatus: 'completed', invoice: { ...stuckInvoice, surcharge_amount: 1 }, financials: zero })).toBe(false)
    expect(canCloseAsNoCharge({ jobStatus: 'completed', invoice: { ...stuckInvoice, total: 125 }, financials: zero })).toBe(false)
  })
})
