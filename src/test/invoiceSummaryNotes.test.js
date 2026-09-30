// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { serviceNotesHTML, invoiceSummaryHTML } from '@/lib/emailTemplates'
import { buildJobSummaryEmail, invoiceForEmail } from '../../api/_lib/jobSummary.js'

const customer = { name: 'Big BOB', email: 'x@example.com' }
const INTERNAL = ['ZZ-INTERNAL-NOTES', 'ZZ-INTERNAL-GEN', 'ZZ-INTERNAL-QUOTE']
const baseJob = { id: 'j1', title: 'Repair', notes: INTERNAL[0], generator_notes: INTERNAL[1], quote_notes: INTERNAL[2] }
const labor = [{ description: 'Repair labor', is_flat_rate: true, flat_rate_amount: 100, total_price: 100 }]
const invPaid = {
  id: 'i1', invoice_number: 'INV-T1', status: 'paid', payment_method: 'cash', paid_date: '2026-09-28T12:00:00Z',
  created_date: '2026-09-28T10:00:00Z', parts_total: 0, labor_total: 100, tax_amount: 6.63, tax_rate: 0.06625, total: 106.63,
  line_items: [{ type: 'labor', description: 'Repair labor', quantity: 1, unit_price: 100, total: 100 }], notes: '',
}
const invUnpaid = { ...invPaid, status: 'draft', paid_date: null, payment_method: null }
const invZero = { ...invUnpaid, labor_total: 0, tax_amount: 0, total: 0, line_items: [] }
const zeroLabor = [{ description: 'Warranty visit', is_flat_rate: true, flat_rate_amount: 0, total_price: 0 }]

describe('serviceNotesHTML', () => {
  it('omits the block for empty / whitespace / null', () => {
    for (const v of ['', '   \n\t ', null, undefined]) expect(serviceNotesHTML(v)).toBe('')
  })
  it('escapes and keeps line breaks', () => {
    const h = serviceNotesHTML('Replaced <b>starter</b> & "battery"\nLoad test OK')
    expect(h).toContain('SERVICE NOTES')
    expect(h).toContain('Replaced &lt;b&gt;starter&lt;/b&gt; &amp; &quot;battery&quot;<br>Load test OK')
    expect(h).not.toContain('<b>')
  })
  it('>$0 invoice renders escaped notes; whitespace-only notes render nothing', () => {
    expect(invoiceSummaryHTML({ invoice: { ...invUnpaid, notes: '<script>x</script>' }, customer })).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(invoiceSummaryHTML({ invoice: { ...invUnpaid, notes: '  ' }, customer })).not.toContain('SERVICE NOTES')
  })
})

describe('job summary email carries the customer-facing Invoice Summary (jobs.invoice_notes)', () => {
  const cases = {
    'completion, $0': { kind: 'completion', invoice: invZero, labor: zeroLabor },
    'completion, >$0 unpaid': { kind: 'completion', invoice: invUnpaid, labor },
    'completion, >$0 paid': { kind: 'completion', invoice: invPaid, labor },
    'receipt, >$0 paid': { kind: 'receipt', invoice: invPaid, labor },
  }
  for (const [name, c] of Object.entries(cases)) {
    it(`${name}: present from the job even when the invoice snapshot is empty`, async () => {
      const job = { ...baseJob, invoice_notes: 'Replaced starter & battery\nAll tests passed' }
      const { html } = await buildJobSummaryEmail({ kind: c.kind, job, customer, invoice: { ...c.invoice, notes: '' }, labor: c.labor })
      expect(html).toContain('SERVICE NOTES')
      expect(html).toContain('Replaced starter &amp; battery<br>All tests passed')
      for (const m of INTERNAL) expect(html).not.toContain(m)
    })
    it(`${name}: job text wins over a stale snapshot`, async () => {
      const job = { ...baseJob, invoice_notes: 'Final summary' }
      const { html } = await buildJobSummaryEmail({ kind: c.kind, job, customer, invoice: { ...c.invoice, notes: 'Final su' }, labor: c.labor })
      expect(html).toContain('>Final summary</p>')
      expect(html).not.toContain('>Final su</p>')
    })
    it(`${name}: omitted when the job summary is empty/whitespace (even if a stale snapshot exists)`, async () => {
      for (const v of [null, '', '  \n ']) {
        const job = { ...baseJob, invoice_notes: v }
        const { html } = await buildJobSummaryEmail({ kind: c.kind, job, customer, invoice: { ...c.invoice, notes: 'old text' }, labor: c.labor })
        expect(html).not.toContain('SERVICE NOTES')
        expect(html).not.toContain('old text')
        for (const m of INTERNAL) expect(html).not.toContain(m)
      }
    })
  }
  it('internal notes are never used as a fallback', async () => {
    const { html } = await buildJobSummaryEmail({ kind: 'completion', job: { ...baseJob, invoice_notes: undefined }, customer, invoice: invZero, labor: zeroLabor })
    for (const m of INTERNAL) expect(html).not.toContain(m)
  })
  it('without a job, the invoice snapshot is used as-is', () => {
    expect(invoiceForEmail({ invoice: { ...invPaid, notes: 'snap' } }).notes).toBe('snap')
  })
})
