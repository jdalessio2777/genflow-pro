// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parseAttachmentSelection, selectDocuments, selectionKey } from '../../api/send-job-summary.js'
import { buildJobSummaryEmail } from '../../api/_lib/jobSummary.js'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const FOREIGN = '33333333-3333-4333-8333-333333333333'
const docs = [
  { id: A, status: 'completed', template_name: 'Annual Checklist', data: {} },
  { id: B, status: 'completed', template_name: 'Load Test Checklist', data: {} },
  { id: FOREIGN.replace('3', '4'), status: 'draft', template_name: 'Draft doc', data: {} },
]

describe('attachment selection (send-job-summary)', () => {
  it('omitted document_ids -> all completed docs; agreement on by default', () => {
    const sel = parseAttachmentSelection({})
    expect(sel.includeAgreement).toBe(true)
    expect(selectDocuments(docs, sel).map(d => d.id)).toEqual([A, B])
  })
  it('explicit ids -> only those; foreign / draft ids never match', () => {
    const sel = parseAttachmentSelection({ document_ids: [B, FOREIGN], include_agreement: false })
    expect(sel.includeAgreement).toBe(false)
    expect(selectDocuments(docs, sel).map(d => d.id)).toEqual([B])
    expect(selectDocuments(docs, parseAttachmentSelection({ document_ids: [] }))).toEqual([])
  })
  it('rejects malformed document_ids', () => {
    expect(() => parseAttachmentSelection({ document_ids: 'x' })).toThrow()
    expect(() => parseAttachmentSelection({ document_ids: ['not-a-uuid'] })).toThrow()
  })
  it('idempotency key part differs per selection and is order-independent', () => {
    const k = (ids, ag) => selectionKey(ids.map(id => ({ id })), ag)
    expect(k([A, B], true)).toBe(k([B, A], true))
    expect(k([A, B], true)).not.toBe(k([A], true))
    expect(k([A], true)).not.toBe(k([A], false))
    expect(k([], false)).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('buildJobSummaryEmail with a subset of documents', () => {
  const job = { id: 'j1', title: 'Service', invoice_notes: '' }
  const customer = { name: 'Big BOB', email: 'x@example.com' }
  const invoice = { id: 'i1', invoice_number: 'INV-T', status: 'paid', paid_date: '2026-09-28T12:00:00Z', payment_method: 'cash', created_date: '2026-09-28T10:00:00Z', parts_total: 0, labor_total: 100, tax_amount: 6.63, total: 106.63, line_items: [], notes: '' }
  it('attaches only the selected checklist and says so', async () => {
    const e = await buildJobSummaryEmail({ kind: 'completion', job, customer, invoice, documents: [docs[1]] })
    expect(e.attachments.map(a => a.filename)).toHaveLength(1)
    expect(e.attachmentLabels).toEqual(['Load Test Checklist'])
    expect(e.html).toContain('Attached (PDF): Load Test Checklist.')
    expect(e.html).not.toContain('Annual Checklist')
  })
  it('no documents -> no attachments and no "Attached" line', async () => {
    const e = await buildJobSummaryEmail({ kind: 'completion', job, customer, invoice, documents: [] })
    expect(e.attachments).toEqual([])
    expect(e.html).not.toContain('Attached (PDF)')
    expect(e.subject).toBe('Invoice INV-T — GenShield')
  })
})
