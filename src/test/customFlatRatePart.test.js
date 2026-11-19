// Run 14 (B): a custom flat rate entered as a Part.
import { describe, it, expect } from 'vitest'
import { customPartRow, findCustomPartDuplicates, PART_CATEGORY_OPTIONS } from '@/lib/utils/catalogItems'
import { isStockTracked, isManaged, CUSTOM_PART_CATEGORY } from '@/lib/utils/partsManaged'
import { computeJobFinancials } from '@/lib/utils/jobFinancials'

describe('custom part catalog row', () => {
  it('goes in the Custom folder with no stock and is never "managed"', () => {
    const row = customPartRow({ name: ' Fuel regulator ', price: '185.5', description: 'Maxitrol' })
    expect(row).toMatchObject({ name: 'Fuel regulator', category: 'custom', default_price: 185.5, cost: 0, description: 'Maxitrol', in_stock: 0, reorder_flagged: false, is_hidden: false })
    expect(row.first_managed_at).toBeUndefined()
    expect(isManaged(row)).toBe(false)
    expect(isStockTracked(row)).toBe(false)
  })
  it('finds a same-name custom part, ignoring case and spaces, only in Custom', () => {
    const parts = [{ name: 'Fuel  Regulator', category: 'custom' }, { name: 'Fuel regulator', category: 'fuel_system' }]
    expect(findCustomPartDuplicates(parts, 'fuel regulator')).toHaveLength(1)
    expect(findCustomPartDuplicates(parts, '')).toEqual([])
  })
  it('regular parts stay stock-tracked; Custom is a part folder', () => {
    expect(isStockTracked({ category: 'batteries' })).toBe(true)
    expect(isStockTracked({ category: CUSTOM_PART_CATEGORY })).toBe(false)
    expect(PART_CATEGORY_OPTIONS.map(o => o[0])).toContain('custom')
  })
})

describe('a Part line is totalled and taxed as a part, a Labor line as labor', () => {
  it('moves the amount from Labor to Parts; tax and total are the same', () => {
    const asLabor = computeJobFinancials([], [{ total_price: 200, total_cost: 0 }])
    const asPart = computeJobFinancials([{ price: 200, quantity: 1, total_price: 200, total_cost: 0, charge_for_part: true }], [])
    expect([asLabor.partsTotal, asLabor.laborTotal]).toEqual([0, 200])
    expect([asPart.partsTotal, asPart.laborTotal]).toEqual([200, 0])
    expect(asPart.taxAmount).toBe(asLabor.taxAmount)
    expect(asPart.total).toBe(asLabor.total)
  })
})
