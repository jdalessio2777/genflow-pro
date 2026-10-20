import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildEvent, techColorId, serviceTypeLabel, genflowJobIdOf, isAdoptableFor, belongsToJob,
  mentionsCustomer, nyDate, listWritableCalendars, insertEvent, patchEvent, deleteEvent,
  getRecentCalendarChanges, ASSISTANT_PREFIX, OLD_APP_TITLE,
} from '@/lib/googleCalendar'

// B3: event building, colors, "is this ours?" and adoption rules.
const TOKEN = 'ya29.mock'
const job = {
  id: 'job-uuid-abc', job_type: 'maintenance', title: 'Annual maintenance',
  scheduled_date: '2026-11-03T14:00:00.000Z', // 9:00 AM New York
  notes: 'Gate code 1234', assigned_to_name: 'Jeremy', customer_name: 'Don Grennon',
}
const customer = {
  name: 'Don Grennon', address: '58 Druid Hill Rd, Summit NJ', phone: '973-555-1234',
  generator_brand: 'Generac', generator_model: 'Guardian', generator_kw: '22',
}
const okFetch = (body = {}) => vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body })

describe('buildEvent', () => {
  const e = buildEvent(job, customer)
  it('title "<Service Type> — <Customer> (<Tech>)"', () => {
    expect(e.summary).toBe('Maintenance — Don Grennon (Jeremy)')
  })
  it('starts at the arrival time and lasts the B2 estimate (2 h default)', () => {
    expect(e.start.dateTime).toBe('2026-11-03T14:00:00.000Z')
    expect(e.end.dateTime).toBe('2026-11-03T16:00:00.000Z')
    expect(e.start.timeZone).toBe('America/New_York')
  })
  it('uses the job estimate when set (estimated_minutes)', () => {
    expect(buildEvent({ ...job, estimated_minutes: 90 }, customer).end.dateTime).toBe('2026-11-03T15:30:00.000Z')
  })
  it('location = service address; description has service, generator, notes, phone, production link, marker', () => {
    expect(e.location).toBe('58 Druid Hill Rd, Summit NJ')
    expect(e.description).toContain('Service: Annual maintenance')
    expect(e.description).toContain('Generator: Generac Guardian 22kW')
    expect(e.description).toContain('Notes: Gate code 1234')
    expect(e.description).toContain('Customer phone: 973-555-1234')
    expect(e.description).toContain('Open in GenFlow: https://genflow-pro.vercel.app/jobs/job-uuid-abc')
    expect(e.description).toContain('GENFLOW_JOB_ID:job-uuid-abc')
    expect(e.extendedProperties.private.genflowJobId).toBe('job-uuid-abc')
  })
  it('never has attendees', () => {
    expect(e.attendees).toBeUndefined()
  })
  it('unassigned job → "(Unassigned)", grey', () => {
    const u = buildEvent({ ...job, assigned_to_name: '' }, customer)
    expect(u.summary).toBe('Maintenance — Don Grennon (Unassigned)')
    expect(u.colorId).toBe('8')
  })
  it('falls back to the job\'s customer name when no customer record is passed', () => {
    expect(buildEvent(job, null).summary).toBe('Maintenance — Don Grennon (Jeremy)')
  })
})

describe('techColorId', () => {
  it('Jeremy 9, Alex 10, anyone else 8', () => {
    expect(techColorId({ assigned_to_name: 'Jeremy' })).toBe('9')
    expect(techColorId({ assigned_to_name: "Jeremy D'Alessio" })).toBe('9')
    expect(techColorId({ assigned_to_name: 'Alex' })).toBe('10')
    expect(techColorId({ assigned_to_name: 'Derek' })).toBe('8')
    expect(techColorId({})).toBe('8')
  })
})

describe('serviceTypeLabel', () => {
  it('maps job types to their app labels', () => {
    expect(serviceTypeLabel('diagnostic_repair')).toBe('Diagnostic/Repair')
    expect(serviceTypeLabel('battery_replacement')).toBe('Battery Replacement')
    expect(serviceTypeLabel(undefined)).toBe('Service')
  })
})

