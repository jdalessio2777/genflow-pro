import { describe, it, expect, vi, beforeEach } from 'vitest'

// B3: /api/refresh-google-token is staff-only and maps Google's errors to codes
// the app acts on ("reconnect" vs "server_config").
const getUser = vi.fn()
const rpc = vi.fn() // is_staff() as the caller (B6)
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { getUser: (...a) => getUser(...a) }, rpc: (...a) => rpc(...a) }) }))
const { default: handler } = await import('../../api/refresh-google-token.js')

function makeReq(overrides = {}) {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer staff-token' },
    body: { refresh_token: 'mock-refresh-token' },
    ...overrides,
  }
}

function makeRes() {
  return {
    _status: null, _body: null, headers: {},
    status(code) { this._status = code; return this },
    json(body) { this._body = body; return this },
    end() { return this },
    setHeader(k, v) { this.headers[k] = v },
  }
}

const googleOk = (body) => vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body })
const googleErr = (status, body) => vi.fn().mockResolvedValue({ ok: false, status, json: async () => body })

beforeEach(() => {
  vi.clearAllMocks()
  process.env.VITE_GOOGLE_CLIENT_ID = 'test-client-id'
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
  process.env.SUPABASE_URL ||= 'https://example.supabase.co'
  process.env.SUPABASE_ANON_KEY ||= 'anon-test-key'
  getUser.mockResolvedValue({ data: { user: { email: 'jeremy.dalessio@genshieldservice.com' } }, error: null })
  rpc.mockResolvedValue({ data: true, error: null })
})

describe('api/refresh-google-token handler', () => {
  it('returns 405 for non-POST methods', async () => {
    global.fetch = vi.fn()
    const res = makeRes()
    await handler(makeReq({ method: 'GET' }), res)
    expect(res._status).toBe(405)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses a request without a staff login (401) and never calls Google', async () => {
    global.fetch = vi.fn()
    const res = makeRes()
    await handler(makeReq({ headers: {} }), res)
    expect(res._status).toBe(401)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses a signed-in non-staff user (403)', async () => {
    getUser.mockResolvedValue({ data: { user: { email: 'stranger@example.com' } }, error: null })
    rpc.mockResolvedValue({ data: false, error: null })
    global.fetch = vi.fn()
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res._status).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refuses a foreign Origin (403)', async () => {
    global.fetch = vi.fn()
    const res = makeRes()
    await handler(makeReq({ headers: { authorization: 'Bearer x', origin: 'https://evil.example' } }), res)
    expect(res._status).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns 400 when no refresh_token provided', async () => {
    global.fetch = vi.fn()
    const res = makeRes()
    await handler(makeReq({ body: {} }), res)
    expect(res._status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('posts client id, secret and refresh token to Google and returns the new access token', async () => {
    global.fetch = googleOk({ access_token: 'ya29.new-token', expires_in: 3599 })
    const res = makeRes()
    await handler(makeReq(), res)
    const [url, opts] = fetch.mock.calls[0]
    expect(url).toBe('https://oauth2.googleapis.com/token')
    const body = opts.body.toString()
    expect(body).toContain('client_id=test-client-id')
    expect(body).toContain('client_secret=test-client-secret')
    expect(body).toContain('grant_type=refresh_token')
    expect(body).toContain('refresh_token=mock-refresh-token')
    expect(res._status).toBe(200)
    expect(res._body).toMatchObject({ access_token: 'ya29.new-token', expires_in: 3599 })
  })

  it('invalid_grant (revoked refresh token) → code "reconnect"', async () => {
    global.fetch = googleErr(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res._status).toBe(400)
    expect(res._body).toMatchObject({ error: 'Token has been expired or revoked.', code: 'reconnect' })
  })

  it('invalid_client (wrong GOOGLE_CLIENT_SECRET, audit E-03) → code "server_config"', async () => {
    global.fetch = googleErr(401, { error: 'invalid_client', error_description: 'The provided client secret is invalid.' })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res._status).toBe(401)
    expect(res._body).toMatchObject({ code: 'server_config' })
  })

  it('missing secret on the server → 500 server_config without calling Google', async () => {
    delete process.env.GOOGLE_CLIENT_SECRET
    global.fetch = vi.fn()
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res._status).toBe(500)
    expect(res._body.code).toBe('server_config')
    expect(fetch).not.toHaveBeenCalled()
  })
})
