// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const createClient = vi.fn()
const sendEmail = vi.fn()
vi.mock('@supabase/supabase-js', () => ({ createClient: (...a) => createClient(...a) }))
vi.mock('../../api/_lib/sendEmail.js', () => ({ sendEmail: (...a) => sendEmail(...a) }))

const { safeEqual, isAuthorizedCron, isAuthorizedManual } = await import('../../api/_lib/cronAuth.js')
const { default: checkRenewals } = await import('../../api/check-renewals.js')

function mockRes() {
  const res = { statusCode: 200, body: undefined }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}

describe('cronAuth helpers', () => {
  it('safeEqual compares exactly and never throws', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
    expect(safeEqual(undefined, 'abc')).toBe(false)
    expect(safeEqual('abc', undefined)).toBe(false)
  })

  it('requires Authorization: Bearer <CRON_SECRET>', () => {
    const env = { CRON_SECRET: 's3cret' }
    expect(isAuthorizedCron({ authorization: 'Bearer s3cret' }, env)).toBe(true)
    expect(isAuthorizedCron({ authorization: 'Bearer wrong' }, env)).toBe(false)
    expect(isAuthorizedCron({ authorization: 's3cret' }, env)).toBe(false)
    expect(isAuthorizedCron({}, env)).toBe(false)
    expect(isAuthorizedCron({ 'x-vercel-cron-authorization': 'anything' }, env)).toBe(false)
  })

  it('fails closed when CRON_SECRET / REPORT_SECRET are unset or empty', () => {
    expect(isAuthorizedCron({ authorization: 'Bearer ' }, {})).toBe(false)
    expect(isAuthorizedCron({ authorization: 'Bearer ' }, { CRON_SECRET: '' })).toBe(false)
    expect(isAuthorizedCron({ authorization: 'Bearer undefined' }, {})).toBe(false)
    expect(isAuthorizedManual({ 'x-report-secret': '' }, { REPORT_SECRET: '' })).toBe(false)
    expect(isAuthorizedManual({}, {})).toBe(false)
    expect(isAuthorizedManual({ 'x-report-secret': 'm' }, { REPORT_SECRET: 'm' })).toBe(true)
  })
})

describe('api/check-renewals auth', () => {
  const saved = { ...process.env }
  beforeEach(() => {
    createClient.mockReset()
    sendEmail.mockReset()
    process.env.CRON_SECRET = 'real-cron-secret'
    process.env.REPORT_SECRET = 'real-report-secret'
  })
  afterEach(() => { process.env = { ...saved } })

  const rejected = [
    ['no auth header', {}],
    ['bogus bearer', { authorization: 'Bearer nope' }],
    ['only x-vercel-cron-authorization', { 'x-vercel-cron-authorization': 'Bearer real-cron-secret' }],
    ['wrong manual secret', { 'x-report-secret': 'nope' }],
  ]
  for (const [name, headers] of rejected) {
    it(`401 + no DB/email for ${name}`, async () => {
      const res = mockRes()
      await checkRenewals({ headers, query: {} }, res)
      expect(res.statusCode).toBe(401)
      expect(createClient).not.toHaveBeenCalled()
      expect(sendEmail).not.toHaveBeenCalled()
    })
  }

  it('401 even with x-vercel-cron-authorization when CRON_SECRET is unset', async () => {
    delete process.env.CRON_SECRET
    delete process.env.REPORT_SECRET
    const res = mockRes()
    await checkRenewals({ headers: { 'x-vercel-cron-authorization': '1', authorization: 'Bearer ' }, query: {} }, res)
    expect(res.statusCode).toBe(401)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('passes auth with the real bearer token (reaches the DB client)', async () => {
    createClient.mockImplementation(() => { throw new Error('stop-after-auth') })
    const res = mockRes()
    try { await checkRenewals({ headers: { authorization: 'Bearer real-cron-secret' }, query: {} }, res) } catch { /* expected */ }
    expect(createClient).toHaveBeenCalledTimes(1)
    expect(res.statusCode).not.toBe(401)
  })
})
