// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parseCsv, chargesFrom, catchupSql } from '../../scripts/stripe/fee-catchup.mjs'

// Same columns as a real Stripe "Payments" export; made-up ids and amounts.
const CSV = `id,Created date (UTC),Amount,Amount Refunded,Currency,Captured,Description,Fee,Status
ch_3Aaa111,2026-11-11 17:52:37,514.47,0.00,usd,true,,15.22,Paid
,2026-10-26 18:10:18,479.80,,usd,,,,requires_payment_method
ch_3Bbb222,2026-10-21 15:40:19,"1,000.00",0.00,usd,true,"Generator service, ""full""",14.33,Paid
ch_3Ccc333,2026-10-01 18:11:24,329.20,329.20,usd,true,Refunded one,9.85,Paid
ch_3Ddd444,2026-09-03 15:02:04,488.74,0.00,usd,true,,,Paid
,2026-09-03 14:50:42,488.74,,usd,,,,canceled
`

describe('fee catch-up', () => {
  it('reads quoted cells with commas and quotes', () => {
    const rows = parseCsv(CSV)
    expect(rows).toHaveLength(6)
    expect(rows[2].Description).toBe('Generator service, "full"')
  })
  it('keeps only paid charges with an exact fee; never guesses a missing fee', () => {
    const { ok, skipped } = chargesFrom(parseCsv(CSV))
    expect(ok.map((c) => c.id)).toEqual(['ch_3Aaa111', 'ch_3Ccc333'])
    expect(skipped).toEqual([{ id: 'ch_3Bbb222', why: 'amount' }, { id: 'ch_3Ddd444', why: 'no exact fee in the export' }])
    expect(ok[0]).toMatchObject({ amount: '514.47', fee: '15.22', paidAt: '2026-11-11T17:52:37Z', refunded: null })
    expect(ok[1].refunded).toBe('329.20')
  })
  it('SQL goes through record_stripe_fee only, notes refunds, and is one transaction', () => {
    const sql = catchupSql(chargesFrom(parseCsv(CSV)).ok)
    expect(sql).toContain("public.record_stripe_fee('ch_3Aaa111', 514.47, 15.22, '2026-11-11T17:52:37Z')")
    expect(sql).toContain("public.note_stripe_refund('ch_3Ccc333', 329.20, now())")
    expect(sql).toMatch(/^-- .*\nbegin;/)
    expect(sql.trim().endsWith('commit;')).toBe(true)
    expect(sql).not.toMatch(/insert|update|delete/i)
  })
})
