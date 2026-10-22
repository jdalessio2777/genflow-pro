// @vitest-environment node
// A6 + B3 (docs/customer-copy-audit.md): every customer-facing email / print /
// PDF, rendered with a SPARSE fixture (nulls everywhere) never prints a "—"
// placeholder, "undefined", "null", "NaN", "$NaN" or "Invalid Date"; rendered
// with a FULL fixture it shows the job title + customer-facing description and
// never any internal note.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { PDFPage } from 'pdf-lib'
import {
  quoteEmailHTML, confirmationEmailHTML, completionEmailHTML, invoiceSummaryHTML,
  paymentReceiptHTML, jobSummaryEmailHTML, checklistSummaryHTML, membershipWelcomeEmailHTML,
  fmtJobType,
} from '@/lib/emailTemplates'
import { renewalEmailHTML } from '@/lib/emailTemplates/renewalEmail'
import { invoicePrintDocumentHtml, customerFacingInvoice } from '@/lib/invoicePrint'
import { serviceHistoryDocumentHtml } from '@/lib/serviceHistory'
import { buildJobSummaryEmail, buildSubject } from '../../api/_lib/jobSummary.js'
import { buildChecklistPdf } from '../../api/_lib/pdf/checklistPdf.js'
import { buildAgreementPdf } from '../../api/_lib/pdf/agreementPdf.js'

const SECRET = 'INTERNAL-SECRET'
const BAD = [/>\s*[—–-]\s*</, /undefined/, /\bnull\b/, /NaN/, /Invalid Date/]

function expectClean(html, label = '') {
  for (const re of BAD) {
    const m = html.match(re)
    expect(m, `${label} contains ${re}: …${m ? html.slice(Math.max(0, m.index - 80), m.index + 40) : ''}…`).toBeNull()
  }
}

// ── fixtures ────────────────────────────────────────────────────────────────
const sparseCustomer = { id: 'c0', name: null, email: 'x@example.com', phone: null, address: null, generator_model: null, generator_serial: null, generator_install_date: null }
const sparseJob = {
  id: null, title: null, customer_description: null, invoice_notes: null, job_type: null,
  scheduled_date: null, completed_date: null, created_date: null, estimated_minutes: null, customer_signature: null, status: 'completed',
}
const sparseLine = { type: 'labor', description: null, quantity: null, unit_price: null, total: null }
const sparseInvoice = {
  id: 'i0', invoice_number: null, created_date: null, customer_name: null, status: 'draft', paid_date: null,
  payment_method: null, payment_reference: null, parts_total: null, labor_total: 100, tax_amount: null,
  surcharge_amount: null, line_items: [sparseLine], notes: null, customer_signature: null,
}
const sparseZeroInvoice = { ...sparseInvoice, labor_total: null, line_items: [{ ...sparseLine, no_charge: true }] }

const fullCustomer = {
  id: 'c1', name: 'Big BOB', email: 'bob@example.com', phone: '973-555-0100', address: '1 Test Lane, Summit NJ',
  generator_model: 'Generac 22kW', generator_serial: 'SN-12345', generator_install_date: '2020-05-01',
  notes: SECRET, property_notes: SECRET, repeat_note: SECRET, access_notes: SECRET,
}
const fullJob = {
  id: 'job-1234-5678', title: 'ZZ Annual Maintenance & Load Test', customer_description: 'Full annual service <incl. load test>\nCheck transfer switch',
  invoice_notes: 'Changed oil and filter. Load test OK.', job_type: 'maintenance',
  scheduled_date: '2026-06-10T13:00:00.000Z', completed_date: '2026-06-10T15:00:00.000Z', created_date: '2026-06-01T12:00:00.000Z',
  notes: SECRET, generator_notes: SECRET, quote_notes: SECRET, internal_notes: SECRET, status: 'completed',
}
const fullInvoice = {
  id: 'i1', invoice_number: 'INV-1001', created_date: '2026-06-10T12:00:00.000Z', customer_name: 'Big BOB', status: 'draft',
  paid_date: null, parts_total: 18.5, labor_total: 100, tax_amount: 7.85, surcharge_amount: 0, total: 126.35,
  line_items: [
    { type: 'part', description: 'Oil Filter', quantity: 1, unit_price: 18.5, total: 18.5 },
    { type: 'labor', description: 'Annual labor', quantity: 1, unit_price: 100, total: 100 },
  ],
  notes: 'stale snapshot', customer_signature: null,
}
const parts = [{ name: 'Oil Filter', quantity: 1, price: 18.5, total_price: 18.5, charge_for_part: true }]
const labor = [{ description: 'Annual labor', is_flat_rate: true, flat_rate_amount: 100, total_price: 100 }]

