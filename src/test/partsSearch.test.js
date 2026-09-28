import { describe, it, expect } from 'vitest'
import {
  normalizePartText,
  matchesPart,
  searchParts,
  sanitizeQuantityInput,
  parseQuantity,
} from '@/lib/utils/partsSearch'

const catalog = [
  { id: '1', name: 'Oil Filter 90mm', part_number: '070185ES' },
  { id: '2', name: 'Fuel Regulator', part_number: '62 083 04-S' },
  { id: '3', name: 'NAPA Battery', part_number: 'NAPA 1372' },
  { id: '4', name: 'Spark Plug', part_number: 'RC12YC' },
  { id: '5', name: 'ZZ QA TEST PART', part_number: 'ZZ-QA-7781' },
  { id: '6', name: 'Air Filter Kit', part_number: null },
  { id: '7', name: 'Starter Motor', part_number: 'a.b_c/d' },
]

describe('normalizePartText', () => {
  it('lowercases and strips spaces, dashes, dots, underscores, slashes', () => {
    expect(normalizePartText('62 083 04-S')).toBe('6208304s')
    expect(normalizePartText('A.b_C/d')).toBe('abcd')
    expect(normalizePartText('  ZZ-QA-7781 ')).toBe('zzqa7781')
  })
  it('handles null/undefined/numbers', () => {
    expect(normalizePartText(null)).toBe('')
    expect(normalizePartText(undefined)).toBe('')
    expect(normalizePartText(1372)).toBe('1372')
  })
})

describe('matchesPart', () => {
  it('matches everything on an empty/blank query', () => {
    expect(matchesPart(catalog[0], '')).toBe(true)
    expect(matchesPart(catalog[0], '   ')).toBe(true)
  })
  it('matches name case-insensitively', () => {
    expect(matchesPart(catalog[0], 'oil fil')).toBe(true)
    expect(matchesPart(catalog[0], 'OIL')).toBe(true)
    expect(matchesPart(catalog[0], 'fuel')).toBe(false)
  })
  it('matches part number ignoring separators, both directions', () => {
    expect(matchesPart(catalog[1], '6208304s')).toBe(true)
    expect(matchesPart(catalog[1], '62-083-04')).toBe(true)
    expect(matchesPart(catalog[1], '62 083')).toBe(true)
    expect(matchesPart(catalog[4], 'zzqa7781')).toBe(true)
    expect(matchesPart(catalog[4], 'ZZ-QA-7781')).toBe(true)
    expect(matchesPart(catalog[4], 'qa 7781')).toBe(true)
    expect(matchesPart(catalog[6], 'abcd')).toBe(true)
  })
  it('matches multi-word queries token-wise across name and number', () => {
    expect(matchesPart(catalog[2], 'battery 1372')).toBe(true)
    expect(matchesPart(catalog[0], 'filter 90')).toBe(true)
    expect(matchesPart(catalog[0], 'filter 91')).toBe(false)
  })
  it('does not crash on parts with no part number', () => {
    expect(matchesPart(catalog[5], 'air')).toBe(true)
    expect(matchesPart(catalog[5], '1372')).toBe(false)
  })
  it('does not treat a separator-only query as a match-all trap', () => {
    expect(matchesPart(catalog[0], '-')).toBe(true)
  })
})

describe('searchParts', () => {
  it('returns all (capped) on empty query', () => {
    const { results, total } = searchParts(catalog, '', 3)
    expect(total).toBe(catalog.length)
    expect(results).toHaveLength(3)
  })
  it('ranks exact part number above name matches', () => {
    const parts = [
      { id: 'a', name: 'Filter for RC12YC', part_number: 'X1' },
      { id: 'b', name: 'Spark Plug', part_number: 'RC-12YC' },
    ]
    expect(searchParts(parts, 'rc12yc').results.map(p => p.id)).toEqual(['b', 'a'])
  })
  it('ranks whole-word name matches above mid-word ones', () => {
    const parts = [
      { id: 'coil', name: 'Coil ATS Standby', part_number: '0E6154A' },
      { id: 'low', name: 'Low Oil Press Switch', part_number: '0L2917D' },
      { id: 'kit', name: 'Kit-Oil Float Assy', part_number: 'A1' },
    ]
    expect(searchParts(parts, 'oil').results.map(p => p.id)).toEqual(['kit', 'low', 'coil'])
  })
  it('caps rendered results but reports full total', () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ id: String(i), name: `Filter ${i}`, part_number: `F-${i}` }))
    const { results, total } = searchParts(many, 'filter', 50)
    expect(total).toBe(120)
    expect(results).toHaveLength(50)
  })
  it('handles null list', () => {
    expect(searchParts(null, 'x')).toEqual({ results: [], total: 0 })
  })
})

describe('quantity helpers', () => {
  it('sanitizeQuantityInput keeps digits only, allows empty', () => {
    expect(sanitizeQuantityInput('')).toBe('')
    expect(sanitizeQuantityInput('12')).toBe('12')
    expect(sanitizeQuantityInput('1.5')).toBe('15')
    expect(sanitizeQuantityInput('-3')).toBe('3')
    expect(sanitizeQuantityInput('123456')).toBe('1234')
  })
  it('parseQuantity floors invalid / < 1 values to 1', () => {
    expect(parseQuantity('')).toBe(1)
    expect(parseQuantity('0')).toBe(1)
    expect(parseQuantity('-2')).toBe(1)
    expect(parseQuantity('abc')).toBe(1)
    expect(parseQuantity(undefined)).toBe(1)
    expect(parseQuantity('3')).toBe(3)
    expect(parseQuantity('12')).toBe(12)
    expect(parseQuantity(7)).toBe(7)
    expect(parseQuantity('007')).toBe(7)
  })
})
