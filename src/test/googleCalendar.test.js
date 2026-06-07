import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getRecentCalendarChanges,
} from '@/lib/googleCalendar'

const MOCK_TOKEN = 'ya29.mock-access-token'
const MOCK_EVENT_ID = 'google-cal-event-xyz'

const mockJob = {
  id: 'job-uuid-abc',
  job_type: 'maintenance',
  scheduled_date: new Date('2026-06-10T09:00:00').toISOString(),
  estimated_duration: '2',
  notes: 'Annual service',
}

const mockCustomer = {
  name: 'Don Grennon',
  address: '58 Druid Hill Rd, Summit NJ',
  phone: '973-555-1234',
  generator_model: 'Generac 17kW',
}

function makeFetchOk(body) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  })
}

function makeFetchStatus(status) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ id: MOCK_EVENT_ID }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── createCalendarEvent ──────────────────────────────────────────────────────

describe('createCalendarEvent', () => {
  it('calls the Calendar API POST endpoint', async () => {
    global.fetch = makeFetchOk({ id: MOCK_EVENT_ID })
    await createCalendarEvent(mockJob, mockCustomer, MOCK_TOKEN)
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url] = fetch.mock.calls[0]
    expect(url).toContain('https://www.googleapis.com/calendar/v3/calendars/primary/events')
    expect(fetch.mock.calls[0][1].method).toBe('POST')
  })

  it('includes Authorization header with the token', async () => {
    global.fetch = makeFetchOk({ id: MOCK_EVENT_ID })
    await createCalendarEvent(mockJob, mockCustomer, MOCK_TOKEN)
    const [, opts] = fetch.mock.calls[0]
    expect(opts.headers['Authorization']).toBe(`Bearer ${MOCK_TOKEN}`)
  })

  it('event summary contains job type and customer name', async () => {
    global.fetch = makeFetchOk({ id: MOCK_EVENT_ID })
    await createCalendarEvent(mockJob, mockCustomer, MOCK_TOKEN)
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.summary).toContain('MAINTENANCE')
    expect(body.summary).toContain('Don Grennon')
  })

  it('event description contains GENFLOW_JOB_ID marker', async () => {
    global.fetch = makeFetchOk({ id: MOCK_EVENT_ID })
    await createCalendarEvent(mockJob, mockCustomer, MOCK_TOKEN)
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.description).toContain(`GENFLOW_JOB_ID:${mockJob.id}`)
  })

  it('start time matches job scheduled_date', async () => {
    global.fetch = makeFetchOk({ id: MOCK_EVENT_ID })
    await createCalendarEvent(mockJob, mockCustomer, MOCK_TOKEN)
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    const expectedStart = new Date(mockJob.scheduled_date).toISOString()
    expect(body.start.dateTime).toBe(expectedStart)
  })

  it('end time is 2 hours after start', async () => {
    global.fetch = makeFetchOk({ id: MOCK_EVENT_ID })
    await createCalendarEvent(mockJob, mockCustomer, MOCK_TOKEN)
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    const startMs = new Date(mockJob.scheduled_date).getTime()
    const endMs = new Date(body.end.dateTime).getTime()
    expect(endMs - startMs).toBe(2 * 60 * 60 * 1000)
  })

  it('uses colorId=2 for maintenance job type', async () => {
    global.fetch = makeFetchOk({ id: MOCK_EVENT_ID })
    await createCalendarEvent(mockJob, mockCustomer, MOCK_TOKEN)
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.colorId).toBe('2')
  })

  it('uses colorId=11 for emergency job type', async () => {
    global.fetch = makeFetchOk({ id: MOCK_EVENT_ID })
    await createCalendarEvent({ ...mockJob, job_type: 'emergency' }, mockCustomer, MOCK_TOKEN)
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.colorId).toBe('11')
  })

  it('uses colorId=6 for diagnostic_repair job type', async () => {
    global.fetch = makeFetchOk({ id: MOCK_EVENT_ID })
    await createCalendarEvent({ ...mockJob, job_type: 'diagnostic_repair' }, mockCustomer, MOCK_TOKEN)
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.colorId).toBe('6')
  })

  it('returns the event ID from the response', async () => {
    global.fetch = makeFetchOk({ id: MOCK_EVENT_ID })
    const result = await createCalendarEvent(mockJob, mockCustomer, MOCK_TOKEN)
    expect(result).toBe(MOCK_EVENT_ID)
  })

  it('throws on 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
    await expect(createCalendarEvent(mockJob, mockCustomer, MOCK_TOKEN)).rejects.toThrow('401')
  })
})

// ─── updateCalendarEvent ──────────────────────────────────────────────────────