const TITLE_ESC = 'ZZ Annual Maintenance &amp; Load Test'
const DESC_ESC = 'Full annual service &lt;incl. load test&gt;<br>Check transfer switch'

function expectJobShown(html, label) {
  expect(html, label).toContain(TITLE_ESC)
  expect(html, label).toContain(DESC_ESC)
  expect(html, label).not.toContain(SECRET)
}

// ── A6: sparse data never prints placeholders ───────────────────────────────
describe('A6 — sparse data: no "—", undefined, null, NaN in customer copy', () => {
  const renders = {
    quote: () => quoteEmailHTML({ customer: sparseCustomer, job: sparseJob, lineItems: [{ description: null, qty: '—', amount: null }] }),
    'quote (no customer/job objects)': () => quoteEmailHTML({ customer: null, job: null }),
    confirmation: () => confirmationEmailHTML({ customer: sparseCustomer, job: sparseJob, techFirstName: null }),
    completion: () => completionEmailHTML({ customer: sparseCustomer, job: sparseJob, parts: [{ name: null, quantity: null, total_price: 5 }], labor: [{ description: null, total_price: null }] }),
    'invoice >$0': () => invoiceSummaryHTML({ invoice: sparseInvoice, customer: null, job: sparseJob }),
    'invoice >$0 paid, unreadable date': () => invoiceSummaryHTML({ invoice: { ...sparseInvoice, status: 'paid', paid_date: 'not a date' }, customer: sparseCustomer }),
    'invoice $0': () => invoiceSummaryHTML({ invoice: sparseZeroInvoice, customer: sparseCustomer, job: sparseJob }),
    'invoice $0 empty': () => invoiceSummaryHTML({ invoice: { ...sparseZeroInvoice, line_items: null }, customer: null }),
    receipt: () => paymentReceiptHTML({ invoice: { ...sparseInvoice, status: 'paid' }, customer: sparseCustomer, job: sparseJob }),
    'receipt partial': () => paymentReceiptHTML({ invoice: { ...sparseInvoice, status: 'partial', amount_paid: 'x' }, customer: null }),
    'job summary completion': () => jobSummaryEmailHTML({ invoice: sparseInvoice, customer: sparseCustomer, job: sparseJob }),
    'job summary no invoice': () => jobSummaryEmailHTML({ invoice: null, customer: null, job: sparseJob }),
    'job summary receipt': () => jobSummaryEmailHTML({ invoice: { ...sparseInvoice, status: 'paid', paid_date: '2026-06-10T12:00:00Z' }, customer: sparseCustomer, job: sparseJob, kind: 'receipt' }),
    'invoice print': () => invoicePrintDocumentHtml({ invoice: sparseInvoice, customer: null, job: sparseJob }),
    checklist: () => checklistSummaryHTML({
      template_name: null,
      field_definitions: [
        { id: 'h', type: 'section_header', label: null },
        { id: 'a', type: 'text', label: 'Oil level' }, { id: 'b', type: 'number', label: 'Volts' },
        { id: 'c', type: 'dropdown', label: 'Pick' }, { id: 'd', type: 'photo', label: 'Photo' },
        { id: 'h2', type: 'section_header', label: 'Empty section' }, { id: 'e', type: 'text', label: 'Blank' },
      ],
      field_values: { a: null, b: 'NaN', c: ['', null], d: '', e: '  ' },
    }),
    'checklist (no fields)': () => checklistSummaryHTML({}),
    'service history': () => serviceHistoryDocumentHtml({ customer: sparseCustomer, completedJobs: [sparseJob, { ...sparseJob, completed_date: 'garbage' }] }),
    'service history (no jobs)': () => serviceHistoryDocumentHtml({ customer: sparseCustomer, completedJobs: [] }),
    'membership welcome': () => membershipWelcomeEmailHTML({ customer: sparseCustomer, planName: null, includes: [null, ''], start: null, expiry: 'bad' }),
    renewal: () => renewalEmailHTML({ customerName: null, plan: null, expiryDate: null }),
  }
  for (const [name, render] of Object.entries(renders)) {
    it(name, () => expectClean(render(), name))
  }

  it('the sparse checklist hides empty answers and empty section bars', () => {
    const html = renders.checklist()
    expect(html).toContain('Service Checklist')
    for (const label of ['Oil level', 'Volts', 'Pick', 'Photo', 'Empty section', 'Blank']) expect(html).not.toContain(label)
  })

  it('hidden rows: no invoice number / date / name / payment method lines when missing', () => {
    const inv = invoiceSummaryHTML({ invoice: sparseInvoice, customer: null })
    expect(inv).not.toContain('GENERATOR')
    expect(inv).toContain('PAYMENT')
    const r = paymentReceiptHTML({ invoice: { ...sparseInvoice, status: 'paid' }, customer: null })
    expect(r).not.toContain('Payment method')
    expect(r).not.toContain('Invoice </p>')
    expect(r).toContain('Hi there,')
  })

  it('a missing price is blank, never an invented $0.00', () => {
    const html = invoiceSummaryHTML({ invoice: sparseInvoice, customer: fullCustomer })
    const row = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'))
    expect(row).not.toContain('$0.00')
    // a legacy line with only total + quantity derives its rate
    const derived = invoiceSummaryHTML({ invoice: { ...sparseInvoice, line_items: [{ description: 'Flat', quantity: 2, unit_price: null, total: 50 }] }, customer: fullCustomer })
    expect(derived).toContain('$25.00')
  })

  it('subjects never end in an empty invoice number', () => {
    expect(buildSubject({ kind: 'receipt', invoice: { ...sparseInvoice } })).toBe('Receipt — GenShield')
    expect(buildSubject({ kind: 'completion', invoice: sparseInvoice, checklistCount: 0 })).toBe('Invoice — GenShield')
  })
})

