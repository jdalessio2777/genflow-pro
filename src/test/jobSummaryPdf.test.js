// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildChecklistPdf, checklistFilename } from '../../api/_lib/pdf/checklistPdf.js'
import { buildAgreementPdf, agreementFilename } from '../../api/_lib/pdf/agreementPdf.js'
import { sanitizeFor } from '../../api/_lib/pdf/common.js'
import { buildJobSummaryEmail, invoiceForEmail, buildSubject, MAX_EMAIL_BYTES } from '../../api/_lib/jobSummary.js'
import { PLANS, TERMS } from '@/lib/agreementTerms'

const PNG_1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const customer = { id: 'c1', name: 'Big BOB', email: 'bob@example.com', address: '1 Test Lane, Summit NJ', generator_model: 'Generac 22kW', generator_serial: 'SN-12345' }
const job = { id: 'j1', title: 'ZZTEST Annual Maintenance', completed_date: '2026-06-10T15:00:00.000Z', invoice_notes: 'All good' }

function makeChecklist(n = 44, extra = {}) {
  const defs = []
  const vals = {}
  for (let i = 0; i < n; i++) {
    if (i % 10 === 0) { defs.push({ id: `h${i}`, type: 'section_header', label: `Section ${i / 10 + 1} · Engine ✓` }); continue }
    const type = ['checkbox', 'text', 'number', 'date', 'dropdown', 'textarea', 'photo'][i % 7]
    defs.push({ id: `f${i}`, type, label: `Item ${i} — check ○ “quoted” 🔧` })
    vals[`f${i}`] = type === 'checkbox' ? i % 3 !== 0 : type === 'date' ? '2026-06-10' : type === 'photo' ? 'https://x/y.jpg' : type === 'textarea' ? 'Line one\nLine two with a very long word Supercalifragilisticexpialidocious-and-more-and-more-and-more-and-more-and-more-text' : `Value ${i} ✓`
  }
  return { id: 'd1', template_name: 'Annual Maintenance Checklist', status: 'completed', completed_date: '2026-06-10T14:00:00.000Z', field_definitions: defs, field_values: vals, ...extra }
}

const agreement = {
  job_id: 'j1', customer_id: 'c1', plan: 'semi_annual', plan_name: PLANS.semi_annual.name, price: 575,
  start_date: '2026-06-10T14:30:00.000Z', expiry_date: '2027-06-10T14:30:00.000Z', signed_at: '2026-06-10T14:30:00.000Z',
  signature: PNG_1x1,
  snapshot: {
    customer: { name: 'Big BOB', address: '1 Test Lane, Summit NJ' },
    generator: { model: 'Generac 22kW', serial: 'SN-12345' },
    unit_type: 'Air-cooled, 26kW or less',
    plan: { key: 'semi_annual', ...PLANS.semi_annual },
    terms: TERMS,
  },
}

async function parse(bytes) {
  const doc = await PDFDocument.load(bytes)
  return doc
}

describe('sanitizeFor (WinAnsi-only standard fonts)', () => {
  it('replaces or drops glyphs Helvetica cannot encode', () => {
    const set = new Set([...'abc -Yes'].map(c => c.codePointAt(0)))
    expect(sanitizeFor(set, 'a✓b○c')).toBe('aYesb-c')
    expect(sanitizeFor(set, 'a🔧b')).toBe('ab')
  })
})

describe('buildChecklistPdf', () => {
  it('produces a valid PDF that parses back, multi-page for a 44-field checklist', async () => {
    const bytes = await buildChecklistPdf({ doc: makeChecklist(44), customer, job })
    const doc = await parse(bytes)
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2)
    expect(doc.getTitle()).toBe('Annual Maintenance Checklist')
    expect(bytes.length).toBeLessThan(200 * 1024)
  })
  it('a short checklist is exactly one page', async () => {
    const bytes = await buildChecklistPdf({ doc: makeChecklist(6), customer, job })
    expect((await parse(bytes)).getPageCount()).toBe(1)
  })
  it('does not throw on ✓ ○ · emoji or odd values, and handles empty definitions', async () => {
    const bytes = await buildChecklistPdf({ doc: { template_name: '✓ Weird ○ · 🔧', field_definitions: [], field_values: {} }, customer: {}, job: {} })
    expect((await parse(bytes)).getPageCount()).toBe(1)
  })
  it('is deterministic (byte-identical for the same input — required for Resend idempotent retries)', async () => {
    const a = await buildChecklistPdf({ doc: makeChecklist(30), customer, job })
    const b = await buildChecklistPdf({ doc: makeChecklist(30), customer, job })
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
  })
  it('filename is safe', () => {
    expect(checklistFilename({ template_name: 'Annual / Maint ✓ "Checklist"' })).toBe('Annual-Maint-Checklist.pdf')
  })
})

describe('buildAgreementPdf', () => {
  it('produces a valid multi-page PDF with the embedded signature image', async () => {
    const bytes = await buildAgreementPdf({ agreement })
    const doc = await parse(bytes)
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2)
    expect(Buffer.from(bytes).toString('latin1')).toContain('/Subtype /Image')
  })
  it('falls back gracefully with no/invalid signature and no snapshot', async () => {
    const bytes = await buildAgreementPdf({ agreement: { plan: 'annual', start_date: '2026-06-10T12:00:00Z', expiry_date: '2027-06-10T12:00:00Z', signature: 'garbage' } })
    expect((await parse(bytes)).getPageCount()).toBeGreaterThanOrEqual(1)
  })
  it('filename', () => {
    expect(agreementFilename(agreement)).toBe('GenShield-Maintenance-Agreement-Big-BOB.pdf')
  })
})

