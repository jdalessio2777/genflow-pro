import { describe, it, expect } from 'vitest'
import { jobHeaderStatus } from '@/lib/jobStatus'

describe('job header status (Run 7)', () => {
  it('an approved job with no date reads "Not scheduled", matching the badge', () => {
    expect(jobHeaderStatus({ status: 'scheduled', scheduled_date: null })).toBe('Not scheduled')
  })
  it('keeps every other status', () => {
    expect(jobHeaderStatus({ status: 'scheduled', scheduled_date: '2026-11-05T15:00:00Z' })).toBe('scheduled')
    for (const [s, l] of [['on_site', 'On Site'], ['dispatched', 'Dispatched'], ['completed', 'Completed'], ['invoiced', 'Invoiced'], ['canceled', 'Canceled'], ['in_progress', 'in progress']])
      expect(jobHeaderStatus({ status: s, scheduled_date: null })).toBe(l)
  })
})
