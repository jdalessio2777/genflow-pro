import { describe, it, expect } from 'vitest'
import { formatDate } from '../lib/utils/format'

// The test run uses the app's time zone (America/New_York), where the bug showed.
describe('formatDate', () => {
  it('shows a date-only value as that same day (was one day early)', () => {
    expect(formatDate('2026-11-09')).toBe('Nov 9, 2026')
    expect(formatDate('2026-01-01')).toBe('Jan 1, 2026')
  })
  it('still formats timestamps in local time', () => {
    expect(formatDate('2026-11-11T18:03:55.118+00:00')).toBe('Nov 11, 2026')
    expect(formatDate(null)).toBe('')
  })
})
