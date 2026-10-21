import { describe, it, expect } from 'vitest'
import { planMemberRepricing, canRepriceJob } from '@/lib/memberRepricing'
import { computeJobFinancials } from '@/lib/utils/jobFinancials'

// Catalog rows with the real production prices (read-only SQL, Run 8).
const catalogParts = [
  { id: 'bat26', name: 'Generac Battery Small 26R 0H3421S', default_price: 175 },
  { id: 'napa', name: 'Generac Battery NAPA 51-R NAPA 7551R', default_price: 235 },
]
const rates = [
  { id: 'sh', name: 'Standard Hour', type: 'hourly', rate: 115, category: 'labor' },
  { id: 'shh', name: 'Standard ½ Hour', type: 'hourly', rate: 60, category: 'labor' },
  { id: 'fh', name: 'First ½ Hour — Service Call', type: 'hourly', rate: 125, category: 'labor' },
  { id: 'tu', name: 'One-Time Tune-Up (Air-Cooled)', type: 'flat_rate', flat_price: 295, category: 'maintenance' },
  { id: 'sa', name: 'Service Agreement (Air-Cooled) — Annual', type: 'flat_rate', flat_price: 325, category: 'service_agreements' },
  { id: 'ld', name: 'Loyalty Discount', type: 'flat_rate', flat_price: 0, category: 'discounts' },
]
const apply = (parts, labor, plan) => ({
  parts: parts.map(p => ({ ...p, ...(plan.updates.find(u => u.kind === 'part' && u.id === p.id)?.patch || {}) })),
  labor: labor.map(l => ({ ...l, ...(plan.updates.find(u => u.kind === 'labor' && u.id === l.id)?.patch || {}) })),
})

