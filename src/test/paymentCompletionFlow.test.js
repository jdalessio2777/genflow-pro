// @vitest-environment node
// Batch 3 Item 1/2: one combined completion email, the short pay-later
// receipt (paid / partial), never two emails for one event, and the job's
// signature in whichever email goes out.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'node:stream'

let rows
const sent = []
vi.mock('../../api/_lib/sendEmail.js', () => ({
  sendEmail: vi.fn(async (msg) => {
    // Resend semantics: a reused Idempotency-Key does not send again.
    if (sent.some(m => m.idempotencyKey === msg.idempotencyKey)) return { id: 'dup' }
    sent.push(msg); return { id: `email-${sent.length}` }
  }),
}))
process.env.SUPABASE_URL ||= 'http://supabase.test'; process.env.SUPABASE_ANON_KEY ||= 'anon-test'
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { email: 'qa@x.com' } }, error: null }) },
    rpc: async (fn) => ({ data: fn === 'is_staff', error: null }),
    from: (table) => fakeTable(table),
  }),
}))
function fakeTable(table) {
  const filters = []; let patch = null; let isNull = null
  const list = () => (rows[table] || []).filter(r => filters.every(([k, v]) => r[k] === v) && (!isNull || r[isNull] == null))
  const q = {
    select: () => q, order: () => q, in: () => q,
    eq: (k, v) => { filters.push([k, v]); return q },
    is: (k) => { isNull = k; return q },
    update: (p) => { patch = p; return q },
    maybeSingle: async () => ({ data: list()[0] || null, error: null }),
    then: (res, rej) => {
      let data = list()
      if (patch) { data.forEach(r => Object.assign(r, patch)); data = data.map(r => ({ id: r.id })) }
      return Promise.resolve({ data, error: null }).then(res, rej)
    },
  }
  return q
}
const { default: handler } = await import('../../api/send-job-summary.js')
const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
async function call(body) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]); req.method = 'POST'; req.headers = { authorization: 'Bearer t' }
  const res = { statusCode: 200 }; res.status = (c) => { res.statusCode = c; return res }; res.json = (b) => { res.body = b; return res }
  await handler(req, res); return res
}
const JOB = '11111111-1111-4111-8111-111111111111'
beforeEach(() => {
  sent.length = 0
  rows = {
    jobs: [{ id: JOB, customer_id: 'c1', status: 'completed', invoice_notes: '', completion_email_sent_at: null, customer_signature: null }],
    customers: [{ id: 'c1', name: 'Pat Q', email: 'jdalessio2777@gmail.com' }],
    invoices: [{ id: 'i1', job_id: JOB, invoice_number: 'INV-1', status: 'draft', parts_total: 0, labor_total: 100, tax_amount: 6.63, total: 106.63, surcharge_amount: 0, line_items: [], paid_date: null, created_at: '2026-10-15T12:00:00Z' }],
    job_parts: [], job_labor: [{ job_id: JOB, total_price: 100 }], job_documents: [], job_agreements: [], app_settings: [],
  }
})

describe('completion: ONE combined email', () => {
  it('unpaid: says UNPAID + amount due; a double tap sends nothing more', async () => {
    const a = await call({ job_id: JOB, kind: 'completion' })
    const b = await call({ job_id: JOB, kind: 'completion' })
    expect(sent).toHaveLength(1)
    expect(b.body.skipped).toBe('already_sent')
    expect(sent[0].html).toContain('UNPAID — AMOUNT DUE: $106.63')
    expect(a.body.ok).toBe(true)
  })
  it('paid before completion: says PAID + method + surcharge; NO receipt afterwards', async () => {
    Object.assign(rows.invoices[0], { status: 'paid', paid_date: '2026-10-15T12:05:00Z', payment_method: 'stripe_app', surcharge_amount: 3.01, total: 109.64 })
    await call({ job_id: JOB, kind: 'completion' })
    const r = await call({ job_id: JOB, kind: 'receipt' })
    expect(sent).toHaveLength(1)
    expect(sent[0].html).toMatch(/PAID — [^<]*\(Card\)/)
    expect(sent[0].html).toContain('Credit card surcharge')
    expect(sent[0].html).toContain('$3.01')
    expect(r.body.skipped).toBe('paid_before_completion_email')
  })
  it('signature collected BEFORE completion is in the combined email', async () => {
    rows.jobs[0].customer_signature = SIG
    await call({ job_id: JOB, kind: 'completion' })
    expect(sent[0].html).toContain('CUSTOMER SIGNATURE')
    expect(sent[0].html).toContain(SIG.slice(0, 60))
  })
})

describe('collect later: short "Payment received" receipt', () => {
  it('paid after the completion email → exactly one short receipt (double tap safe)', async () => {
    await call({ job_id: JOB, kind: 'completion' })
    Object.assign(rows.invoices[0], { status: 'paid', paid_date: new Date(Date.now() + 60000).toISOString(), payment_method: 'cash' })
    await call({ job_id: JOB, kind: 'receipt' })
    const again = await call({ job_id: JOB, kind: 'receipt' })
    expect(sent).toHaveLength(2)
    expect(again.body.skipped).toBe('already_sent')
    expect(sent[1].html).toContain('Payment received')
    expect(sent[1].html).toContain('Paid in full ✓')
    expect(sent[1].html).not.toContain('<th') // short: no line-item table
  })
  it('signature collected AFTER completion appears in the receipt', async () => {
    await call({ job_id: JOB, kind: 'completion' })
    expect(sent[0].html).not.toContain('CUSTOMER SIGNATURE')
    rows.jobs[0].customer_signature = SIG
    Object.assign(rows.invoices[0], { status: 'paid', paid_date: new Date(Date.now() + 60000).toISOString(), payment_method: 'check' })
    await call({ job_id: JOB, kind: 'receipt' })
    expect(sent[1].html).toContain('CUSTOMER SIGNATURE')
  })
  it('partial payment (amount_paid column) → receipt with paid so far + balance; repeat of the same amount does not resend', async () => {
    await call({ job_id: JOB, kind: 'completion' })
    Object.assign(rows.invoices[0], { status: 'partial', amount_paid: 50, payment_method: 'cash' })
    await call({ job_id: JOB, kind: 'receipt' })
    await call({ job_id: JOB, kind: 'receipt' })
    expect(sent).toHaveLength(2)
    expect(sent[1].html).toContain('Paid so far')
    expect(sent[1].html).toContain('$56.63') // 106.63 - 50
    Object.assign(rows.invoices[0], { amount_paid: 80 })
    await call({ job_id: JOB, kind: 'receipt' })
    expect(sent).toHaveLength(3)
    expect(sent[2].html).toContain('$26.63')
  })
  it('no completion email (legacy / toggled off) → payment recorded with no email', async () => {
    Object.assign(rows.invoices[0], { status: 'paid', paid_date: new Date().toISOString(), payment_method: 'cash' })
    const r = await call({ job_id: JOB, kind: 'receipt' })
    expect(sent).toHaveLength(0)
    expect(r.body.skipped).toBe('completion_email_not_sent')
  })
})
