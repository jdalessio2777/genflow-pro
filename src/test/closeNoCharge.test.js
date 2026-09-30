import { describe, it, expect } from 'vitest'
import { canCloseAsNoCharge, receiptEmailExpected } from '../lib/utils/invoiceTotals.js'

describe('receiptEmailExpected (record payment on a legacy job sends no email)', () => {
  const inv = { job_id: 'j', status: 'draft', parts_total: 0, labor_total: 120, tax_amount: 7.95 }
  const cust = { email: 'x@example.com' }
  it('legacy job (completion email never sent) -> no receipt', () => {
    expect(receiptEmailExpected({ job: { completion_email_sent_at: null }, invoice: inv, customer: cust })).toBe(false)
  })
  it('completion email sent, >$0, customer email -> receipt', () => {
    expect(receiptEmailExpected({ job: { completion_email_sent_at: '2026-09-28T10:00:00Z' }, invoice: inv, customer: cust })).toBe(true)
  })
  it('unknown job -> null (server decides); no email/customer/$0 -> false', () => {
    expect(receiptEmailExpected({ job: undefined, invoice: inv, customer: cust })).toBeNull()
    const sent = { completion_email_sent_at: '2026-09-28T10:00:00Z' }
    expect(receiptEmailExpected({ job: sent, invoice: inv, customer: {} })).toBe(false)
    expect(receiptEmailExpected({ job: sent, invoice: { ...inv, labor_total: 0, tax_amount: 0 }, customer: cust })).toBe(false)
    expect(receiptEmailExpected({ job: sent, invoice: { ...inv, job_id: null }, customer: cust })).toBe(false)
  })
})

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