describe('buildJobSummaryEmail', () => {
  const paidInvoice = {
    id: 'i1', invoice_number: 'INV-1', created_date: '2026-06-10T12:00:00.000Z', status: 'paid', paid_date: '2026-06-10T12:00:00.000Z', payment_method: 'cash',
    parts_total: 18.5, labor_total: 100, tax_amount: 7.85, surcharge_amount: 0, total: 126.35,
    line_items: [{ type: 'part', description: 'Oil Filter', quantity: 1, unit_price: 18.5, total: 18.5 }, { type: 'labor', description: 'Labor', quantity: 1, unit_price: 100, total: 100 }],
  }
  const parts = [{ name: 'Oil Filter', quantity: 1, price: 18.5, total_price: 18.5, charge_for_part: true }]
  const labor = [{ description: 'Labor', is_flat_rate: true, flat_rate_amount: 100, total_price: 100 }]

  it('completion: one PDF per completed checklist + agreement, invoice inline, size logged', async () => {
    const docs = [makeChecklist(20), makeChecklist(12, { id: 'd2', template_name: 'Load Test' }), { ...makeChecklist(5), id: 'd3', status: 'pending' }]
    const email = await buildJobSummaryEmail({ kind: 'completion', job, customer, invoice: paidInvoice, parts, labor, documents: docs, agreement })
    expect(email.attachments.map(a => a.filename)).toEqual(['Annual-Maintenance-Checklist.pdf', 'Load-Test.pdf', 'GenShield-Maintenance-Agreement-Big-BOB.pdf'])
    for (const a of email.attachments) {
      const doc = await PDFDocument.load(Buffer.from(a.content, 'base64'))
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(1)
    }
    expect(email.html).toContain('Attached (PDF): Annual Maintenance Checklist, Load Test, Signed Maintenance Agreement.')
    expect(email.html).toContain('INV-1')
    expect(email.html).toContain('PAID')
    expect(email.subject).toBe('Invoice INV-1 & Service Report — GenShield')
    expect(email.totalBytes).toBeLessThan(1024 * 1024)
    expect(email.totalBytes).toBeLessThan(MAX_EMAIL_BYTES)
  })

  it('duplicate checklist names get unique filenames', async () => {
    const email = await buildJobSummaryEmail({ kind: 'completion', job, customer, invoice: paidInvoice, parts, labor, documents: [makeChecklist(5), makeChecklist(5, { id: 'd2' })] })
    expect(email.attachments.map(a => a.filename)).toEqual(['Annual-Maintenance-Checklist.pdf', 'Annual-Maintenance-Checklist-2.pdf'])
  })

  it('no agreement and no checklists -> no attachments, no attachment line', async () => {
    const email = await buildJobSummaryEmail({ kind: 'completion', job, customer, invoice: paidInvoice, parts, labor, documents: [] })
    expect(email.attachments).toEqual([])
    expect(email.html).not.toContain('Attached (PDF)')
    expect(email.subject).toBe('Invoice INV-1 — GenShield')
  })

  it('receipt: invoice only, never attachments', async () => {
    const email = await buildJobSummaryEmail({ kind: 'receipt', job, customer, invoice: paidInvoice, parts, labor, documents: [makeChecklist(5)], agreement })
    expect(email.attachments).toEqual([])
    expect(email.subject).toBe('Receipt — Invoice INV-1 — GenShield')
    expect(email.html).toContain('We received your payment')
  })

  it('$0 invoice with empty stored line_items is rebuilt from job rows, incl. "No charge" parts, no payment language', async () => {
    const zeroInv = { id: 'i0', invoice_number: 'INV-0', created_date: '2026-06-10T12:00:00.000Z', status: 'paid', payment_method: 'no_charge', paid_date: '2026-06-10T12:00:00.000Z', parts_total: 0, labor_total: 0, tax_amount: 0, total: 0, line_items: [], notes: '' }
    const zParts = [{ name: 'Warranty Board', quantity: 1, price: 0, total_price: 0, charge_for_part: false }]
    const zLabor = [{ description: 'Warranty labor', is_flat_rate: true, flat_rate_amount: 0, total_price: 0 }]
    const email = await buildJobSummaryEmail({ kind: 'completion', job, customer, invoice: zeroInv, parts: zParts, labor: zLabor, documents: [] })
    expect(email.html).toContain('Warranty Board')
    expect(email.html).toContain('No charge')
    expect(email.html).toContain('Warranty labor')
    expect(email.html).not.toMatch(/PAYMENT DUE|\bPAID\b|THANK YOU!/)
    expect(email.subject).toBe('Service Summary INV-0 — GenShield')
  })

  it('unpaid invoice whose stored totals lag the job rows is refreshed for the email', () => {
    const stale = { ...paidInvoice, status: 'draft', paid_date: null, parts_total: 0, labor_total: 0, tax_amount: 0, line_items: [] }
    const inv = invoiceForEmail({ invoice: stale, parts, labor })
    expect(inv.parts_total).toBe(18.5)
    expect(inv.labor_total).toBe(100)
    expect(inv.line_items).toHaveLength(2)
  })

  it('paid invoices are shown exactly as stored', () => {
    expect(invoiceForEmail({ invoice: paidInvoice, parts: [], labor: [] })).toBe(paidInvoice)
  })

  it('unpaid >$0 invoice in sync with the job is passed through untouched', () => {
    const unpaid = { ...paidInvoice, status: 'draft', paid_date: null }
    expect(invoiceForEmail({ invoice: unpaid, parts, labor })).toBe(unpaid)
  })

  it('buildSubject falls back when there is no invoice', () => {
    expect(buildSubject({ kind: 'completion', invoice: null, checklistCount: 0 })).toBe('Service Summary — GenShield')
  })
})
