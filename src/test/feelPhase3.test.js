import { describe, it, expect, vi, beforeEach } from 'vitest'

const list = vi.fn(async () => [])
vi.mock('@/lib/db', () => ({
  db: new Proxy({}, { get: () => ({ list, filter: vi.fn(async () => []) }) }),
}))
vi.mock('@/lib/supabaseClient', () => ({ supabase: {} }))

import { queryClientInstance, markAllStale, LIST_STALE_MS } from '@/lib/query-client'
import { jobsListQuery, customersListQuery, invoicesListQuery, partsCatalogQuery, normalizePart, jobQuery, DETAIL_STALE_MS } from '@/lib/queries'
import { loaderFor, shouldRevalidate, setLoadersReady, HOLD_MS } from '@/lib/routeLoaders'

describe('Phase 3 cache policy', () => {
  beforeEach(() => { queryClientInstance.clear(); list.mockClear(); setLoadersReady(false) })

  it('lists stay fresh for 30 s and refresh when the app comes back', () => {
    const d = queryClientInstance.getDefaultOptions().queries
    expect(LIST_STALE_MS).toBe(30_000)
    expect(d.staleTime).toBe(30_000)
    expect(d.refetchOnWindowFocus).toBe(true)
    expect(jobQuery('x').staleTime).toBe(DETAIL_STALE_MS)
  })

  it('lists with different limits/orders never share a cache entry (A-09)', () => {
    const keys = [jobsListQuery(100), jobsListQuery(200), jobsListQuery(500), customersListQuery('name'), customersListQuery('-created_date'), invoicesListQuery(100), invoicesListQuery(500), invoicesListQuery(null)]
      .map((q) => JSON.stringify(q.queryKey))
    expect(new Set(keys).size).toBe(keys.length)
    // ...but they still match the old prefix invalidations
    expect(jobsListQuery(200).queryKey[0]).toBe('jobs')
    expect(customersListQuery().queryKey[0]).toBe('customers')
    expect(invoicesListQuery(5).queryKey[0]).toBe('invoices')
    expect(partsCatalogQuery().queryKey).toEqual(['parts-catalog'])
  })

  it('every cached copy of the parts catalog has the normalized categories', async () => {
    list.mockResolvedValueOnce([{ id: 1, category: 'oil_filter' }, { id: 2, category: 'batteries' }])
    const rows = await partsCatalogQuery().queryFn()
    expect(rows.map((r) => r.category)).toEqual(['oil_filters', 'batteries'])
    expect(normalizePart({ category: 'spark_plug' }).category).toBe('spark_plugs')
  })

  it('a write anywhere marks every cached query stale (a save is never followed by stale data)', async () => {
    await queryClientInstance.prefetchQuery(jobsListQuery(200))
    await queryClientInstance.prefetchQuery(customersListQuery('name'))
    const q = (k) => queryClientInstance.getQueryCache().find({ queryKey: k, exact: true })
    expect(q(jobsListQuery(200).queryKey).isStale()).toBe(false)
    markAllStale()
    expect(q(jobsListQuery(200).queryKey).isStale()).toBe(true)
    expect(q(customersListQuery('name').queryKey).isStale()).toBe(true)
    expect(list).toHaveBeenCalledTimes(2) // marked only — nothing refetched by itself
  })

  it('route loaders do nothing before sign-in, use the cache, and never hold longer than HOLD_MS', async () => {
    const load = loaderFor('/jobs')
    expect(await load({ params: {} })).toBe(null)
    expect(list).not.toHaveBeenCalled() // not ready: no anonymous request is cached
    setLoadersReady(true)
    await load({ params: {} })
    expect(list).toHaveBeenCalledTimes(2) // jobs + customers
    await load({ params: {} })
    expect(list).toHaveBeenCalledTimes(2) // second visit: served from the cache
    list.mockImplementation(() => new Promise(() => {})) // network hangs
    queryClientInstance.clear()
    const t = Date.now()
    await load({ params: {} })
    expect(Date.now() - t).toBeLessThan(HOLD_MS + 200)
    list.mockImplementation(async () => [])
  })

  it('typing in a list search box (URL state) never re-runs a loader', () => {
    const u = (s) => new URL('https://x' + s)
    expect(shouldRevalidate({ currentUrl: u('/jobs?tab=active'), nextUrl: u('/jobs?tab=active&q=ab') })).toBe(false)
    expect(shouldRevalidate({ currentUrl: u('/jobs'), nextUrl: u('/customers') })).toBe(true)
  })
})

describe('Phase 3: server-route writes mark the cache stale too', () => {
  it('a successful POST to /api/* marks queries stale; GETs and failures do not', async () => {
    const { installApiWriteTracking } = await import('@/lib/query-client')
    const win = { fetch: vi.fn(async (u, i) => ({ ok: !String(u).includes('fail'), url: u, i })) }
    installApiWriteTracking(win)
    await queryClientInstance.prefetchQuery(jobsListQuery(200))
    const q = () => queryClientInstance.getQueryCache().find({ queryKey: jobsListQuery(200).queryKey, exact: true })
    await win.fetch('/api/send-job-summary', { method: 'GET' })
    await win.fetch('/api/fail', { method: 'POST' })
    expect(q().isStale()).toBe(false)
    await win.fetch('/api/update-payment-intent', { method: 'POST' })
    expect(q().isStale()).toBe(true)
  })
})
