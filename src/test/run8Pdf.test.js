import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { buildChecklistPdf } from '../../api/_lib/pdf/checklistPdf.js'

// Run 8: a quote's 60-line Scope of Work becomes the job's description. The
// checklist PDF's info box is drawn in one piece, so it must stay page-sized.
describe('checklist PDF with a very long job description', () => {
  it('stays on one page for a 12-item checklist (description cut with …)', async () => {
    const long = Array.from({ length: 60 }, (_, i) => `line ${i + 1}: inspect transfer switch, torque lugs, check battery, test run under load.`).join('\n')
    const fields = [{ id: 's', type: 'section_header', label: 'Checklist' },
      ...Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, type: 'checkbox', label: `Item ${i + 1}` }))]
    const doc = { template_name: 'Annual Maintenance Checklist', status: 'completed', completed_date: '2026-10-21T12:00:00Z',
      field_definitions: fields, field_values: Object.fromEntries(fields.slice(1).map(f => [f.id, true])) }
    const bytes = await buildChecklistPdf({ doc, customer: { name: 'QA Pat' }, job: { title: 'Annual visit', customer_description: long } })
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBe(1)
  })
})
