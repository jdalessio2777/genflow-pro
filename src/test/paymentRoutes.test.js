// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'node:stream'
import { owedCents, computeCharge, surchargeCentsFor, validateClientSurcharge, paymentCoversInvoice } from '../lib/utils/paymentAmounts.js'

// H1 (E-01/B-03): payment routes are staff-only and compute every amount from
// the invoice row + the card's funding type from Stripe.
const getUser = vi.fn()
process.env.SUPABASE_URL ||= 'http://supabase.test'; process.env.SUPABASE_ANON_KEY ||= 'anon-test'
let invoiceRow = null
let appSettings = []
const dbUpdate = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: (...a) => getUser(...a) },
    rpc: async (fn) => ({ data: fn === 'is_staff', error: null }),
    from: (table) => {
      if (table === 'app_settings') {
        return { select: () => ({ in: async () => ({ data: appSettings, error: null }) }) }
      }
      const q = {
        select: () => q, eq: () => q,
        single: async () => ({ data: invoiceRow, error: invoiceRow ? null : { message: 'nf' } }),
        update: (v) => { dbUpdate(v); return { eq: async () => ({}) } },
      }
      return q
    },
  }),
}))
const piCreate = vi.fn(async (args) => ({ id: 'pi_1', client_secret: 'cs_1', ...args }))
const piRetrieve = vi.fn(async () => ({ id: 'pi_1', status: 'requires_payment_method', metadata: { invoice_id: 'inv1' } }))
const piUpdate = vi.fn(async () => ({}))
let funding = 'credit'
const pmRetrieve = vi.fn(async () => ({ id: 'pm_1', card: { funding } }))
let webhookEvent = null
vi.mock('stripe', () => ({
  default: function Stripe() {
    return {
      paymentIntents: { create: piCreate, retrieve: piRetrieve, update: piUpdate },
      paymentMethods: { retrieve: pmRetrieve },
      webhooks: { constructEvent: () => webhookEvent },
    }
  },
}))

const { default: createHandler } = await import('../../api/create-payment-intent.js')
const { default: updateHandler } = await import('../../api/update-payment-intent.js')
const { default: webhookHandler } = await import('../../api/stripe-webhook.js')

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
const STAFF = { authorization: 'Bearer good', origin: 'https://genflow-pro.vercel.app' }
const INV = { id: 'inv1', status: 'sent', parts_total: 60, labor_total: 40, tax_amount: 6.63, total: 106.63, invoice_number: 'INV-1' }

beforeEach(() => {
  vi.clearAllMocks()
  invoiceRow = { ...INV }
  appSettings = []
  funding = 'credit'
  getUser.mockImplementation(async (t) => t === 'good'
    ? { data: { user: { email: 'genflow-qa-test@genshieldservice.com' } }, error: null }
    : { data: null, error: { message: 'bad' } })
})

describe('paymentAmounts', () => {
  it('owed = parts + labor + tax in cents; surcharge credit-only', () => {
    expect(owedCents(INV)).toBe(10663)
    // (0.027 x 10663 + 5) / 0.973 = 301.03 -> 301; cap 0.027 x 10964 + 5 = 301.03 ok
    expect(surchargeCentsFor(10663, 'credit')).toBe(301)
    for (const f of ['debit', 'prepaid', 'unknown', null]) expect(surchargeCentsFor(10663, f)).toBe(0)
  })
  it('refuses paid, zero, negative and stale invoices', () => {
    expect(computeCharge({ ...INV, status: 'paid' }).ok).toBe(false)
    expect(computeCharge({ ...INV, parts_total: 0, labor_total: 0, tax_amount: 0, total: 0 }).ok).toBe(false)
    expect(computeCharge({ ...INV, parts_total: -200, total: -93.37 }).ok).toBe(false)
    expect(computeCharge({ ...INV, total: 1 }).status).toBe(409)
    expect(computeCharge(INV, 'credit')).toMatchObject({ ok: true, baseCents: 10663, surchargeCents: 301, totalCents: 10964 })
  })
  it('client surcharge: negative / NaN rejected; absent ok', () => {
    expect(validateClientSurcharge(undefined).ok).toBe(true)
    expect(validateClientSurcharge(3.2).ok).toBe(true)
    expect(validateClientSurcharge(-50).ok).toBe(false)
    expect(validateClientSurcharge('abc').ok).toBe(false)
  })
  it('paymentCoversInvoice', () => {
    expect(paymentCoversInvoice(10663, INV)).toBe(true)
    expect(paymentCoversInvoice(5000, INV)).toBe(false)
  })
})

