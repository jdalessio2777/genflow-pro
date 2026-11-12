// @vitest-environment node
// Run 13, Part F: Stripe's exact fee on every card payment becomes an expense.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'node:stream'
import { chargeIdOf, feeCentsOf, centsToDollars, fetchChargeWithFee, recordFeeForPaymentIntent } from '../../api/_lib/stripeFees.js'
import { computeFinance, CARD_FEES_CATEGORY, EXPENSE_CATEGORIES } from '../lib/finance/core.js'

process.env.SUPABASE_URL ||= 'http://supabase.test'
const rpc = vi.fn()
const dbUpdate = vi.fn()
let invoiceRow = null
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: (...a) => rpc(...a),
    from: () => {
      const q = {
        select: () => q, eq: () => q,
        single: async () => ({ data: invoiceRow, error: invoiceRow ? null : { message: 'nf' } }),
        update: (v) => { dbUpdate(v); return { eq: async () => ({}) } },
      }
      return q
    },
  }),
}))
let webhookEvent = null
const chargeRetrieve = vi.fn()
vi.mock('stripe', () => ({
  default: function Stripe() {
    return { charges: { retrieve: chargeRetrieve }, webhooks: { constructEvent: () => webhookEvent } }
  },
}))
const { default: webhookHandler } = await import('../../api/stripe-webhook.js')

function mockReq() {
  const req = Readable.from([Buffer.from('{}')])
  req.method = 'POST'; req.headers = { 'stripe-signature': 's' }
  return req
}
function mockRes() {
  const res = { statusCode: 200 }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  res.end = () => res
  return res
}
const charge = (over = {}) => ({ id: 'ch_1', amount: 51447, created: 1794419557, status: 'succeeded', paid: true, balance_transaction: { fee: 1522 }, ...over })
const noWait = { delays: [1, 1, 1], wait: async () => {} }

beforeEach(() => {
  rpc.mockReset(); dbUpdate.mockReset(); chargeRetrieve.mockReset(); invoiceRow = null
  rpc.mockResolvedValue({ data: 'recorded', error: null })
})

