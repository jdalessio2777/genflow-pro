// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'node:stream'

const getUser = vi.fn()
const sendEmail = vi.fn()
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { getUser: (...a) => getUser(...a) } }) }))
vi.mock('../../api/_lib/sendEmail.js', () => ({ sendEmail: (...a) => sendEmail(...a) }))

const { isAllowedOrigin, requireStaff } = await import('../../api/_lib/staffAuth.js')
const { default: sendEmailHandler } = await import('../../api/send-email.js')

function mockReq({ method = 'POST', headers = {}, body } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.headers = headers
  return req
}

function mockRes() {
  const res = { statusCode: 200, body: undefined, headers: {} }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  res.end = () => res
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v }
  return res
}

const BODY = { to: 'someone@example.com', subject: 'Hi', html: '<p>x</p>' }

beforeEach(() => {
  getUser.mockReset()
  sendEmail.mockReset()
  sendEmail.mockResolvedValue({ id: 'email_1' })
})

describe('staffAuth', () => {
  it('allows our origins and requests with no Origin', () => {
    expect(isAllowedOrigin(undefined)).toBe(true)
    expect(isAllowedOrigin('https://genflow-pro.vercel.app')).toBe(true)
    expect(isAllowedOrigin('https://genflow-otfwtpajw-jdalessio2777s-projects.vercel.app')).toBe(true)
    expect(isAllowedOrigin('https://genflow-pro-git-main-jdalessio2777s-projects.vercel.app')).toBe(true)
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true)
  })

  it('rejects other origins, including look-alikes', () => {
    expect(isAllowedOrigin('https://evil.example.com')).toBe(false)
    expect(isAllowedOrigin('https://genflow-pro.vercel.app.evil.com')).toBe(false)
    expect(isAllowedOrigin('https://genflow-x-otherteam-projects.vercel.app')).toBe(false)
    expect(isAllowedOrigin('http://genflow-pro.vercel.app')).toBe(false)
    expect(isAllowedOrigin('https://genshieldservice.com')).toBe(false)
  })

  it('requireStaff: missing token → 401 without calling Supabase', async () => {
    const r = await requireStaff({ headers: {} })
    expect(r).toMatchObject({ ok: false, status: 401 })
    expect(getUser).not.toHaveBeenCalled()
  })

  it('requireStaff: token Supabase rejects → 401', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid JWT' } })
    expect(await requireStaff({ headers: { authorization: 'Bearer garbage' } })).toMatchObject({ ok: false, status: 401 })
    expect(getUser).toHaveBeenCalledWith('garbage')
  })

  it('requireStaff: valid user not on the staff list → 403', async () => {
    getUser.mockResolvedValue({ data: { user: { email: 'outsider@example.com' } }, error: null })
    expect(await requireStaff({ headers: { authorization: 'Bearer t' } })).toMatchObject({ ok: false, status: 403 })
  })

  it('requireStaff: staff user → ok (case-insensitive email)', async () => {
    getUser.mockResolvedValue({ data: { user: { email: 'Jeremy.Dalessio@genshieldservice.com' } }, error: null })
    expect(await requireStaff({ headers: { authorization: 'Bearer t' } })).toMatchObject({ ok: true })
  })
})

describe('POST /api/send-email', () => {
  it('no token → 401 and nothing sent', async () => {
    const res = mockRes()
    await sendEmailHandler(mockReq({ body: BODY }), res)
    expect(res.statusCode).toBe(401)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('non-staff token → 403 and nothing sent', async () => {
    getUser.mockResolvedValue({ data: { user: { email: 'outsider@example.com' } }, error: null })
    const res = mockRes()
    await sendEmailHandler(mockReq({ headers: { authorization: 'Bearer t' }, body: BODY }), res)
    expect(res.statusCode).toBe(403)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('foreign Origin → 403 before the token is even checked', async () => {
    const res = mockRes()
    await sendEmailHandler(mockReq({ headers: { origin: 'https://evil.example.com', authorization: 'Bearer t' }, body: BODY }), res)
    expect(res.statusCode).toBe(403)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
    expect(getUser).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('staff token → sends; caller cannot set from/replyTo', async () => {
    getUser.mockResolvedValue({ data: { user: { email: 'genflow-qa-test@genshieldservice.com' } }, error: null })
    const res = mockRes()
    await sendEmailHandler(mockReq({
      headers: { origin: 'https://genflow-pro.vercel.app', authorization: 'Bearer t' },
      body: { ...BODY, from: 'CEO <ceo@genshieldservice.com>', replyTo: 'attacker@example.com', reply_to: 'attacker@example.com' },
    }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true, id: 'email_1' })
    expect(sendEmail).toHaveBeenCalledWith({ to: BODY.to, subject: BODY.subject, html: BODY.html, internal: false })
    expect(res.headers['access-control-allow-origin']).toBe('https://genflow-pro.vercel.app')
  })

  it('preflight: our origin → 204 with CORS headers; other origin → 403 without', async () => {
    const ok = mockRes()
    await sendEmailHandler(mockReq({ method: 'OPTIONS', headers: { origin: 'https://genflow-pro.vercel.app' } }), ok)
    expect(ok.statusCode).toBe(204)
    expect(ok.headers['access-control-allow-headers']).toMatch(/Authorization/)
    const bad = mockRes()
    await sendEmailHandler(mockReq({ method: 'OPTIONS', headers: { origin: 'https://evil.example.com' } }), bad)
    expect(bad.statusCode).toBe(403)
    expect(bad.headers['access-control-allow-origin']).toBeUndefined()
  })
})

describe('integrationsCore.SendEmail (client)', () => {
  it('sends the session token and does not retry 4xx', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabaseClient', () => ({
      supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok123' } } }) } },
    }))
    const fetchMock = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: 'Not allowed' }) }))
    vi.stubGlobal('fetch', fetchMock)
    const { integrationsCore } = await import('@/lib/coreIntegrations')
    await expect(integrationsCore.SendEmailWithRetry(BODY, [0, 0])).rejects.toThrow('Not allowed')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok123')
    vi.unstubAllGlobals()
  })
})
