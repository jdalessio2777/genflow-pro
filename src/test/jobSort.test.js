import { describe, it, expect } from 'vitest'
import { sortJobs, isJobOverdue, etDateKey, isClosedJob } from '@/lib/utils/jobSort'

// "now" = Wed Oct 14 2026, 10:00 AM ET (14:00Z, EDT = UTC-4)
const NOW = new Date('2026-10-14T14:00:00Z')

const j = (id, extra) => ({ id, status: 'scheduled', created_at: '2026-10-01T00:00:00Z', ...extra })

describe('etDateKey', () => {
  it('uses the America/New_York calendar day, not UTC', () => {
    // 11:45 PM ET on Oct 18 is already Oct 19 in UTC
    expect(etDateKey('2026-10-19T03:45:00Z')).toBe('2026-10-18')
    // After the Nov 1 DST change ET is UTC-5
    expect(etDateKey('2026-11-03T04:30:00Z')).toBe('2026-11-02')
    expect(etDateKey('2026-11-03T05:30:00Z')).toBe('2026-11-03')
    expect(etDateKey(null)).toBe(null)
    expect(etDateKey('not a date')).toBe(null)
  })
})

describe('isJobOverdue', () => {
  it('is true only for open jobs on an earlier ET day', () => {
    expect(isJobOverdue(j('a', { scheduled_date: '2026-10-13T20:00:00Z' }), NOW)).toBe(true)
    // earlier today (8 AM ET) is still "today", not overdue
    expect(isJobOverdue(j('b', { scheduled_date: '2026-10-14T12:00:00Z' }), NOW)).toBe(false)
    expect(isJobOverdue(j('c', { scheduled_date: '2026-10-13T20:00:00Z', status: 'completed' }), NOW)).toBe(false)
    expect(isJobOverdue(j('d', { scheduled_date: null }), NOW)).toBe(false)
  })
  it('a job at 11:30 PM ET yesterday is overdue even though it is "today" in UTC', () => {
    expect(isJobOverdue(j('e', { scheduled_date: '2026-10-14T03:30:00Z' }), NOW)).toBe(true)
  })
})

describe('sortJobs', () => {
  const jobs = [
    j('nodate', { scheduled_date: null, created_at: '2026-10-02T00:00:00Z' }),
    j('completed-old', { status: 'completed', scheduled_date: '2026-10-01T14:00:00Z', completed_date: '2026-10-01T16:00:00Z' }),
    j('dst', { scheduled_date: '2026-11-03T14:00:00Z' }),
    j('oct20-2pm', { scheduled_date: '2026-10-20T18:00:00Z', created_at: '2026-09-01T00:00:00Z' }),
    j('canceled-recent', { status: 'canceled', scheduled_date: '2026-10-12T14:00:00Z' }),
    j('oct20-9am', { scheduled_date: '2026-10-20T13:00:00Z', created_at: '2026-10-10T00:00:00Z' }),
    j('overdue-new', { scheduled_date: '2026-10-12T14:00:00Z' }),
    j('nearmidnight', { scheduled_date: '2026-10-19T03:45:00Z' }),
    j('overdue-old', { scheduled_date: '2026-10-05T14:00:00Z' }),
    j('today-late', { scheduled_date: '2026-10-14T22:00:00Z' }),
    j('today-early', { scheduled_date: '2026-10-14T12:00:00Z' }),
    j('invoiced-new', { status: 'invoiced', scheduled_date: '2026-10-13T14:00:00Z', completed_date: '2026-10-13T18:00:00Z' }),
  ]
  it('orders overdue, today/future (date+time), no date, then closed most recent first', () => {
    expect(sortJobs(jobs, NOW).map(x => x.id)).toEqual([
      'overdue-old', 'overdue-new',
      'today-early', 'today-late', 'nearmidnight', 'oct20-9am', 'oct20-2pm', 'dst',
      'nodate',
      'invoiced-new', 'canceled-recent', 'completed-old',
    ])
  })
  it('breaks ties by created date', () => {
    const same = '2026-10-20T13:00:00Z'
    const open = [j('newer', { scheduled_date: same, created_at: '2026-10-05T00:00:00Z' }), j('older', { scheduled_date: same, created_at: '2026-10-01T00:00:00Z' })]
    expect(sortJobs(open, NOW).map(x => x.id)).toEqual(['older', 'newer'])
    const closed = [
      j('c-older', { status: 'completed', completed_date: same, created_at: '2026-10-01T00:00:00Z' }),
      j('c-newer', { status: 'completed', completed_date: same, created_at: '2026-10-05T00:00:00Z' }),
    ]
    expect(sortJobs(closed, NOW).map(x => x.id)).toEqual(['c-newer', 'c-older'])
  })
  it('does not mutate its input and tolerates created_date (normalized rows)', () => {
    const input = [j('b', { scheduled_date: '2026-10-21T13:00:00Z' }), j('a', { scheduled_date: '2026-10-16T13:00:00Z', created_date: '2026-10-02T00:00:00Z' })]
    const copy = [...input]
    expect(sortJobs(input, NOW).map(x => x.id)).toEqual(['a', 'b'])
    expect(input).toEqual(copy)
    expect(sortJobs(null)).toEqual([])
  })
  it('treats canceled/cancelled/invoiced as closed', () => {
    expect(isClosedJob({ status: 'cancelled' })).toBe(true)
    expect(isClosedJob({ status: 'on_site' })).toBe(false)
  })
})
