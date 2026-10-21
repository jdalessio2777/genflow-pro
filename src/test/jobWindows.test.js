import { describe, it, expect } from 'vitest'
import {
  UPCOMING_AFTER_DAYS, isFarFuture, splitActive, addDaysToKey, activeWindowEndKey, scheduledDayKey,
} from '@/lib/jobWindows'

// "now" = Wed Oct 21 2026, 10:00 AM ET (14:00Z, EDT = UTC-4).
// Today + 45 days = Sat Dec 5 2026 (after the Nov 1 DST change, ET = UTC-5).
const NOW = new Date('2026-10-21T14:00:00Z')

const j = (id, extra) => ({ id, status: 'scheduled', created_at: '2026-10-01T00:00:00Z', ...extra })
// 10:00 AM ET on an ET calendar day in Nov-Dec (EST, UTC-5)
const est = (day, hhmm = '15:00') => `${day}T${hhmm}:00Z`

describe('constants and day math', () => {
  it('window is 45 days', () => {
    expect(UPCOMING_AFTER_DAYS).toBe(45)
    expect(activeWindowEndKey(NOW)).toBe('2026-12-05')
  })
  it('addDaysToKey crosses months, years and DST without drifting', () => {
    expect(addDaysToKey('2026-10-21', 45)).toBe('2026-12-05')
    expect(addDaysToKey('2026-12-20', 45)).toBe('2027-02-03')
    expect(addDaysToKey('2027-02-01', 45)).toBe('2027-03-18') // across Mar 14 DST
    expect(addDaysToKey('2028-01-20', 45)).toBe('2028-03-05') // leap year
  })
})

describe('isFarFuture', () => {
  it('30 days out -> Active', () => {
    expect(isFarFuture(j('a', { scheduled_date: est('2026-11-20') }), NOW)).toBe(false)
  })
  it('exactly day 45 -> Active, at any time of day', () => {
    expect(isFarFuture(j('a', { scheduled_date: est('2026-12-05') }), NOW)).toBe(false)
    // 11:30 PM ET Dec 5 = 04:30Z Dec 6 — still ET day 45
    expect(isFarFuture(j('b', { scheduled_date: '2026-12-06T04:30:00Z' }), NOW)).toBe(false)
  })
  it('day 46 -> Upcoming, even at 12:30 AM ET', () => {
    expect(isFarFuture(j('a', { scheduled_date: est('2026-12-06') }), NOW)).toBe(true)
    expect(isFarFuture(j('b', { scheduled_date: '2026-12-06T05:30:00Z' }), NOW)).toBe(true)
  })
  it('60 days out and next year -> Upcoming', () => {
    expect(isFarFuture(j('a', { scheduled_date: est('2026-12-20') }), NOW)).toBe(true)
    expect(isFarFuture(j('b', { scheduled_date: '2027-10-21T14:00:00Z' }), NOW)).toBe(true)
  })
  it('overdue and today -> Active', () => {
    expect(isFarFuture(j('a', { scheduled_date: '2026-09-01T14:00:00Z' }), NOW)).toBe(false)
    expect(isFarFuture(j('b', { scheduled_date: '2026-10-21T12:00:00Z' }), NOW)).toBe(false)
  })
  it('no date ("Not scheduled") -> Active', () => {
    expect(isFarFuture(j('a', { scheduled_date: null }), NOW)).toBe(false)
    expect(isFarFuture(j('b', {}), NOW)).toBe(false)
    expect(isFarFuture(j('c', { scheduled_date: 'garbage' }), NOW)).toBe(false)
  })
  it('closed jobs are never far future', () => {
    for (const status of ['completed', 'invoiced', 'canceled']) {
      expect(isFarFuture(j('a', { status, scheduled_date: '2027-10-21T14:00:00Z' }), NOW)).toBe(false)
    }
  })
  it('the boundary moves with the clock: a day-46 job becomes Active the next ET day', () => {
    const job = j('a', { scheduled_date: est('2026-12-06') })
    expect(isFarFuture(job, NOW)).toBe(true)
    // 11:59 PM ET Oct 21 is still Oct 21
    expect(isFarFuture(job, new Date('2026-10-22T03:59:00Z'))).toBe(true)
    // 12:01 AM ET Oct 22
    expect(isFarFuture(job, new Date('2026-10-22T04:01:00Z'))).toBe(false)
  })
  it('uses the ET day of "now", not UTC (late evening ET is next day in UTC)', () => {
    // 9 PM ET Oct 21 = 01:00Z Oct 22; window end must still be Dec 5
    const lateNow = new Date('2026-10-22T01:00:00Z')
    expect(activeWindowEndKey(lateNow)).toBe('2026-12-05')
    expect(isFarFuture(j('a', { scheduled_date: est('2026-12-06') }), lateNow)).toBe(true)
  })
  it('a bare YYYY-MM-DD date is read as that calendar day, not UTC midnight', () => {
    expect(scheduledDayKey('2026-12-06')).toBe('2026-12-06')
    expect(isFarFuture(j('a', { scheduled_date: '2026-12-05' }), NOW)).toBe(false)
    expect(isFarFuture(j('b', { scheduled_date: '2026-12-06' }), NOW)).toBe(true)
  })
})

describe('splitActive', () => {
  const jobs = [
    j('far-2027', { scheduled_date: '2027-10-01T14:00:00Z' }),
    j('nodate', { scheduled_date: null }),
    j('far-dec20', { scheduled_date: est('2026-12-20') }),
    j('overdue', { scheduled_date: '2026-10-10T14:00:00Z' }),
    j('day45', { scheduled_date: est('2026-12-05'), status: 'dispatched' }),
    j('far-dec06', { scheduled_date: est('2026-12-06') }),
    j('today', { scheduled_date: '2026-10-21T18:00:00Z', status: 'on_site' }),
    j('done', { status: 'completed', scheduled_date: '2027-01-10T14:00:00Z' }),
    j('canceled', { status: 'canceled', scheduled_date: '2027-01-10T14:00:00Z' }),
    j('quote', { status: 'quoted', scheduled_date: '2026-11-01T14:00:00Z' }),
  ]
  const { active, upcoming } = splitActive(jobs, NOW)

  it('Active keeps overdue, today, within-45 and undated jobs in the usual order', () => {
    expect(active.map(x => x.id)).toEqual(['overdue', 'today', 'day45', 'nodate'])
  })
  it('Upcoming is soonest first', () => {
    expect(upcoming.map(x => x.id)).toEqual(['far-dec06', 'far-dec20', 'far-2027'])
  })
  it('closed and non-active statuses are in neither list', () => {
    const ids = [...active, ...upcoming].map(x => x.id)
    expect(ids).not.toContain('done')
    expect(ids).not.toContain('canceled')
    expect(ids).not.toContain('quote')
  })
  it('does not mutate the input', () => {
    expect(jobs[0].id).toBe('far-2027')
    expect(splitActive(undefined, NOW)).toEqual({ active: [], upcoming: [] })
  })
})