// ── Service Type rule (A5 coordination) ─────────────────────────────────────
describe('Service Type row: only for a real service type', () => {
  for (const jobType of [null, undefined, '', 'quote', 'bogus_type']) {
    it(`hidden for ${JSON.stringify(jobType)}`, () => {
      expect(fmtJobType(jobType)).toBe('')
      const q = quoteEmailHTML({ customer: fullCustomer, job: { id: 'q1', job_type: jobType } })
      const c = confirmationEmailHTML({ customer: fullCustomer, job: { ...fullJob, job_type: jobType } })
      expect(q).not.toContain('Service Type')
      expect(c).not.toContain('Service Type')
      expect(c).toContain('Generac 22kW') // generator still shown, on its own row
      expectClean(q); expectClean(c)
    })
  }
  it('shown for a real type', () => {
    const q = quoteEmailHTML({ customer: fullCustomer, job: { id: 'q1', job_type: 'diagnostic_repair' } })
    expect(q).toContain('Service Type')
    expect(q).toContain('Diagnostic Repair')
    expect(confirmationEmailHTML({ customer: fullCustomer, job: fullJob })).toContain('Maintenance')
  })
  it('the Quote Builder\'s "—" quantity for labor lines prints blank', () => {
    const q = quoteEmailHTML({ customer: fullCustomer, job: { id: 'q1' }, lineItems: [{ description: 'Labor', qty: '—', amount: 95 }] })
    expectClean(q)
    expect(q).toContain('$95.00')
  })
  it('confirmation without a date shows the time-on-site estimate only', () => {
    const c = confirmationEmailHTML({ customer: fullCustomer, job: { ...fullJob, scheduled_date: null } })
    expect(c).not.toContain('Arrival time')
    expect(c).toContain('Estimated time on site')
  })
})

