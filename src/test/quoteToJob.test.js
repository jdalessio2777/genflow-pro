import { describe, it, expect } from 'vitest'
import { jobFromApprovedQuote, quoteTitle, isPlaceholderJobTitle } from '../lib/quoteToJob.js'
import { inferServiceType, serviceTypePrefill, SERVICE_TYPES } from '../lib/jobTypes.js'

describe('jobFromApprovedQuote (Run 9: A2 blank description, A4 quote title)', () => {
  it('starts the customer-facing description BLANK (Scope of Work stays on the quote) and keeps internal notes internal', () => {
    const job = jobFromApprovedQuote(
      { scope_notes: '  Replace starter\nLoad test  ', notes: 'INTERNAL: cost 40% margin' },
      { customerId: 'c1', customerName: 'Big BOB', lineItems: [{ type: 'labor', description: 'Starter replacement' }] },
    )
    expect(job.customer_description).toBeNull()
    expect(job.notes).toBe('INTERNAL: cost 40% margin')
    expect(job.quote_notes).toBe('INTERNAL: cost 40% margin')
    expect(job).toMatchObject({ customer_id: 'c1', customer_name: 'Big BOB', status: 'scheduled', job_type: 'diagnostic_repair' })
  })

  it('never falls back to the scope or internal notes for the description', () => {
    expect(jobFromApprovedQuote({ scope_notes: 'Scope', notes: 'x' }, { customerId: 'c', customerName: 'n' }).customer_description).toBeNull()
  })

  it("titles the job with the quote's title (its main line), never \"Quote Follow-up\"", () => {
    const lines = [
      { type: 'labor', description: 'One-Time Tune-Up (Air-Cooled)', created_at: '2026-10-20T03:11:35.001Z' },
      { type: 'custom', description: 'Generator Main Line Circuit Breaker Replacement', created_at: '2026-10-20T03:11:35.000Z' },
    ]
    const job = jobFromApprovedQuote({}, { customerId: 'c', customerName: 'Lingyan Wang', lineItems: lines })
    expect(job.title).toBe('Generator Main Line Circuit Breaker Replacement')
    expect(job.title).not.toMatch(/follow/i)
    expect(jobFromApprovedQuote({}, { customerId: 'c', customerName: 'Pat', lineItems: [] }).title).toBe('Job for Pat')
  })

  it('quoteTitle: the first line in the order added (created_at), any type', () => {
    expect(quoteTitle([{ type: 'part', description: 'Battery 26R' }])).toBe('Battery 26R')
    expect(quoteTitle([{ type: 'labor', description: 'Labor B', created_at: '2026-10-24T16:00:00.002Z' }, { type: 'part', description: ' Part A ', created_at: '2026-10-24T16:00:00.001Z' }])).toBe('Part A')
    expect(quoteTitle([])).toBe('')
    expect(quoteTitle([{ description: '   ' }])).toBe('')
    expect(isPlaceholderJobTitle('Quote Follow-up — Lingyan Wang')).toBe(true)
    expect(isPlaceholderJobTitle('quote follow up - x')).toBe(true)
    expect(isPlaceholderJobTitle('Main breaker replacement')).toBe(false)
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