describe('B5 member pricing on existing lines — 3 hand-checked cases', () => {
  it('Case 1, Guardian 10%: battery added before signing + 1.5 h Standard Hour + the agreement itself', () => {
    const parts = [{ id: 'p1', name: 'Generac Battery Small 26R 0H3421S', part_id: 'bat26', quantity: 1, price: 175, total_price: 175, charge_for_part: true }]
    const labor = [
      { id: 'l1', description: 'Standard Hour', is_flat_rate: false, rate: 115, hours: 1.5, total_price: 172.5 },
      { id: 'l2', description: 'Service Agreement (Air-Cooled) — Annual', is_flat_rate: true, flat_rate_amount: 325, total_price: 325, requires_agreement: 'air_annual' },
    ]
    const plan = planMemberRepricing({ parts, labor, catalogParts, rates, memberDiscountRate: 0.9 })
    // Hand check: 175 × 0.90 = 157.50; 115 × 0.90 = 103.50/h × 1.5 h = 155.25; agreement stays 325.
    expect(plan.updates.map(u => [u.name, u.before, u.after])).toEqual([
      ['Standard Hour', 172.5, 155.25],
      ['Generac Battery Small 26R 0H3421S', 175, 157.5],
    ])
    expect(plan.updates[0].patch).toEqual({ rate: 103.5, total_price: 155.25, description: 'Standard Hour (Member 10% off)' })
    expect(plan.skipped.find(s => s.id === 'l2').reason).toBe('Service Agreement')
    expect(plan.savings).toBe(34.75)
    const after = apply(parts, labor, plan)
    const fin = computeJobFinancials(after.parts, after.labor)
    // 157.50 + 155.25 + 325 = 637.75; tax 6.625% = 42.25 (42.2509); total 680.00
    expect(fin.subtotal).toBe(637.75)
    expect(fin.taxAmount).toBe(42.25)
    expect(fin.total).toBe(680)
  })

  it('Case 2, Sentinel 15%: NAPA battery + tune-up flat rate + First ½ Hour', () => {
    const parts = [{ id: 'p1', name: 'Generac Battery NAPA 51-R NAPA 7551R', part_id: 'napa', quantity: 1, price: 235, total_price: 235, charge_for_part: true }]
    const labor = [
      { id: 'l1', description: 'One-Time Tune-Up (Air-Cooled)', is_flat_rate: true, flat_rate_amount: 295, total_price: 295 },
      { id: 'l2', description: 'First ½ Hour — Service Call', is_flat_rate: false, rate: 125, hours: 1, total_price: 125 },
    ]
    const plan = planMemberRepricing({ parts, labor, catalogParts, rates, memberDiscountRate: 0.85 })
    // Hand check: 235 × 0.85 = 199.75; 295 × 0.85 = 250.75; 125 × 0.85 = 106.25. Savings 655 × 0.15 = 98.25.
    expect(plan.updates.map(u => u.after)).toEqual([250.75, 106.25, 199.75])
    expect(plan.updates[0].patch.description).toBe('One-Time Tune-Up (Air-Cooled) (Member 15% off)')
    expect(plan.savings).toBe(98.25)
    const fin = computeJobFinancials(apply(parts, labor, plan).parts, apply(parts, labor, plan).labor)
    // 556.75 + 36.88 (556.75 × 0.06625 = 36.8847) = 593.63
    expect(fin.subtotal).toBe(556.75)
    expect(fin.taxAmount).toBe(36.88)
    expect(fin.total).toBeCloseTo(593.63, 2)
  })

  it('Case 3, Guardian: no double discount — mixed lines, then a second Apply changes nothing', () => {
    const parts = [
      { id: 'p1', name: 'Generac Battery Small 26R 0H3421S', part_id: 'bat26', quantity: 1, price: 157.5, total_price: 157.5 }, // added as a member
      { id: 'p2', name: 'Shop part', part_id: null, quantity: 1, price: 50, total_price: 50 }, // not a catalog part
      { id: 'p3', name: 'Generac Battery Small 26R 0H3421S', part_id: 'bat26', quantity: 2, price: 175, total_price: 350 },
      { id: 'p4', name: 'Generac Battery NAPA 51-R NAPA 7551R', part_id: 'napa', quantity: 1, price: 235, total_price: 0, charge_for_part: false },
    ]
    const labor = [
      { id: 'l1', description: 'Standard Hour', is_flat_rate: false, rate: 100, hours: 1, total_price: 100 }, // hand-edited
      { id: 'l2', description: 'Standard ½ Hour', is_flat_rate: false, rate: 60, hours: 1, total_price: 60 },
      { id: 'l3', description: 'Standard Hour (1h)', is_flat_rate: true, flat_rate_amount: 115, total_price: 115 }, // from a quote
      { id: 'l4', description: 'Loyalty Discount', is_flat_rate: true, flat_rate_amount: -20, total_price: -20 },
      { id: 'l5', description: 'Standard Hour (Member 10% off)', is_flat_rate: false, rate: 103.5, hours: 1, total_price: 103.5 },
    ]
    const plan = planMemberRepricing({ parts, labor, catalogParts, rates, memberDiscountRate: 0.9 })
    // Hand check: ½ hour 60 → 54.00; quote hour 115 → 103.50; 2 × battery 175 → 2 × 157.50 = 315.00. Savings 6 + 11.50 + 35 = 52.50.
    expect(plan.updates.map(u => [u.id, u.after])).toEqual([['l2', 54], ['l3', 103.5], ['p3', 315]])
    expect(plan.savings).toBe(52.5)
    const reasons = Object.fromEntries(plan.skipped.map(s => [s.id, s.reason]))
    expect(reasons).toEqual({
      l1: 'Price was changed by hand', l4: 'Discount line', l5: 'Already member-priced',
      p1: 'Already member-priced', p2: 'Not a catalog item', p4: 'No charge',
    })
    const after = apply(parts, labor, plan)
    const again = planMemberRepricing({ ...after, catalogParts, rates, memberDiscountRate: 0.9 })
    expect(again.updates).toEqual([])
  })

  it('does nothing for a non-member, and only while the job is open', () => {
    const parts = [{ id: 'p1', name: 'x', part_id: 'bat26', quantity: 1, price: 175, total_price: 175 }]
    expect(planMemberRepricing({ parts, labor: [], catalogParts, rates, memberDiscountRate: 1 }).updates).toEqual([])
    expect(canRepriceJob({ status: 'on_site' })).toBe(true)
    expect(canRepriceJob({ status: 'scheduled' })).toBe(true)
    expect(canRepriceJob({ status: 'completed' })).toBe(false)
    expect(canRepriceJob({ status: 'invoiced' })).toBe(false)
    expect(canRepriceJob({ status: 'canceled' })).toBe(false)
  })
})
