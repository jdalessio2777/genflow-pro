// @vitest-environment node
// Run 7 (owner decision 9): NJ sales tax is due on Service Agreement lines, all
// 4 agreement catalog items. Jobs/invoices, quotes and the server summary all
// total through computeJobFinancials, so they must agree to the cent.
import { describe, it, expect } from 'vitest'
import { computeJobFinancials, TAX_RATE } from '@/lib/utils/jobFinancials'
import { computeQuoteTotals } from '@/lib/utils/quoteTotals'
import { buildLaborLine } from '@/lib/utils/laborPricing'

const AGREEMENTS = [
  { name: 'Service Agreement (Air-Cooled) — Annual', category: 'service_agreements', type: 'flat_rate', flat_price: 325 },
  { name: 'Service Agreement (Air-Cooled) — Semi-Annual', category: 'service_agreements', type: 'flat_rate', flat_price: 575 },
  { name: 'Service Agreement (Liquid-Cooled) — Annual', category: 'service_agreements', type: 'flat_rate', flat_price: 340 },
  { name: 'Service Agreement (Liquid-Cooled) — Semi-Annual', category: 'service_agreements', type: 'flat_rate', flat_price: 595 },
]
const TUNE_UP = { name: 'One-Time Tune-Up (Air-Cooled)', category: 'maintenance', type: 'flat_rate', flat_price: 295 }

function totals(rates, memberDiscountRate = 1.0) {
  const labor = rates.map(rate => buildLaborLine({ rate, jobId: 'j', memberDiscountRate }))
  const job = computeJobFinancials([], labor)
  const quote = computeQuoteTotals(labor.map(l => ({ type: 'labor', total_price: l.total_price })))
  expect(quote).toEqual({ subtotal: job.subtotal, taxAmount: job.taxAmount, total: job.total })
  return job
}

describe('NJ sales tax on Service Agreement lines', () => {
  it('every agreement catalog item is taxed at 6.625% and never member-discounted', () => {
    for (const a of AGREEMENTS) for (const m of [1.0, 0.9, 0.85]) {
      const f = totals([a], m)
      expect(f.subtotal).toBe(a.flat_price)
      expect(f.taxAmount).toBe(Math.round(a.flat_price * TAX_RATE * 100) / 100)
    }
  })
  it('$325 alone: 325.00 + 21.53 tax = 346.53', () => {
    expect(totals([AGREEMENTS[0]])).toMatchObject({ subtotal: 325, taxAmount: 21.53, total: 346.53 })
  })
  it('$575 alone: 575.00 + 38.09 tax = 613.09', () => {
    expect(totals([AGREEMENTS[1]])).toMatchObject({ subtotal: 575, taxAmount: 38.09, total: 613.09 })
  })
  it('$325 + $295 tune-up: 620.00 + 41.08 = 661.08 (member tune-up 265.50: 590.50 + 39.12 = 629.62)', () => {
    expect(totals([AGREEMENTS[0], TUNE_UP])).toMatchObject({ subtotal: 620, taxAmount: 41.08, total: 661.08 })
    expect(totals([AGREEMENTS[0], TUNE_UP], 0.9)).toMatchObject({ subtotal: 590.5, taxAmount: 39.12, total: 629.62 })
  })
  it('$575 + $295 tune-up: 870.00 + 57.64 = 927.64 (member tune-up 250.75: 825.75 + 54.71 = 880.46)', () => {
    expect(totals([AGREEMENTS[1], TUNE_UP])).toMatchObject({ subtotal: 870, taxAmount: 57.64, total: 927.64 })
    expect(totals([AGREEMENTS[1], TUNE_UP], 0.85)).toMatchObject({ subtotal: 825.75, taxAmount: 54.71, total: 880.46 })
  })
})