describe('which events are ours / adoptable', () => {
  const sameDay = { dateTime: '2026-11-03T10:00:00-05:00' }
  it('reads the marker from extendedProperties or the old description line', () => {
    expect(genflowJobIdOf({ extendedProperties: { private: { genflowJobId: 'j1' } } })).toBe('j1')
    expect(genflowJobIdOf({ description: 'x\nGENFLOW_JOB_ID:j2' })).toBe('j2')
    expect(genflowJobIdOf({ description: 'nothing' })).toBeNull()
  })
  it('nyDate compares calendar days in New York', () => {
    expect(nyDate('2026-11-04T03:00:00Z')).toBe('2026-11-03') // 10 PM in NY
    expect(nyDate('2026-11-03')).toBe('2026-11-03')
  })
  it('adopts the assistant\'s event for the same customer and date', () => {
    const ev = { id: 'a1', summary: 'Generator service — Don Grennon', description: `${ASSISTANT_PREFIX}\nPhone 973…`, start: sameDay }
    expect(isAdoptableFor(ev, job, 'Don Grennon')).toBe(true)
  })
  it('adopts an old-app "GenShield Generator Service Appointment" event naming the customer', () => {
    const ev = { id: 'o1', summary: OLD_APP_TITLE, description: 'Customer: Don Grennon', start: sameDay }
    expect(isAdoptableFor(ev, job, 'Don Grennon')).toBe(true)
  })
  it('never adopts a generic GenShield task on the shared calendar, even same customer + day', () => {
    const task = { id: 't1', summary: 'Order parts for Don Grennon', description: 'pick up filters', start: sameDay }
    expect(isAdoptableFor(task, job, 'Don Grennon')).toBe(false)
    expect(belongsToJob(task, job, 'Don Grennon')).toBe(false)
  })
  it('never adopts another job\'s event', () => {
    const other = { id: 'x', summary: 'Maintenance — Don Grennon (Alex)', extendedProperties: { private: { genflowJobId: 'other-job' } }, start: sameDay }
    expect(isAdoptableFor(other, job, 'Don Grennon')).toBe(false)
    expect(belongsToJob(other, job, 'Don Grennon')).toBe(false)
  })
  it('does not adopt the assistant\'s event for a different customer or a different day', () => {
    const otherCust = { summary: 'Generator service — Jane Doe', description: ASSISTANT_PREFIX, start: sameDay }
    const otherDay = { summary: 'Generator service — Don Grennon', description: ASSISTANT_PREFIX, start: { dateTime: '2026-11-04T10:00:00-05:00' } }
    expect(isAdoptableFor(otherCust, job, 'Don Grennon')).toBe(false)
    expect(isAdoptableFor(otherDay, job, 'Don Grennon')).toBe(false)
  })
  it('a cancelled (deleted) event is never adopted', () => {
    expect(isAdoptableFor({ status: 'cancelled', description: ASSISTANT_PREFIX + ' Don Grennon', start: sameDay }, job, 'Don Grennon')).toBe(false)
  })
  it('customer match needs every word of the name', () => {
    expect(mentionsCustomer({ summary: 'Don Grennon' }, 'Don Grennon')).toBe(true)
    expect(mentionsCustomer({ summary: 'Don Smith' }, 'Don Grennon')).toBe(false)
    expect(mentionsCustomer({ summary: 'Donald Grennon' }, 'Don Grennon')).toBe(false)
  })
})

describe('API calls', () => {
  beforeEach(() => vi.restoreAllMocks())
  it('lists only calendars the user can write to', async () => {
    global.fetch = okFetch({ items: [
      { id: 'primary@x', summary: 'jeremy@x', primary: true, accessRole: 'owner' },
      { id: 'c_shared', summary: 'GenShield Schedule', accessRole: 'writer' },
      { id: 'holidays', summary: 'Holidays', accessRole: 'reader' },
    ] })
    const list = await listWritableCalendars(TOKEN)
    expect(list.map(c => c.id)).toEqual(['primary@x', 'c_shared'])
    expect(fetch.mock.calls[0][0]).toContain('/users/me/calendarList?minAccessRole=writer')
  })
  it('insert/patch/delete never send invites (sendUpdates=none) and carry the token', async () => {
    global.fetch = okFetch({ id: 'e1' })
    await insertEvent(TOKEN, 'c_shared', { summary: 's' })
    await patchEvent(TOKEN, 'c_shared', 'e1', { summary: 's' })
    await deleteEvent(TOKEN, 'c_shared', 'e1')
    const [ins, pat, del] = fetch.mock.calls
    expect(ins[0]).toBe('https://www.googleapis.com/calendar/v3/calendars/c_shared/events?sendUpdates=none')
    expect(ins[1].method).toBe('POST')
    expect(pat[0]).toBe('https://www.googleapis.com/calendar/v3/calendars/c_shared/events/e1?sendUpdates=none')
    expect(pat[1].method).toBe('PATCH')
    expect(del[1].method).toBe('DELETE')
    expect(ins[1].headers.Authorization).toBe(`Bearer ${TOKEN}`)
  })
  it('delete treats 404/410 (already gone) as done', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 410, json: async () => ({}) })
    await expect(deleteEvent(TOKEN, 'primary', 'gone')).resolves.toBeUndefined()
  })
  it('401 surfaces as an error with status 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: { message: 'Invalid Credentials' } }) })
    await expect(insertEvent(TOKEN, 'primary', {})).rejects.toMatchObject({ status: 401 })
  })
})

describe('getRecentCalendarChanges (pull from Google)', () => {
  it('returns ONLY GenFlow job events, never other tasks on the shared calendar', async () => {
    global.fetch = okFetch({ items: [
      { id: 'ev1', description: 'GENFLOW_JOB_ID:job-1', start: { dateTime: '2026-06-10T09:00:00Z' }, end: { dateTime: '2026-06-10T11:00:00Z' } },
      { id: 'task', summary: 'Team meeting', description: 'no marker', start: { dateTime: '2026-06-10T09:00:00Z' } },
      { id: 'ev3', extendedProperties: { private: { genflowJobId: 'job-2' } }, start: { dateTime: '2026-06-11T10:00:00Z' }, end: { dateTime: '2026-06-11T12:00:00Z' } },
      { id: 'gone', status: 'cancelled', description: 'GENFLOW_JOB_ID:job-3' },
    ] })
    const r = await getRecentCalendarChanges(TOKEN, '2026-06-01T00:00:00Z', 'c_shared')
    expect(r.map(c => c.jobId)).toEqual(['job-1', 'job-2'])
    expect(fetch.mock.calls[0][0]).toContain('/calendars/c_shared/events?')
    expect(fetch.mock.calls[0][0]).toContain('updatedMin=')
  })
})