describe('updateCalendarEvent', () => {
  it('uses PATCH method on the existing event URL', async () => {
    global.fetch = makeFetchOk({ id: MOCK_EVENT_ID })
    await updateCalendarEvent(MOCK_EVENT_ID, mockJob, mockCustomer, MOCK_TOKEN)
    const [url, opts] = fetch.mock.calls[0]
    expect(url).toContain(MOCK_EVENT_ID)
    expect(opts.method).toBe('PATCH')
  })

  it('falls back to createCalendarEvent when PATCH returns 404', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'new-event-id' }) })

    const result = await updateCalendarEvent(MOCK_EVENT_ID, mockJob, mockCustomer, MOCK_TOKEN)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(result).toBe('new-event-id')
  })

  it('includes Authorization header', async () => {
    global.fetch = makeFetchOk({ id: MOCK_EVENT_ID })
    await updateCalendarEvent(MOCK_EVENT_ID, mockJob, mockCustomer, MOCK_TOKEN)
    const [, opts] = fetch.mock.calls[0]
    expect(opts.headers['Authorization']).toBe(`Bearer ${MOCK_TOKEN}`)
  })
})

// ─── deleteCalendarEvent ──────────────────────────────────────────────────────

describe('deleteCalendarEvent', () => {
  it('calls DELETE on the correct event URL', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => ({}) })
    await deleteCalendarEvent(MOCK_EVENT_ID, MOCK_TOKEN)
    const [url, opts] = fetch.mock.calls[0]
    expect(url).toContain(MOCK_EVENT_ID)
    expect(opts.method).toBe('DELETE')
  })

  it('does NOT throw when Google returns 404', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    await expect(deleteCalendarEvent(MOCK_EVENT_ID, MOCK_TOKEN)).resolves.toBeUndefined()
  })

  it('includes Authorization header', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => ({}) })
    await deleteCalendarEvent(MOCK_EVENT_ID, MOCK_TOKEN)
    const [, opts] = fetch.mock.calls[0]
    expect(opts.headers['Authorization']).toBe(`Bearer ${MOCK_TOKEN}`)
  })
})

// ─── getRecentCalendarChanges ─────────────────────────────────────────────────

describe('getRecentCalendarChanges', () => {
  const since = new Date('2026-06-01T00:00:00').toISOString()

  it('calls the correct events list endpoint', async () => {
    global.fetch = makeFetchOk({ items: [] })
    await getRecentCalendarChanges(MOCK_TOKEN, since)
    const [url] = fetch.mock.calls[0]
    expect(url).toContain('https://www.googleapis.com/calendar/v3/calendars/primary/events')
    expect(url).toContain('updatedMin')
  })

  it('includes sinceTimestamp as updatedMin query param', async () => {
    global.fetch = makeFetchOk({ items: [] })
    await getRecentCalendarChanges(MOCK_TOKEN, since)
    const [url] = fetch.mock.calls[0]
    expect(url).toContain(encodeURIComponent(new Date(since).toISOString()))
  })

  it('returns empty array when no events have GENFLOW_JOB_ID', async () => {
    global.fetch = makeFetchOk({
      items: [
        { id: 'ev1', description: 'No marker here', start: { dateTime: '' }, end: { dateTime: '' } },
      ],
    })
    const result = await getRecentCalendarChanges(MOCK_TOKEN, since)
    expect(result).toEqual([])
  })

  it('parses GENFLOW_JOB_ID from event description', async () => {
    const jobId = 'job-abc-123'
    const startTime = '2026-06-10T09:00:00Z'
    const endTime = '2026-06-10T11:00:00Z'
    global.fetch = makeFetchOk({
      items: [
        {
          id: MOCK_EVENT_ID,
          description: `GenFlow Job ID: ${jobId}\nGENFLOW_JOB_ID:${jobId}`,
          start: { dateTime: startTime },
          end: { dateTime: endTime },
        },
      ],
    })
    const result = await getRecentCalendarChanges(MOCK_TOKEN, since)
    expect(result).toHaveLength(1)
    expect(result[0].jobId).toBe(jobId)
    expect(result[0].newStartTime).toBe(startTime)
    expect(result[0].newEndTime).toBe(endTime)
    expect(result[0].calendarEventId).toBe(MOCK_EVENT_ID)
  })

  it('returns multiple results for multiple matching events', async () => {
    global.fetch = makeFetchOk({
      items: [
        { id: 'ev1', description: 'GENFLOW_JOB_ID:job-1', start: { dateTime: '2026-06-10T09:00:00Z' }, end: { dateTime: '2026-06-10T11:00:00Z' } },
        { id: 'ev2', description: 'no marker' },
        { id: 'ev3', description: 'GENFLOW_JOB_ID:job-2', start: { dateTime: '2026-06-11T10:00:00Z' }, end: { dateTime: '2026-06-11T12:00:00Z' } },
      ],
    })
    const result = await getRecentCalendarChanges(MOCK_TOKEN, since)
    expect(result).toHaveLength(2)
    expect(result[0].jobId).toBe('job-1')
    expect(result[1].jobId).toBe('job-2')
  })

  it('uses 30-day default window when no sinceTimestamp provided', async () => {
    global.fetch = makeFetchOk({ items: [] })
    await getRecentCalendarChanges(MOCK_TOKEN)
    const [url] = fetch.mock.calls[0]
    expect(url).toContain('updatedMin')
  })
})
