import { describe, it, expect, vi, beforeEach } from 'vitest'

// B4: the job screen's records come from one request.
const calls = []
let reply = { data: null, error: null }
vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: (t) => ({ select: (sel) => ({ eq: (c, v) => ({ maybeSingle: async () => { calls.push({ t, sel, c, v }); return reply } }) }) }) },
}))
const fallbacks = { JobPart: vi.fn(async () => [{ id: 'fallback-part' }]) }
vi.mock('@/lib/db', async (orig) => {
  const m = await orig()
  return { ...m, db: { ...m.db, JobPart: { filter: (...a) => fallbacks.JobPart(...a) } } }
})

const { loadJobBundle, splitJobBundle, __resetJobBundle, __jobBundleRequests, JOB_BUNDLE_SELECT } = await import('../lib/jobBundle.js')
const { jobQuery, jobPartsQuery, jobLaborQuery, jobInvoiceQuery, jobDocsQuery, jobPhotosQuery, jobAgreementQuery, startJobQueries } = await import('../lib/queries.js')
const { QueryClient } = await import('@tanstack/react-query')

const row = {
  id: 'j1', title: 'Breaker', customer_id: 'c1', created_at: '2026-10-01T00:00:00Z',
  job_parts: [{ id: 'p1', job_id: 'j1', created_at: '2026-10-01T00:00:01Z' }],
  job_labor: [{ id: 'l1', job_id: 'j1' }, { id: 'l2', job_id: 'j1' }],
  invoices: [{ id: 'i1', job_id: 'j1', total: 100 }],
  job_documents: [], job_photos: [{ id: 'ph1' }],
  job_agreements: [{ id: 'a1', job_id: 'j1' }],
  customer: { id: 'c1', name: 'Pat', history: [{ id: 'j0', created_at: '2026-09-01T00:00:00Z' }, { id: 'j1', created_at: '2026-10-01T00:00:00Z' }] },
}

beforeEach(() => { calls.length = 0; __resetJobBundle(); reply = { data: row, error: null }; fallbacks.JobPart.mockClear() })

describe('job bundle (B4)', () => {
  it('splits into the same shapes the screen used (created_date kept, history newest first)', () => {
    const b = splitJobBundle(row)
    expect(b.job).toMatchObject({ id: 'j1', title: 'Breaker', created_date: '2026-10-01T00:00:00Z' })
    expect(b.job).not.toHaveProperty('job_parts')
    expect(b.parts[0]).toMatchObject({ id: 'p1', created_date: '2026-10-01T00:00:01Z' })
    expect(b.labor).toHaveLength(2)
    expect(b.invoices[0].total).toBe(100)
    expect(b.agreement).toMatchObject({ id: 'a1' })
    expect(b.customer).toEqual({ id: 'c1', name: 'Pat' })
    expect(b.customerHistory.map(j => j.id)).toEqual(['j1', 'j0'])
    expect(splitJobBundle({ ...row, job_agreements: [], customer: null }).agreement).toBeNull()
  })

  it('every job-screen query shares ONE request when they start together', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await Promise.all(startJobQueries(qc, 'j1'))
    await Promise.all([jobDocsQuery, jobPhotosQuery, jobAgreementQuery].map(q => qc.fetchQuery(q('j1'))))
    await new Promise(r => setTimeout(r, 10))
    const bundleCalls = calls.filter(c => c.t === 'jobs')
    expect(bundleCalls).toHaveLength(1)
    expect(bundleCalls[0].sel).toBe(JOB_BUNDLE_SELECT)
    expect(qc.getQueryData(['job', 'j1']).title).toBe('Breaker')
    expect(qc.getQueryData(['job-parts', 'j1'])).toHaveLength(1)
    expect(qc.getQueryData(['job-labor', 'j1'])).toHaveLength(2)
    expect(qc.getQueryData(['job-invoice', 'j1'])).toHaveLength(1)
    expect(qc.getQueryData(['job-photos', 'j1'])).toHaveLength(1)
    expect(qc.getQueryData(['job-agreement', 'j1'])).toMatchObject({ id: 'a1' })
    // customer + history seeded: no request of their own
    expect(qc.getQueryData(['job-customer', 'c1'])).toMatchObject({ name: 'Pat' })
    expect(qc.getQueryData(['customer-history', 'c1']).map(j => j.id)).toEqual(['j1', 'j0'])
  })

  it('asks within 1.5 s share one request; an invalidation (a save) forces a new one', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await Promise.all(startJobQueries(qc, 'j1'))
    await new Promise(r => setTimeout(r, 120))
    await qc.fetchQuery({ ...jobLaborQuery('j1'), staleTime: 0 }) // a late slice reuses the answer
    expect(__jobBundleRequests()).toBe(1)
    await qc.invalidateQueries({ queryKey: ['job-parts', 'j1'] }) // e.g. a part was added
    await qc.fetchQuery(jobPartsQuery('j1')) // what the screen's refetch does
    expect(__jobBundleRequests()).toBe(2)
    await loadJobBundle('j1') // same generation, just landed: reused
    expect(__jobBundleRequests()).toBe(2)
  })

  it('falls back to the per-table request when the embedded select fails', async () => {
    reply = { data: null, error: { code: 'PGRST200', message: 'no relationship' } }
    const parts = await jobPartsQuery('j1').queryFn()
    expect(parts).toEqual([{ id: 'fallback-part' }])
    expect(fallbacks.JobPart).toHaveBeenCalledWith({ job_id: 'j1' })
  })

  it('a missing job reads as undefined / empty lists', async () => {
    reply = { data: null, error: null }
    expect(await jobQuery('nope').queryFn()).toBeUndefined()
    expect(await jobLaborQuery('nope').queryFn()).toEqual([])
    expect(await jobInvoiceQuery('nope').queryFn()).toEqual([])
    expect(await jobAgreementQuery('nope').queryFn()).toBeNull()
  })
})
