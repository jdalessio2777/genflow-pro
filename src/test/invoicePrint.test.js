// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { customerFacingInvoice, invoicePrintDocumentHtml } from '@/lib/invoicePrint'

const inv = {
  id: 'i1', invoice_number: 'INV-P1', status: 'draft', created_date: '2026-10-17T10:00:00Z',
  parts_total: 0, labor_total: 100, tax_amount: 6.63, tax_rate: 0.06625, total: 106.63,
  line_items: [{ description: 'Repair labor', quantity: 1, unit_price: 100, total: 100 }], notes: 'stale snapshot',
}
const job = { id: 'j1', invoice_notes: 'Replaced starter & tested', notes: 'ZZ-INTERNAL', generator_notes: 'ZZ-GEN', quote_notes: 'ZZ-QUOTE' }

describe('customerFacingInvoice', () => {
  it('uses the job Service Summary over the invoice snapshot', () => {
    expect(customerFacingInvoice({ invoice: inv, job }).notes).toBe('Replaced starter & tested')
  })
  it('empty job summary → no summary (never the stale snapshot)', () => {
    for (const v of [null, '', '  ']) expect(customerFacingInvoice({ invoice: inv, job: { ...job, invoice_notes: v } }).notes).toBe('')
  })
  it('no job → invoice unchanged', () => {
    expect(customerFacingInvoice({ invoice: inv, job: null })).toBe(inv)
  })
})

describe('invoicePrintDocumentHtml', () => {
  it('prints the Service Summary, escaped, and no internal notes', () => {
    const html = invoicePrintDocumentHtml({ invoice: customerFacingInvoice({ invoice: inv, job }), customer: { name: 'A' } })
    expect(html).toContain('SERVICE SUMMARY')
    expect(html).toContain('Replaced starter &amp; tested')
    expect(html).toContain("Content-Security-Policy")
    for (const m of ['ZZ-INTERNAL', 'ZZ-GEN', 'ZZ-QUOTE', 'stale snapshot']) expect(html).not.toContain(m)
  })
  it('no section when the summary is empty', () => {
    const html = invoicePrintDocumentHtml({ invoice: customerFacingInvoice({ invoice: inv, job: { ...job, invoice_notes: '' } }), customer: { name: 'A' } })
    expect(html).not.toContain('SERVICE SUMMARY')
  })
})
