import { describe, it, expect } from 'vitest'
import { agreementTerm } from '@/lib/utils/membershipTerm'

const now = new Date('2026-10-20T12:00:00Z')
const active = { membership_plan: 'annual', membership_signed: true, membership_start: '2026-01-15T00:00:00Z', membership_expiry: '2027-01-15T00:00:00Z' }

describe('agreementTerm (B5a)', () => {
  it('new member: starts today, one year', () => {
    const t = agreementTerm({ customer: {}, plan: 'annual', now })
    expect(t.kind).toBe('new'); expect(t.start.toISOString()).toBe(now.toISOString()); expect(t.expiry.toISOString()).toBe('2027-10-20T12:00:00.000Z')
  })
  it('active member, same plan: new year starts at current expiry (no lost term, D-03)', () => {
    const t = agreementTerm({ customer: active, plan: 'annual', now })
    expect(t.kind).toBe('renewal'); expect(t.start.toISOString()).toBe('2027-01-15T00:00:00.000Z'); expect(t.expiry.toISOString()).toBe('2028-01-15T00:00:00.000Z')
  })
  it('active member changing plan: starts today', () => {
    const t = agreementTerm({ customer: active, plan: 'semi_annual', now })
    expect(t.kind).toBe('change'); expect(t.start.toISOString()).toBe(now.toISOString())
  })
  it('expired member: starts today', () => {
    const t = agreementTerm({ customer: { ...active, membership_expiry: '2026-09-01T00:00:00Z' }, plan: 'annual', now })
    expect(t.kind).toBe('new'); expect(t.start.toISOString()).toBe(now.toISOString())
  })
  it('re-signing on a job that already has an agreement never extends twice', () => {
    const renewed = { ...active, membership_start: '2027-01-15T00:00:00Z', membership_expiry: '2028-01-15T00:00:00Z' }
    const t = agreementTerm({ customer: renewed, plan: 'annual', now, jobAgreement: { start_date: '2027-01-15T00:00:00Z' } })
    expect(t.kind).toBe('resign'); expect(t.expiry.toISOString()).toBe('2028-01-15T00:00:00.000Z')
  })
})
