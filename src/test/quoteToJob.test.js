import { describe, it, expect } from 'vitest'
import { jobFromApprovedQuote } from '../lib/quoteToJob.js'
import { inferServiceType, serviceTypePrefill, SERVICE_TYPES } from '../lib/jobTypes.js'

describe('jobFromApprovedQuote', () => {
  it('copies scope_notes to customer_description and keeps internal notes internal', () => {
    const job = jobFromApprovedQuote(
      { scope_notes: '  Replace starter\nLoad test  ', notes: 'INTERNAL: cost 40% margin' },
      { customerId: 'c1', customerName: 'Big BOB' },
    )
    expect(job.customer_description).toBe('Replace starter\nLoad test')
    expect(job.customer_description).not.toContain('INTERNAL')
    expect(job.notes).toBe('INTERNAL: cost 40% margin')
    expect(job.quote_notes).toBe('INTERNAL: cost 40% margin')
    expect(job).toMatchObject({ customer_id: 'c1', customer_name: 'Big BOB', status: 'scheduled', job_type: null })
  })

  it('null description when scope is empty; never falls back to internal notes', () => {
    expect(jobFromApprovedQuote({ scope_notes: '   ', notes: 'x' }, { customerId: 'c', customerName: 'n' }).customer_description).toBeNull()
    expect(jobFromApprovedQuote({ notes: 'x' }, { customerId: 'c', customerName: 'n' }).customer_description).toBeNull()
  })
})

describe('service type for quote-approved jobs (Run 7: never "Quote")', () => {
  const job = (lines) => jobFromApprovedQuote({}, { customerId: 'c', customerName: 'n', lineItems: lines.map(description => ({ description })) })
  it('is taken from the lines when obvious', () => {
    expect(job(['Service Agreement (Air-Cooled) — Annual', 'One-Time Tune-Up (Air-Cooled)']).job_type).toBe('maintenance')
    expect(job(['Battery 26R Replacement']).job_type).toBe('battery_replacement')
    expect(job(['Emergency Dispatch Fee', 'Emergency Hourly']).job_type).toBe('emergency')
    expect(job(['Starter Motor Replacement', 'Standard Hour']).job_type).toBe('diagnostic_repair')
  })
  it('is null (the sheet asks) when not obvious, and never "quote"', () => {
    expect(job(['QA custom line']).job_type).toBeNull()
    expect(job([]).job_type).toBeNull()
    expect(SERVICE_TYPES.map(t => t.value)).not.toContain('quote')
    expect(inferServiceType(['Quote'])).toBeNull()
  })
  it('sheet prefill keeps a real type, replaces the legacy "quote"', () => {
    expect(serviceTypePrefill('warranty', ['Battery 26R Replacement'])).toBe('warranty')
    expect(serviceTypePrefill('quote', ['Battery 26R Replacement'])).toBe('battery_replacement')
    expect(serviceTypePrefill('quote', ['custom'])).toBe('')
    expect(serviceTypePrefill(null, [])).toBe('')
  })
})
