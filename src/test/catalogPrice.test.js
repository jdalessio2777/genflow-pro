import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  sanitizePriceInput, parsePriceDraft, isPriceDraftDirty, buildPricePatch,
  describePriceChange, isAutoSuggestEligible, toPriceDraft,
} from '@/lib/utils/catalogPrice'

const update = vi.fn()
let failNext = false
const call = (t, ...a) => { if (failNext) { failNext = false; return Promise.reject(new Error('offline')) } return update(t, ...a) }
vi.mock('@/lib/db', () => ({ db: { Part: { update: (...a) => call('Part', ...a) }, LaborRate: { update: (...a) => call('LaborRate', ...a) } } }))
const { saveCatalogPrice } = await import('@/lib/catalogPrices')

describe('sanitizePriceInput', () => {
  it('blocks negatives, letters, extra dots and a 3rd decimal', () => {
    expect(sanitizePriceInput('-12.5')).toBe('12.5')
    expect(sanitizePriceInput('12.345')).toBe('12.34')
    expect(sanitizePriceInput('1.2.3')).toBe('1.23')
    expect(sanitizePriceInput('$1,5')).toBe('1.5')
    expect(sanitizePriceInput('abc')).toBe('')
    expect(sanitizePriceInput('1234567')).toBe('12345')
  })
})

describe('parsePriceDraft / dirty', () => {
  it('parses valid amounts and rejects empty/invalid', () => {
    expect(parsePriceDraft('15.25')).toBe(15.25)
    expect(parsePriceDraft('0')).toBe(0)
    expect(parsePriceDraft('.5')).toBe(0.5)
    expect(parsePriceDraft('')).toBe(null)
    expect(parsePriceDraft('.')).toBe(null)
    expect(parsePriceDraft('-1')).toBe(null)
    expect(parsePriceDraft('1.234')).toBe(null)
  })
  it('dirty only when a valid draft differs from the saved value', () => {
    expect(isPriceDraftDirty('13.5', 13.5)).toBe(false)
    expect(isPriceDraftDirty('13.50', '13.5')).toBe(false)
    expect(isPriceDraftDirty('15', 13.5)).toBe(true)
    expect(isPriceDraftDirty('', 13.5)).toBe(false)
    expect(toPriceDraft(13.5)).toBe('13.5')
    expect(toPriceDraft(null)).toBe('0')
  })
})

describe('buildPricePatch', () => {
  it('part: only changed fields; marks managed when it gets a price', () => {
    const part = { id: 'p', cost: 10, default_price: 0, first_managed_at: null }
    const patch = buildPricePatch('part', part, { price: 13.5, cost: 10 })
    expect(patch.default_price).toBe(13.5)
    expect('cost' in patch).toBe(false)
    expect(typeof patch.first_managed_at).toBe('string')
  })
  it('part already managed: saves exactly what was typed, no markup, no re-stamp', () => {
    const part = { id: 'p', cost: 10, default_price: 13.5, first_managed_at: '2026-01-01T00:00:00Z' }
    expect(buildPricePatch('part', part, { price: 15.25, cost: 11 })).toEqual({ default_price: 15.25, cost: 11 })
  })
  it('hourly and flat map to their own columns', () => {
    expect(buildPricePatch('hourly', { rate: 100, cost_rate: 40 }, { price: 110, cost: 40 })).toEqual({ rate: 110 })
    expect(buildPricePatch('flat', { flat_price: 250, flat_cost: 90 }, { price: 250, cost: 95 })).toEqual({ flat_cost: 95 })
  })
  it('describes old > new', () => {
    expect(describePriceChange('part', { default_price: 13.5, cost: 10 }, { default_price: 15.25, cost: 11 }))
      .toBe('Price $13.50 → $15.25 · Cost $10.00 → $11.00')
  })
  it('auto-suggest only for never-priced, never-managed parts', () => {
    expect(isAutoSuggestEligible({ default_price: 0, first_managed_at: null })).toBe(true)
    expect(isAutoSuggestEligible({ default_price: 5, first_managed_at: null })).toBe(false)
    expect(isAutoSuggestEligible({ default_price: 0, first_managed_at: 'x' })).toBe(false)
  })
})

describe('saveCatalogPrice (the single save path)', () => {
  beforeEach(() => update.mockReset())
  it('writes parts to db.Part and rates to db.LaborRate', async () => {
    update.mockResolvedValue({ id: 'x' })
    const r1 = await saveCatalogPrice('part', { id: 'p1', default_price: 13.5, cost: 10, first_managed_at: 'x' }, { price: 15.25, cost: null })
    expect(update).toHaveBeenLastCalledWith('Part', 'p1', { default_price: 15.25 })
    expect(r1.message).toBe('Price $13.50 → $15.25')
    await saveCatalogPrice('hourly', { id: 'r1', rate: 100, cost_rate: 40 }, { price: 120, cost: 40 })
    expect(update).toHaveBeenLastCalledWith('LaborRate', 'r1', { rate: 120 })
  })
  it('does not write when nothing changed', async () => {
    const r = await saveCatalogPrice('flat', { id: 'f', flat_price: 250, flat_cost: 90 }, { price: 250, cost: 90 })
    expect(update).not.toHaveBeenCalled()
    expect(r.message).toBe('')
  })
  it('propagates failures so the UI can show "Not saved"', async () => {
    failNext = true
    let caught = null
    try { await saveCatalogPrice('part', { id: 'p', default_price: 1, cost: 1, first_managed_at: 'x' }, { price: 2, cost: 1 }) } catch (e) { caught = e }
    expect(caught?.message).toBe('offline')
  })
})