// ── B3: job title + description, never internal notes ──────────────────────
describe('B3 — customer copy shows the job (title + description), never internal notes', () => {
  it('invoice summary (>$0 and $0)', () => {
    expectJobShown(invoiceSummaryHTML({ invoice: fullInvoice, customer: fullCustomer, job: fullJob }), 'invoice')
    expectJobShown(invoiceSummaryHTML({ invoice: { ...fullInvoice, parts_total: 0, labor_total: 0, tax_amount: 0 }, customer: fullCustomer, job: fullJob }), '$0 invoice')
  })
  it('standalone invoice (no job): no Job / Description rows', () => {
    const html = invoiceSummaryHTML({ invoice: fullInvoice, customer: fullCustomer, job: null })
    expect(html).not.toContain('DESCRIPTION OF WORK')
    expect(html).not.toContain('>JOB<')
  })
  it('only a title, or only a description: the other row is hidden', () => {
    const t = invoiceSummaryHTML({ invoice: fullInvoice, customer: fullCustomer, job: { title: 'Only title' } })
    expect(t).toContain('Only title'); expect(t).not.toContain('DESCRIPTION OF WORK')
    const d = invoiceSummaryHTML({ invoice: fullInvoice, customer: fullCustomer, job: { customer_description: 'Only desc' } })
    expect(d).toContain('Only desc'); expect(d).not.toContain('>JOB<')
  })
  it('invoice print view + customer-facing invoice', () => {
    const html = invoicePrintDocumentHtml({ invoice: customerFacingInvoice({ invoice: fullInvoice, job: fullJob }), customer: fullCustomer, job: fullJob })
    expectJobShown(html, 'print')
    expect(html).toContain('Changed oil and filter. Load test OK.')
    expect(html).not.toContain('stale snapshot')
  })
  it('payment receipt', () => {
    expectJobShown(paymentReceiptHTML({ invoice: { ...fullInvoice, status: 'paid', paid_date: '2026-06-11T12:00:00Z', payment_method: 'cash' }, customer: fullCustomer, job: fullJob }), 'receipt')
  })
  it('completion email (legacy template)', () => {
    expectJobShown(completionEmailHTML({ customer: fullCustomer, job: fullJob, parts, labor }), 'completion')
  })
  it('combined completion + receipt email built server-side (api/_lib/jobSummary.js)', async () => {
    const completion = await buildJobSummaryEmail({ kind: 'completion', job: fullJob, customer: fullCustomer, invoice: fullInvoice, parts, labor })
    expectJobShown(completion.html, 'job summary completion')
    expectClean(completion.html, 'job summary completion')
    const receipt = await buildJobSummaryEmail({ kind: 'receipt', job: fullJob, customer: fullCustomer, invoice: { ...fullInvoice, status: 'paid', paid_date: '2026-06-11T12:00:00Z', payment_method: 'cash' }, parts, labor })
    expectJobShown(receipt.html, 'job summary receipt')
    const noInvoice = await buildJobSummaryEmail({ kind: 'completion', job: fullJob, customer: fullCustomer, invoice: null })
    expectJobShown(noInvoice.html, 'job summary, no invoice')
  })
  it('service history', () => {
    const html = serviceHistoryDocumentHtml({ customer: fullCustomer, completedJobs: [fullJob] })
    expectJobShown(html, 'service history')
    expect(html).toContain('DESCRIPTION OF WORK')
    expectClean(html, 'service history')
  })
  it('confirmation + quote never show internal notes', () => {
    const c = confirmationEmailHTML({ customer: fullCustomer, job: fullJob, techFirstName: 'Alex' })
    expect(c).toContain(DESC_ESC)
    expect(c).not.toContain(SECRET)
    expect(quoteEmailHTML({ customer: fullCustomer, job: fullJob })).not.toContain(SECRET)
  })
})

// ── PDFs (pdf-lib, node) — capture every string drawn on the page ───────────
describe('PDF attachments: no placeholders; job shown; no internal notes', () => {
  let spy
  const drawn = () => spy.mock.calls.map(c => String(c[0]))
  afterEach(() => spy?.mockRestore())
  const startCapture = () => { spy = vi.spyOn(PDFPage.prototype, 'drawText') }
  const expectPdfClean = (texts) => {
    for (const t of texts) {
      expect(t.trim(), `PDF text "${t}"`).not.toBe('-')
      expect(t, `PDF text "${t}"`).not.toMatch(/(^|\s)-\s*$|undefined|\bnull\b|NaN|Invalid Date/)
    }
  }

  it('checklist PDF, sparse', async () => {
    startCapture()
    await buildChecklistPdf({ doc: { template_name: null, field_definitions: [{ id: 'h', type: 'section_header', label: '' }, { id: 'a', type: 'text', label: 'A' }], field_values: { a: 'null' } }, customer: sparseCustomer, job: sparseJob })
    const t = drawn()
    expectPdfClean(t)
    expect(t).not.toContain('COMPLETED')
    expect(t).not.toContain('A')
  })
  it('checklist PDF, full: job title + description, no internal notes', async () => {
    startCapture()
    await buildChecklistPdf({ doc: { template_name: 'Annual Checklist', completed_date: '2026-06-10T15:00:00Z', field_definitions: [{ id: 'a', type: 'checkbox', label: 'Oil' }], field_values: { a: true } }, customer: fullCustomer, job: fullJob })
    const all = drawn().join('\n')
    expect(all).toContain('ZZ Annual Maintenance & Load Test')
    expect(all).toContain('Full annual service <incl. load test>')
    expect(all).toContain('DESCRIPTION OF WORK')
    expect(all).not.toContain(SECRET)
    expectPdfClean(drawn())
  })
  it('agreement PDF, sparse snapshot', async () => {
    startCapture()
    await buildAgreementPdf({ agreement: { plan: null, snapshot: { customer: {}, generator: {} } } })
    const t = drawn()
    expectPdfClean(t)
    for (const label of ['ADDRESS', 'GENERATOR', 'SERIAL NO.', 'START DATE', 'EXPIRES']) expect(t).not.toContain(label)
    expect(t.join('\n')).toContain('Signed electronically')
  })
})
