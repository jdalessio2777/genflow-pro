// @vitest-environment node
// B4: "First 30 minutes of diagnostic labor free" is a benefit of BOTH plans,
// shows on new agreements (screen + signed PDF), and never rewrites an agreement
// that was already signed (the PDF renders from the stored snapshot).
import { describe, it, expect } from 'vitest'
import { PLANS, TERMS, DIAGNOSTIC_BENEFIT } from '@/lib/agreementTerms'
import { buildAgreementPdf } from '../../api/_lib/pdf/agreementPdf.js'
import { pdfText } from './helpers/pdfText.js'

const LINE = 'First 30 minutes of diagnostic labor free on service calls during the agreement term.'
const base = {
  job_id: 'j1', customer_id: 'c1', start_date: '2026-10-20T14:00:00.000Z', expiry_date: '2027-10-20T14:00:00.000Z',
  signed_at: '2026-10-20T14:00:00.000Z', signature: null,
}
const snap = (key, includes) => ({
  customer: { name: 'ZZ Test' }, generator: {}, unit_type: 'Air-cooled, 26kW or less',
  plan: { key, name: PLANS[key].name, price: PLANS[key].price, billingLabel: PLANS[key].billingLabel, includes }, terms: TERMS,
})

describe('B4 free-diagnostic member benefit', () => {
  it('uses the exact wording', () => { expect(DIAGNOSTIC_BENEFIT).toBe(LINE) })
  it('is listed exactly once in both plans', () => {
    for (const k of ['annual', 'semi_annual']) expect(PLANS[k].includes.filter(i => /diagnostic/i.test(i))).toEqual([LINE])
  })
  it('does not change prices or discounts', () => {
    expect(PLANS.annual.price).toBe(325); expect(PLANS.semi_annual.price).toBe(575)
    expect(PLANS.annual.includes).toContain('10% off all parts, labor, and repair services')
    expect(PLANS.semi_annual.includes).toContain('15% off all parts, labor, and repair services')
  })
  for (const key of ['annual', 'semi_annual']) {
    it(`a newly signed ${key} agreement PDF contains the line`, async () => {
      const txt = pdfText(await buildAgreementPdf({ agreement: { ...base, plan: key, snapshot: snap(key, PLANS[key].includes) } }))
      expect(txt).toContain(LINE)
    })
  }
  it('an agreement signed before the change keeps its signed text (no new line)', async () => {
    const old = ['One (1) full annual maintenance service', '10% off all parts, labor, and repair services', 'Priority emergency service (24-hour response)']
    const txt = pdfText(await buildAgreementPdf({ agreement: { ...base, plan: 'annual', snapshot: snap('annual', old) } }))
    expect(txt).toContain('Priority emergency service')
    expect(txt).not.toMatch(/diagnostic labor free/)
  })
})