describe('helpers', () => {
  it('reads the charge id and the exact fee', () => {
    expect(chargeIdOf({ latest_charge: 'ch_9' })).toBe('ch_9')
    expect(chargeIdOf({ latest_charge: { id: 'ch_8' } })).toBe('ch_8')
    expect(chargeIdOf({})).toBe(null)
    expect(feeCentsOf(charge())).toBe(1522)
    expect(feeCentsOf(charge({ balance_transaction: 'txn_1' }))).toBe(null) // not expanded
    expect(feeCentsOf(charge({ balance_transaction: null }))).toBe(null)
    expect(centsToDollars(1522)).toBe(15.22)
    expect(centsToDollars(8)).toBe(0.08)
  })
  it('retries while the fee is missing, then gives up without guessing', async () => {
    chargeRetrieve.mockResolvedValue(charge({ balance_transaction: null }))
    const stripe = { charges: { retrieve: chargeRetrieve } }
    const r = await fetchChargeWithFee(stripe, 'ch_1', noWait)
    expect(r.feeCents).toBe(null)
    expect(chargeRetrieve).toHaveBeenCalledTimes(4)
  })
  it('stops retrying as soon as the fee appears', async () => {
    chargeRetrieve.mockResolvedValueOnce(charge({ balance_transaction: null })).mockResolvedValueOnce(charge())
    const r = await fetchChargeWithFee({ charges: { retrieve: chargeRetrieve } }, 'ch_1', noWait)
    expect(r.feeCents).toBe(1522)
    expect(chargeRetrieve).toHaveBeenCalledTimes(2)
    expect(chargeRetrieve).toHaveBeenCalledWith('ch_1', { expand: ['balance_transaction'] })
  })
  it('a missing fee is left for catch-up: nothing is written', async () => {
    chargeRetrieve.mockResolvedValue(charge({ balance_transaction: null }))
    const out = await recordFeeForPaymentIntent({ stripe: { charges: { retrieve: chargeRetrieve } }, supabase: { rpc }, pi: { id: 'pi_1', latest_charge: 'ch_1' }, retry: noWait, log: { warn() {}, log() {} } })
    expect(out.status).toBe('fee_missing')
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('stripe-webhook records the fee', () => {
  it('Stripe App charge (no invoice_id): records the exact fee, unlinked for the database to match', async () => {
    chargeRetrieve.mockResolvedValue(charge())
    webhookEvent = { type: 'payment_intent.succeeded', data: { object: { id: 'pi_1', latest_charge: 'ch_1', amount_received: 51447, metadata: {} } } }
    const res = mockRes()
    await webhookHandler(mockReq(), res)
    expect(res.statusCode).toBe(200)
    expect(dbUpdate).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('record_stripe_fee', {
      p_charge_id: 'ch_1', p_charge_amount: 514.47, p_fee: 15.22, p_paid_at: new Date(1794419557000).toISOString(), p_invoice_id: null,
    })
    expect(res.body.fee).toBe('recorded')
  })
  it('in-app payment: marks the invoice paid AND records the fee linked to that invoice', async () => {
    invoiceRow = { id: 'inv1', status: 'sent', parts_total: 60, labor_total: 40, tax_amount: 6.63, total: 106.63, invoice_number: 'INV-1' }
    chargeRetrieve.mockResolvedValue(charge({ amount: 10983, balance_transaction: { fee: 348 } }))
    webhookEvent = { type: 'payment_intent.succeeded', data: { object: { id: 'pi_1', latest_charge: 'ch_1', amount_received: 10983, metadata: { invoice_id: 'inv1' } } } }
    const res = mockRes()
    await webhookHandler(mockReq(), res)
    expect(dbUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid' }))
    expect(rpc).toHaveBeenCalledWith('record_stripe_fee', expect.objectContaining({ p_fee: 3.48, p_invoice_id: 'inv1' }))
  })
  it('already-processed invoice still gets its fee checked (a retry after a failed fee write)', async () => {
    invoiceRow = { id: 'inv1', status: 'paid', stripe_payment_intent_id: 'pi_1' }
    chargeRetrieve.mockResolvedValue(charge())
    webhookEvent = { type: 'payment_intent.succeeded', data: { object: { id: 'pi_1', latest_charge: 'ch_1', metadata: { invoice_id: 'inv1' } } } }
    const res = mockRes()
    await webhookHandler(mockReq(), res)
    expect(res.body.skipped).toBe('already_processed')
    expect(rpc).toHaveBeenCalledWith('record_stripe_fee', expect.anything())
  })
  it('a database failure answers 500 so Stripe retries', async () => {
    chargeRetrieve.mockResolvedValue(charge())
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    webhookEvent = { type: 'payment_intent.succeeded', data: { object: { id: 'pi_1', latest_charge: 'ch_1', metadata: {} } } }
    const res = mockRes()
    await webhookHandler(mockReq(), res)
    expect(res.statusCode).toBe(500)
  })
  it('charge.refunded notes the refund and never deletes', async () => {
    webhookEvent = { type: 'charge.refunded', data: { object: { id: 'ch_1', amount_refunded: 51447 } } }
    const res = mockRes()
    await webhookHandler(mockReq(), res)
    expect(rpc).toHaveBeenCalledWith('note_stripe_refund', expect.objectContaining({ p_charge_id: 'ch_1', p_refunded_amount: 514.47 }))
    expect(res.statusCode).toBe(200)
  })
  it('other events are ignored', async () => {
    webhookEvent = { type: 'customer.created', data: { object: {} } }
    const res = mockRes()
    await webhookHandler(mockReq(), res)
    expect(rpc).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
  })
})

describe('finance shows card processing fees as its own line', () => {
  const range = { from: '2026-11-01', to: '2026-11-30' }
  const data = { expenses: [
    { date: '2026-11-11', amount: 15.22, category: CARD_FEES_CATEGORY },
    { date: '2026-11-09', amount: 9.67, category: CARD_FEES_CATEGORY },
    { date: '2026-11-05', amount: 40, category: 'Fuel' },
    { date: '2026-10-31', amount: 99, category: CARD_FEES_CATEGORY },
  ] }
  it('counts them once: inside expenses, and as their own line', () => {
    const f = computeFinance(data, range)
    expect(f.cardFees).toBe(24.89)
    expect(f.cardFeeCount).toBe(2)
    expect(f.expenses).toBe(64.89)
    expect(f.expensesByCategory.find(c => c.category === CARD_FEES_CATEGORY).amount).toBe(24.89)
  })
  it('is a real category, not lumped into Other', () => {
    expect(EXPENSE_CATEGORIES).toContain('Card processing fees')
  })
})
