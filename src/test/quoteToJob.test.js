import { describe, it, expect } from 'vitest'
import { jobFromApprovedQuote } from '../lib/quoteToJob.js'

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
    expect(job).toMatchObject({ customer_id: 'c1', customer_name: 'Big BOB', status: 'scheduled', job_type: 'quote' })
  })

  it('null description when scope is empty; never falls back to internal notes', () => {
    expect(jobFromApprovedQuote({ scope_notes: '   ', notes: 'x' }, { customerId: 'c', customerName: 'n' }).customer_description).toBeNull()
    expect(jobFromApprovedQuote({ notes: 'x' }, { customerId: 'c', customerName: 'n' }).customer_description).toBeNull()
  })
})
