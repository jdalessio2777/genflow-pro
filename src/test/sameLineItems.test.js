import { describe, it, expect } from 'vitest'
import { sameLineItems, buildInvoiceLineItems } from '../lib/utils/invoiceTotals.js'

// B4: opening a job must not rewrite its invoice when nothing changed.
describe('sameLineItems', () => {
  const fresh = buildInvoiceLineItems(
    [{ name: 'Battery', quantity: 1, price: 175, total_price: 175 }],
    [{ description: 'Standard Hour', is_flat_rate: false, hours: 1.5, rate: 165, total_price: 247.5 }],
  )
  it('equal when jsonb reordered the keys and rows came back in another order', () => {
    const stored = JSON.parse(JSON.stringify(fresh)).reverse().map(o => Object.fromEntries(Object.entries(o).reverse()))
    expect(JSON.stringify(stored) === JSON.stringify(fresh)).toBe(false) // the old compare
    expect(sameLineItems(stored, fresh)).toBe(true)
  })
  it('numeric strings equal numbers (numeric columns)', () => {
    expect(sameLineItems([{ total: '175.00', quantity: '1' }], [{ total: 175, quantity: 1 }])).toBe(true)
  })
  it('different when a line, price or quantity changed', () => {
    expect(sameLineItems(fresh, fresh.slice(1))).toBe(false)
    expect(sameLineItems(fresh, [{ ...fresh[0], total: 180 }, fresh[1]])).toBe(false)
    expect(sameLineItems([], [])).toBe(true)
    expect(sameLineItems(null, [])).toBe(true)
  })
})
