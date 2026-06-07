import { describe, it, expect, vi, beforeEach } from 'vitest'

// Import the handler directly — it's a default export Vercel serverless function
import handler from '../../api/refresh-google-token.js'

function makeReq(overrides = {}) {
  return {
    method: 'POST',
    body: { refresh_token: 'mock-refresh-token' },
    ...overrides,
  }
}

function makeRes() {
  const res = {
    _status: null,
    _body: null,
    status(code) { this._status = code; return this },
    json(body) { this._body = body; return this },
  }
  return res
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.VITE_GOOGLE_CLIENT_ID = 'test-client-id'
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
})

describe('api/refresh-google-token handler', () => {
  it('returns 405 for non-POST methods', async () => {
    global.fetch = vi.fn()
    const req = makeReq({ method: 'GET' })
    const res = makeRes()
    await handler(req, res)
    expect(res._status).toBe(405)
    expect(res._body).toMatchObject({ error: 'Method not allowed' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns 400 when no refresh_token provided', async () => {
    global.fetch = vi.fn()
    const req = makeReq({ body: {} })
    const res = makeRes()
    await handler(req, res)
    expect(res._status).toBe(400)
    expect(res._body).toMatchObject({ error: 'refresh_token is required' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('calls Google token endpoint with correct URL', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'new-token', expires_in: 3600 }),
    })
    const req = makeReq()
    const res = makeRes()
    await handler(req, res)
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url] = fetch.mock.calls[0]
    expect(url).toBe('https://oauth2.googleapis.com/token')
  })

  it('sends client_id and client_secret from env vars', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'new-token', expires_in: 3600 }),
    })
    const req = makeReq()
    const res = makeRes()
    await handler(req, res)
    const [, opts] = fetch.mock.calls[0]
    const body = opts.body.toString()
    expect(body).toContain('client_id=test-client-id')
    expect(body).toContain('client_secret=test-client-secret')
    expect(body).toContain('grant_type=refresh_token')
    expect(body).toContain('refresh_token=mock-refresh-token')
  })

  it('returns access_token and expires_in on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'ya29.new-token', expires_in: 3599 }),
    })
    const req = makeReq()
    const res = makeRes()
    await handler(req, res)
    expect(res._status).toBe(200)
    expect(res._body).toMatchObject({ access_token: 'ya29.new-token', expires_in: 3599 })
  })

  it('forwards Google error status when Google returns an error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }),
    })
    const req = makeReq()
    const res = makeRes()
    await handler(req, res)
    expect(res._status).toBe(400)
    expect(res._body).toMatchObject({ error: 'Token has been expired or revoked.' })
  })

  it('falls back to error field when error_description is absent', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'unauthorized_client' }),
    })
    const req = makeReq()
    const res = makeRes()
    await handler(req, res)
    expect(res._status).toBe(401)
    expect(res._body).toMatchObject({ error: 'unauthorized_client' })
  })
})
