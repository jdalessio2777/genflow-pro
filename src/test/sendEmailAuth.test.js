// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'node:stream'

const getUser = vi.fn()
const sendEmail = vi.fn()
const rpc = vi.fn()
const createClientCalls = []
process.env.SUPABASE_URL ||= 'http://supabase.test'
process.env.SUPABASE_ANON_KEY ||= 'anon-test'
vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args) => {
    createClientCalls.push(args)
    return { auth: { getUser: (...a) => getUser(...a) }, rpc: (...a) => rpc(...a) }
  },
}))
vi.mock('../../api/_lib/sendEmail.js', () => ({ sendEmail: (...a) => sendEmail(...a) }))

const { isAllowedOrigin, requireStaff, isStaffToken } = await import('../../api/_lib/staffAuth.js')
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
  createClientCalls.length = 0
  rpc.mockReset()
  rpc.mockResolvedValue({ data: true, error: null })
  getUser.mockReset()
  sendEmail.mockReset()
  sendEmail.mockResolvedValue({ id: 'email_1' })
})

describe('staffAuth', () => {
  const PREVIEW_ENV = {
    VERCEL_ENV: 'preview',
    VERCEL_URL: 'genflow-5t6tw0phk-jdalessio2777s-projects.vercel.app',
    VERCEL_BRANCH_URL: 'genflow-pro-git-fix-send-email-auth-jdalessio2777s-projects.vercel.app',
    VERCEL_PROJECT_PRODUCTION_URL: 'genflow-pro.vercel.app',
  }
  const PROD_ENV = {
    VERCEL_ENV: 'production',
    VERCEL_URL: 'genflow-abc123xyz-jdalessio2777s-projects.vercel.app',
    VERCEL_BRANCH_URL: 'genflow-pro-git-main-jdalessio2777s-projects.vercel.app',
    VERCEL_PROJECT_PRODUCTION_URL: 'genflow-pro.vercel.app',
  }

  it('production origin is always allowed; no Origin header passes to the token check', () => {
    expect(isAllowedOrigin('https://genflow-pro.vercel.app', PROD_ENV)).toBe(true)
    expect(isAllowedOrigin('https://genflow-pro.vercel.app', PREVIEW_ENV)).toBe(true)
    expect(isAllowedOrigin('https://genflow-pro.vercel.app', {})).toBe(true)
    expect(isAllowedOrigin(undefined, PROD_ENV)).toBe(true)
  })

  it("a deployment accepts exactly its own URLs, not other previews'", () => {
    expect(isAllowedOrigin('https://genflow-5t6tw0phk-jdalessio2777s-projects.vercel.app', PREVIEW_ENV)).toBe(true)
    expect(isAllowedOrigin('https://genflow-pro-git-fix-send-email-auth-jdalessio2777s-projects.vercel.app', PREVIEW_ENV)).toBe(true)
    expect(isAllowedOrigin('https://genflow-pro-git-main-jdalessio2777s-projects.vercel.app', PROD_ENV)).toBe(true)
    expect(isAllowedOrigin('https://genflow-otfwtpajw-jdalessio2777s-projects.vercel.app', PREVIEW_ENV)).toBe(false)
  })

  it('rejects other sites and look-alikes', () => {
    for (const env of [PREVIEW_ENV, PROD_ENV]) {
      expect(isAllowedOrigin('https://evil.example.com', env)).toBe(false)
      expect(isAllowedOrigin('https://genflow-pro.vercel.app.evil.com', env)).toBe(false)
      expect(isAllowedOrigin('https://evil-genflow-pro.vercel.app', env)).toBe(false)
      // another project whose name mimics our preview URLs (would get <name>.vercel.app)
      expect(isAllowedOrigin('https://genflow-x-jdalessio2777s-projects.vercel.app', env)).toBe(false)
      expect(isAllowedOrigin('https://anything.vercel.app', env)).toBe(false)
      expect(isAllowedOrigin('http://genflow-pro.vercel.app', env)).toBe(false)
      expect(isAllowedOrigin('https://genflow-pro.vercel.app/', env)).toBe(false)
      expect(isAllowedOrigin('https://genshieldservice.com', env)).toBe(false)
    }
  })

  it('localhost dev origin only outside production', () => {
    expect(isAllowedOrigin('http://localhost:5173', PREVIEW_ENV)).toBe(true)
    expect(isAllowedOrigin('http://localhost:5173', PROD_ENV)).toBe(false)
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

  // B6: staff = public.staff via is_staff(), asked as the caller.
  it('requireStaff: valid user, is_staff() false → 403', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-out', email: 'outsider@example.com' } }, error: null })
    rpc.mockResolvedValue({ data: false, error: null })
    expect(await requireStaff({ headers: { authorization: 'Bearer t' } })).toMatchObject({ ok: false, status: 403 })
  })

  it('requireStaff: is_staff() true → ok, whatever the email (the staff table is the only list)', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-new', email: 'new.tech@example.com' } }, error: null })
    expect(await requireStaff({ headers: { authorization: 'Bearer t' } })).toMatchObject({ ok: true })
    expect(rpc).toHaveBeenCalledWith('is_staff')
  })

  it("is_staff() is called with the anon key + the CALLER's token (not the service role)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.c' } }, error: null })
    await requireStaff({ headers: { authorization: 'Bearer caller-token' } })
    const asCaller = createClientCalls.find(([, key]) => key === process.env.SUPABASE_ANON_KEY)
    expect(asCaller).toBeTruthy()
    expect(asCaller[2].global.headers.Authorization).toBe('Bearer caller-token')
  })

  it('requireStaff: is_staff() errors → 503 (never treated as staff)', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.c' } }, error: null })
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await requireStaff({ headers: { authorization: 'Bearer t' } })).toMatchObject({ ok: false, status: 503 })
    rpc.mockRejectedValue(new Error('network down'))
    expect(await requireStaff({ headers: { authorization: 'Bearer t' } })).toMatchObject({ ok: false, status: 503 })
  })

  it('requireStaff: a non-boolean / null answer is not staff', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.c' } }, error: null })
    rpc.mockResolvedValue({ data: null, error: null })
    expect(await requireStaff({ headers: { authorization: 'Bearer t' } })).toMatchObject({ ok: false, status: 403 })
  })

  it('isStaffToken: missing anon key config → throws; slow check → times out', async () => {
    await expect(isStaffToken('t', { env: { SUPABASE_URL: 'http://x' } })).rejects.toThrow(/not configured/)
    rpc.mockReturnValue(new Promise(() => {}))
    await expect(isStaffToken('t', { env: { SUPABASE_URL: 'http://x', VITE_SUPABASE_ANON_KEY: 'k' }, timeoutMs: 20 })).rejects.toThrow(/timed out/)
  })

  it('requireStaff: getUser rejects the token → 401 and is_staff() is never asked', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid JWT' } })
    expect(await requireStaff({ headers: { authorization: 'Bearer anon-key-as-bearer' } })).toMatchObject({ ok: false, status: 401 })
    expect(rpc).not.toHaveBeenCalled()
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
    rpc.mockResolvedValue({ data: false, error: null })
    const res = mockRes()
    await sendEmailHandler(mockReq({ headers: { authorization: 'Bearer t' }, body: BODY }), res)
    expect(res.statusCode).toBe(403)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('staff check errors → 503 and nothing sent', async () => {
    getUser.mockResolvedValue({ data: { user: { email: 'genflow-qa-test@genshieldservice.com' } }, error: null })
    rpc.mockResolvedValue({ data: null, error: { message: 'db down' } })
    const res = mockRes()
    await sendEmailHandler(mockReq({ headers: { authorization: 'Bearer t' }, body: BODY }), res)
    expect(res.statusCode).toBe(503)
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

const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { error: (...a) => toastError(...a) } }))

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

  it('401: shows a persistent "Email NOT sent" message, no retry', async () => {
    vi.resetModules()
    toastError.mockReset()
    vi.doMock('@/lib/supabaseClient', () => ({
      supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'expired' } } }) } },
    }))
    const fetchMock = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: 'Invalid session' }) }))
    vi.stubGlobal('fetch', fetchMock)
    const { integrationsCore } = await import('@/lib/coreIntegrations')
    await expect(integrationsCore.SendEmailWithRetry(BODY, [0, 0])).rejects.toThrow('Invalid session')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/^Email NOT sent: your sign-in has expired/), expect.objectContaining({ duration: Infinity }))
    vi.unstubAllGlobals()
  })

  it('no session: persistent message, no request made', async () => {
    vi.resetModules()
    toastError.mockReset()
    vi.doMock('@/lib/supabaseClient', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { integrationsCore } = await import('@/lib/coreIntegrations')
    await expect(integrationsCore.SendEmailWithRetry(BODY, [0, 0])).rejects.toThrow('Not signed in')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/^Email NOT sent/), expect.objectContaining({ duration: Infinity }))
    vi.unstubAllGlobals()
  })
})