describe('create-payment-intent', () => {
  it('no token → 401, nothing created', async () => {
    const res = mockRes()
    await createHandler(mockReq({ body: { invoice_id: 'inv1' } }), res)
    expect(res.statusCode).toBe(401)
    expect(piCreate).not.toHaveBeenCalled()
  })
  it('foreign origin → 403 and no CORS header', async () => {
    const res = mockRes()
    await createHandler(mockReq({ headers: { ...STAFF, origin: 'https://evil.example.com' }, body: { invoice_id: 'inv1' } }), res)
    expect(res.statusCode).toBe(403)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
  it('staff → amount from the invoice row, request amount ignored', async () => {
    const res = mockRes()
    await createHandler(mockReq({ headers: STAFF, body: { invoice_id: 'inv1', amount: 1 } }), res)
    expect(res.statusCode).toBe(200)
    expect(piCreate.mock.calls[0][0].amount).toBe(10663)
  })
})

describe('update-payment-intent', () => {
  const body = { payment_intent_id: 'pi_1', invoice_id: 'inv1', payment_method_id: 'pm_1' }
  it('no token → 401', async () => {
    const res = mockRes()
    await updateHandler(mockReq({ body }), res)
    expect(res.statusCode).toBe(401)
    expect(piUpdate).not.toHaveBeenCalled()
  })
  it('negative surcharge → 400, nothing updated', async () => {
    const res = mockRes()
    await updateHandler(mockReq({ headers: STAFF, body: { ...body, surcharge_amount: -50 } }), res)
    expect(res.statusCode).toBe(400)
    expect(piUpdate).not.toHaveBeenCalled()
  })
  it('credit card → server adds the Stripe fee; client surcharge/amount ignored', async () => {
    const res = mockRes()
    await updateHandler(mockReq({ headers: STAFF, body: { ...body, surcharge_amount: 0, amount: 1, total: 1 } }), res)
    expect(res.statusCode).toBe(200)
    expect(piUpdate.mock.calls[0][1].amount).toBe(10964)
    expect(piUpdate.mock.calls[0][1].payment_method).toBe('pm_1')
    expect(res.body).toMatchObject({ surcharge: 3.01, total: 109.64, funding: 'credit' })
  })
  it('rate comes from the shared setting (app_settings card_surcharge_rate)', async () => {
    appSettings = [{ key: 'card_surcharge_rate', value: '2.5' }]
    const res = mockRes()
    await updateHandler(mockReq({ headers: STAFF, body }), res)
    // 2.5% + 5c: largest s with s <= round(0.025 x (10663 + s) + 5): s = 279 (0.025 x 10942 + 5 = 278.55 -> 279)
    expect(piUpdate.mock.calls[0][1].amount).toBe(10663 + 279)
  })
  it('a bad saved rate (above 4%) falls back to the 2.7% default', async () => {
    appSettings = [{ key: 'card_surcharge_rate', value: '9' }]
    const res = mockRes()
    await updateHandler(mockReq({ headers: STAFF, body }), res)
    expect(piUpdate.mock.calls[0][1].amount).toBe(10964)
  })
  it('debit card → no surcharge even if the client asks for one', async () => {
    funding = 'debit'
    const res = mockRes()
    await updateHandler(mockReq({ headers: STAFF, body: { ...body, surcharge_amount: 3.2 } }), res)
    expect(piUpdate.mock.calls[0][1].amount).toBe(10663)
    expect(res.body.surcharge).toBe(0)
  })
  it('PaymentIntent of another invoice → 403', async () => {
    piRetrieve.mockResolvedValueOnce({ id: 'pi_1', status: 'requires_payment_method', metadata: { invoice_id: 'other' } })
    const res = mockRes()
    await updateHandler(mockReq({ headers: STAFF, body }), res)
    expect(res.statusCode).toBe(403)
  })
})

describe('stripe-webhook', () => {
  it('underpaid PaymentIntent is NOT marked paid', async () => {
    webhookEvent = { type: 'payment_intent.succeeded', data: { object: { id: 'pi_1', amount_received: 5000, metadata: { invoice_id: 'inv1', surcharge_amount: '-56.63' } } } }
    const res = mockRes()
    await webhookHandler(mockReq({ headers: { 'stripe-signature': 's' }, body: {} }), res)
    expect(dbUpdate).not.toHaveBeenCalled()
    expect(res.body.skipped).toBe('underpaid')
  })
  it('full payment → paid with surcharge = received − owed', async () => {
    webhookEvent = { type: 'payment_intent.succeeded', data: { object: { id: 'pi_1', amount_received: 10983, metadata: { invoice_id: 'inv1' } } } }
    const res = mockRes()
    await webhookHandler(mockReq({ headers: { 'stripe-signature': 's' }, body: {} }), res)
    expect(dbUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid', surcharge_amount: 3.2, total: 109.83 }))
  })
})

describe('partial payments (only once invoices.amount_paid exists)', () => {
  it('card charges only the balance; the surcharge is on the balance', () => {
    const inv = { ...INV, amount_paid: 50 }
    // balance 5663: (152.901 + 5)/0.973 = 162.28 -> 162; cap 0.027 x 5825 + 5 = 162.28 ok
    expect(computeCharge(inv, 'credit')).toMatchObject({ ok: true, baseCents: 5663, surchargeCents: 162, totalCents: 5825 })
    expect(computeCharge(inv, 'debit')).toMatchObject({ baseCents: 5663, surchargeCents: 0 })
    expect(paymentCoversInvoice(5663, inv)).toBe(true)
    expect(paymentCoversInvoice(5662, inv)).toBe(false)
  })
  it('without the column nothing changes', () => {
    expect(computeCharge(INV, 'debit').baseCents).toBe(10663)
  })
  it('webhook settles the balance: amount_paid = owed, surcharge = received − balance', async () => {
    invoiceRow = { ...INV, status: 'partial', amount_paid: 50 }
    webhookEvent = { type: 'payment_intent.succeeded', data: { object: { id: 'pi_2', amount_received: 5825, metadata: { invoice_id: 'inv1' } } } }
    const res = mockRes()
    await webhookHandler(mockReq({ headers: { 'stripe-signature': 's' }, body: {} }), res)
    expect(dbUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid', surcharge_amount: 1.62, total: 108.25, amount_paid: 106.63 }))
  })
})
