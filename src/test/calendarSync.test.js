import { describe, it, expect, vi, beforeEach } from 'vitest'
import { memoryStorage } from './memoryStorage'

// B3: calendarSync against a fake Google Calendar (fetch is intercepted).
const dbJobUpdate = vi.fn().mockResolvedValue({})
const dbJobFilter = vi.fn().mockResolvedValue([])
const dbCustomerFilter = vi.fn().mockResolvedValue([])
vi.mock('@/lib/db', () => ({ db: {
  Job: { update: (...a) => dbJobUpdate(...a), filter: (...a) => dbJobFilter(...a) },
  Customer: { filter: (...a) => dbCustomerFilter(...a) },
} }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/supabaseClient', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'staff-jwt' } } }) } } }))

const SHARED = 'c_717f876d6139fd5b54eac3db6236c0d049100049336d4a1833b19f266755ce11@group.calendar.google.com'
const ASSISTANT = 'GenShield job (added from the appointment confirmation email)'

function fakeGoogle({ calendars, events = {}, failWith = null, refresh = null } = {}) {
  const store = { primary: [], [SHARED]: [], ...events }
  const calls = []
  let n = 0
  const json = (status, body) => ({ ok: status < 300, status, json: async () => body })
  const fn = vi.fn(async (url, opts = {}) => {
    const method = opts.method || 'GET'
    const body = opts.body ? JSON.parse(opts.body) : null
    calls.push({ method, url, body })
    if (url === '/api/refresh-google-token') return refresh ? refresh() : json(400, { error: 'x', code: 'reconnect' })
    if (failWith) return json(failWith, { error: { message: 'fail' } })
    const u = new URL(url)
    const p = decodeURIComponent(u.pathname).replace('/calendar/v3', '')
    if (p === '/users/me/calendarList') return json(200, { items: calendars ?? [
      { id: 'me@genshield', summary: 'me@genshield', primary: true, accessRole: 'owner' },
      { id: SHARED, summary: 'GenShield Schedule', accessRole: 'writer' },
      { id: 'holidays', summary: 'Holidays', accessRole: 'reader' },
    ] })
    const m = p.match(/^\/calendars\/([^/]+)\/events(?:\/([^/]+))?(\/move)?$/)
    const cal = m[1] === 'me@genshield' ? 'primary' : m[1]
    const list = store[cal] || (store[cal] = [])
    const id = m[2]
    if (m[3]) { // move
      const i = list.findIndex(e => e.id === id); const [ev] = list.splice(i, 1)
      const dest = u.searchParams.get('destination'); (store[dest] ||= []).push(ev); return json(200, ev)
    }
    if (!id && method === 'GET') {
      const prop = u.searchParams.get('privateExtendedProperty')
      if (prop) { const v = prop.split('=')[1]; return json(200, { items: list.filter(e => e.extendedProperties?.private?.genflowJobId === v) }) }
      return json(200, { items: list })
    }
    if (!id && method === 'POST') { const ev = { id: `new${++n}`, ...body }; list.push(ev); return json(200, ev) }
    const ev = list.find(e => e.id === id)
    if (!ev) return json(404, { error: { message: 'Not Found' } })
    if (method === 'GET') return json(200, ev)
    if (method === 'PATCH') { Object.assign(ev, body); return json(200, ev) }
    if (method === 'DELETE') { list.splice(list.indexOf(ev), 1); return { ok: true, status: 204, json: async () => null } }
  })
  return { fn, store, calls, writes: () => calls.filter(c => c.method !== 'GET' && c.url.includes('googleapis')) }
}

const job = { id: 'job-1', customer_id: 'c1', customer_name: 'QA-AUDIT-B3 Pat', title: 'Annual maintenance', job_type: 'maintenance',
  status: 'scheduled', scheduled_date: '2026-11-03T14:00:00.000Z', assigned_to_name: 'Jeremy', notes: 'n', calendar_event_id: null }
const customer = { id: 'c1', name: 'QA-AUDIT-B3 Pat', address: '1 Test St, Summit NJ', phone: '555-0100' }

let cs, store
async function load({ token = { accessToken: 'ya29.good', expiresAt: Date.now() + 3600e3, refreshToken: '1//r' } } = {}) {
  vi.resetModules()
  vi.stubGlobal('localStorage', memoryStorage())
  if (token) localStorage.setItem('genflow_google_tokens_v1', JSON.stringify({ userId: 'u1', email: 'me@genshield', ...token }))
  cs = await import('@/lib/calendarSync')
  store = await import('@/lib/googleTokenStore')
}

beforeEach(() => { vi.clearAllMocks() })

describe('syncJobToCalendar', () => {
  it('creates ONE event on "GenShield Schedule" with title, color 9, 2 h, no attendees, and stores the id', async () => {
    await load(); const g = fakeGoogle(); global.fetch = g.fn
    const r = await cs.syncJobToCalendar({ job, customer })
    expect(r).toMatchObject({ status: 'synced', action: 'created', calendarId: SHARED })
    const posts = g.writes()
    expect(posts).toHaveLength(1)
    expect(posts[0].url).toContain(`/calendars/${encodeURIComponent(SHARED)}/events?sendUpdates=none`)
    expect(posts[0].body).toMatchObject({ summary: 'Maintenance — QA-AUDIT-B3 Pat (Jeremy)', colorId: '9', location: '1 Test St, Summit NJ',
      start: { dateTime: '2026-11-03T14:00:00.000Z' }, end: { dateTime: '2026-11-03T16:00:00.000Z' } })
    expect(posts[0].body.attendees).toBeUndefined()
    expect(dbJobUpdate).toHaveBeenCalledWith('job-1', expect.objectContaining({ calendar_event_id: 'new1' }))
  })

  it('falls back to the primary calendar when "GenShield Schedule" is not in the list', async () => {
    await load(); const g = fakeGoogle({ calendars: [{ id: 'me@genshield', summary: 'me', primary: true, accessRole: 'owner' }] }); global.fetch = g.fn
    const r = await cs.syncJobToCalendar({ job, customer })
    expect(r.calendarId).toBe('me@genshield')
  })

  it('edit / reschedule / reassign → PATCH the same event, never a second POST; Alex = color 10', async () => {
    await load(); const g = fakeGoogle(); global.fetch = g.fn
    await cs.syncJobToCalendar({ job, customer })
    const moved = { ...job, calendar_event_id: 'new1', scheduled_date: '2026-11-05T18:30:00.000Z', assigned_to_name: 'Alex' }
    const r = await cs.syncJobToCalendar({ job: moved, customer })
    expect(r).toMatchObject({ status: 'synced', action: 'updated', eventId: 'new1' })
    const w = g.writes()
    expect(w.filter(c => c.method === 'POST')).toHaveLength(1)
    expect(w[1].method).toBe('PATCH')
    expect(w[1].body).toMatchObject({ colorId: '10', summary: 'Maintenance — QA-AUDIT-B3 Pat (Alex)', start: { dateTime: '2026-11-05T18:30:00.000Z' } })
  })

  it('finds its event by marker even when the event id never reached the job row', async () => {
    await load(); const g = fakeGoogle(); global.fetch = g.fn
    await cs.syncJobToCalendar({ job, customer })
    vi.resetModules(); cs = await import('@/lib/calendarSync') // new app session, job row still has no id
    await cs.syncJobToCalendar({ job: { ...job, notes: 'changed' }, customer })
    expect(g.writes().filter(c => c.method === 'POST')).toHaveLength(1)
    expect(g.store[SHARED]).toHaveLength(1)
  })

  it('DEDUPE: adopts the assistant\'s event for the same customer+date in PRIMARY (moves it, patches it), no POST', async () => {
    await load()
    const assistant = { id: 'asst1', summary: 'Generator service — QA-AUDIT-B3 Pat', description: `${ASSISTANT}\nCall first`, start: { dateTime: '2026-11-03T09:00:00-05:00' } }
    const g = fakeGoogle({ events: { primary: [assistant] } }); global.fetch = g.fn
    const r = await cs.syncJobToCalendar({ job, customer })
    expect(r).toMatchObject({ status: 'synced', action: 'adopted', eventId: 'asst1', calendarId: SHARED })
    const w = g.writes()
    expect(w.some(c => c.method === 'POST' && !c.url.includes('/move'))).toBe(false)
    expect(w.find(c => c.url.includes('/move')).url).toContain(`destination=${encodeURIComponent(SHARED)}`)
    expect(w.find(c => c.method === 'PATCH').body.extendedProperties.private.genflowJobId).toBe('job-1')
  })

  it('DEDUPE: adopts an old-app "GenShield Generator Service Appointment" event', async () => {
    await load()
    const old = { id: 'old1', summary: 'GenShield Generator Service Appointment', description: 'Customer: QA-AUDIT-B3 Pat', start: { dateTime: '2026-11-03T09:00:00-05:00' } }
    const g = fakeGoogle({ events: { [SHARED]: [old] } }); global.fetch = g.fn
    const r = await cs.syncJobToCalendar({ job, customer })
    expect(r).toMatchObject({ action: 'adopted', eventId: 'old1' })
  })

  it('SHARED CALENDAR SAFETY: a non-job task the same day for the same customer is never modified, adopted or deleted', async () => {
    await load()
    const task = { id: 'task1', summary: 'Order filters for QA-AUDIT-B3 Pat', description: 'GenShield task', start: { dateTime: '2026-11-03T10:00:00-05:00' } }
    const otherJob = { id: 'oj', summary: 'Maintenance — QA-AUDIT-B3 Pat (Alex)', extendedProperties: { private: { genflowJobId: 'job-other' } }, start: { dateTime: '2026-11-03T13:00:00-05:00' } }
    const g = fakeGoogle({ events: { [SHARED]: [task, otherJob] } }); global.fetch = g.fn
    await cs.syncJobToCalendar({ job, customer })
    // even a stored id pointing at the task (bad data) must not make us touch it
    await cs.syncJobToCalendar({ job: { ...job, calendar_event_id: 'task1' }, customer })
    await cs.removeJobFromCalendar({ job: { ...job, calendar_event_id: 'task1' } })
    await cs.removeJobFromCalendar({ job: { ...job, id: 'job-x', calendar_event_id: 'oj' } })
    const touched = g.writes().filter(c => c.url.includes('/task1') || c.url.includes('/oj'))
    expect(touched).toEqual([])
    expect(g.store[SHARED].find(e => e.id === 'task1')).toEqual(task)
  })

  it('cancel → the job\'s event is removed (DELETE), and the job\'s link cleared', async () => {
    await load(); const g = fakeGoogle(); global.fetch = g.fn
    await cs.syncJobToCalendar({ job, customer })
    const r = await cs.syncJobToCalendar({ job: { ...job, status: 'canceled', calendar_event_id: 'new1' }, customer })
    expect(r.status).toBe('removed')
    expect(g.writes().filter(c => c.method === 'DELETE')).toHaveLength(1)
    expect(g.store[SHARED]).toHaveLength(0)
    expect(dbJobUpdate).toHaveBeenCalledWith('job-1', { calendar_event_id: null })
  })

  it('delete job → removeJobFromCalendar deletes its event', async () => {
    await load(); const g = fakeGoogle(); global.fetch = g.fn
    await cs.syncJobToCalendar({ job, customer })
    const r = await cs.removeJobFromCalendar({ job: { ...job, calendar_event_id: 'new1' } })
    expect(r.status).toBe('removed')
  })

  it('no Google token on this device → skipped (never throws), job queued, banner state "reconnect"', async () => {
    await load({ token: null }); const g = fakeGoogle(); global.fetch = g.fn
    const r = await cs.syncJobToCalendar({ job, customer })
    expect(r).toMatchObject({ status: 'skipped', code: 'reconnect' })
    expect(cs.getCalendarStatus()).toMatchObject({ state: 'reconnect', message: 'Calendar not updated — reconnect Google' })
    expect(cs.pendingCalendarOps().map(p => p.jobId)).toEqual(['job-1'])
    expect(g.calls).toHaveLength(0)
  })

  it('expired token: 401 → refresh fails → reconnect banner; queued job syncs after a new Google sign-in', async () => {
    await load({ token: { accessToken: 'ya29.dead', expiresAt: Date.now() + 3600e3, refreshToken: '1//revoked' } })
    const g = fakeGoogle({ failWith: 401 }); global.fetch = g.fn
    const r = await cs.syncJobToCalendar({ job, customer })
    expect(r).toMatchObject({ status: 'skipped', code: 'reconnect' })
    expect(g.calls.some(c => c.url === '/api/refresh-google-token')).toBe(true)
    expect(cs.getCalendarStatus().state).toBe('reconnect')
    // Reconnect: a new session with a provider token arrives
    const g2 = fakeGoogle(); global.fetch = g2.fn
    dbJobFilter.mockResolvedValue([job]); dbCustomerFilter.mockResolvedValue([customer])
    store.captureGoogleTokens({ user: { id: 'u1', email: 'me@genshield' }, provider_token: 'ya29.fresh', provider_refresh_token: '1//new' })
    await vi.waitFor(() => expect(cs.pendingCalendarOps()).toHaveLength(0))
    expect(g2.writes().filter(c => c.method === 'POST')).toHaveLength(1)
    expect(cs.getCalendarStatus().state).toBe('ok')
  })

  it('expired access token + working refresh → refreshes through the staff route and syncs', async () => {
    await load({ token: { accessToken: 'ya29.old', expiresAt: Date.now() - 1000, refreshToken: '1//ok' } })
    const g = fakeGoogle({ refresh: () => ({ ok: true, status: 200, json: async () => ({ access_token: 'ya29.refreshed', expires_in: 3599 }) }) })
    global.fetch = g.fn
    const r = await cs.syncJobToCalendar({ job, customer })
    expect(r.status).toBe('synced')
    const refreshCall = g.fn.mock.calls.find(c => c[0] === '/api/refresh-google-token')
    expect(refreshCall[1].headers.Authorization).toBe('Bearer staff-jwt')
    const gcall = g.fn.mock.calls.find(c => String(c[0]).includes('googleapis'))
    expect(gcall[1].headers.Authorization).toBe('Bearer ya29.refreshed')
  })

  it('Google error (500) → failed (never throws), banner "error", job queued for Retry', async () => {
    await load(); const g = fakeGoogle({ failWith: 500 }); global.fetch = g.fn
    const r = await cs.syncJobToCalendar({ job, customer })
    expect(r.status).toBe('failed')
    expect(cs.getCalendarStatus().state).toBe('error')
    expect(cs.pendingCalendarOps()).toHaveLength(1)
  })

  it('unscheduled job without an event → skipped, no Google calls', async () => {
    await load(); const g = fakeGoogle(); global.fetch = g.fn
    expect((await cs.syncJobToCalendar({ job: { ...job, scheduled_date: null }, customer })).status).toBe('skipped')
    expect(g.calls).toHaveLength(0)
  })

  it('Jobs calendar choice is per user and wins over the default', async () => {
    await load(); const g = fakeGoogle(); global.fetch = g.fn
    cs.setJobsCalendarChoice('me@genshield')
    const r = await cs.syncJobToCalendar({ job, customer })
    expect(r.calendarId).toBe('me@genshield')
    expect(JSON.parse(localStorage.getItem('genflow_jobs_calendar_v1'))).toEqual({ 'me@genshield': 'me@genshield' })
  })
})

describe('googleTokenStore', () => {
  it('captures tokens only for the signed-in user; another user or sign-out forgets them', async () => {
    await load({ token: null })
    store.captureGoogleTokens({ user: { id: 'u1', email: 'a@x' }, provider_token: 't1', provider_refresh_token: 'r1' })
    expect((await store.getAccessToken()).token).toBe('t1')
    store.captureGoogleTokens({ user: { id: 'u1', email: 'a@x' } }) // Supabase refresh: provider tokens gone
    expect((await store.getAccessToken()).token).toBe('t1')
    store.captureGoogleTokens({ user: { id: 'u2', email: 'b@x' } })
    expect((await store.getAccessToken()).code).toBe('reconnect')
    store.captureGoogleTokens({ user: { id: 'u1', email: 'a@x' }, provider_token: 't1' })
    store.captureGoogleTokens(null)
    expect(localStorage.getItem('genflow_google_tokens_v1')).toBeNull()
  })

  it('server_config (bad client secret) is reported, refresh token kept', async () => {
    await load({ token: { accessToken: null, expiresAt: 0, refreshToken: '1//r' } })
    global.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ code: 'server_config' }) }))
    expect(await store.getAccessToken()).toMatchObject({ token: null, code: 'server_config' })
    expect(JSON.parse(localStorage.getItem('genflow_google_tokens_v1')).refreshToken).toBe('1//r')
  })
})
