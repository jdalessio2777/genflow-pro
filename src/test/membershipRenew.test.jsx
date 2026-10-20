import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const member = {
  id: 'c1', name: 'ZZ Member', membership_plan: 'annual', membership_signed: true,
  membership_start: '2026-01-01T00:00:00Z', membership_expiry: '2027-01-01T00:00:00Z',
}
let current = member
vi.mock('@/lib/db', () => ({ db: { Customer: { filter: vi.fn(async () => [current]), update: vi.fn() }, MembershipRenewal: { create: vi.fn() }, JobAgreement: { filter: vi.fn(async () => []) } } }))
vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))
vi.mock('@/lib/coreIntegrations', () => ({ integrationsCore: { SendEmailWithRetry: vi.fn() } }))
vi.mock('@/lib/notifyTeam', () => ({ notifyTeam: vi.fn(), buildTable: vi.fn(), buildRow: vi.fn(), buildEventBadge: vi.fn() }))
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: { email: 'qa@example.com' } }) }))

const { default: MembershipAgreement } = await import('../pages/MembershipAgreement.jsx')

function renderPage(url = '/customers/c1/membership') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes><Route path="/customers/:id/membership" element={<MembershipAgreement />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('MembershipAgreement — active member', () => {
  it('"Renew or Change Plan" opens the plan selection flow (was a no-op)', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Renew or Change Plan/ }))
    expect(await screen.findByRole('button', { name: /Continue with/ })).toBeTruthy()
    expect(screen.queryByText('Active Member')).toBeNull()
  })
})

describe('MembershipAgreement — renewal from a job (B5a)', () => {
  it('opens straight into signing and shows the renewal term starting at the current expiry', async () => {
    window.history.pushState({}, '', '/customers/c1/membership?from_job=j1&plan=annual')
    try {
      renderPage('/customers/c1/membership?from_job=j1&plan=annual')
      fireEvent.click(await screen.findByRole('button', { name: /Continue with/ }))
      expect(await screen.findByTestId('term-note')).toBeTruthy()
      const long = (iso, years = 0) => { const d = new Date(iso); d.setFullYear(d.getFullYear() + years); return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) }
      expect(screen.getAllByText(long(member.membership_expiry)).length).toBeGreaterThan(0)
      expect(screen.getAllByText(long(member.membership_expiry, 1)).length).toBeGreaterThan(0)
    } finally { window.history.pushState({}, '', '/') }
  })
  it('"Renew or Change Plan" defaults to the current semi-annual plan (D-06)', async () => {
    current = { ...member, membership_plan: 'semi_annual' }
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Renew or Change Plan/ }))
    expect(await screen.findByRole('button', { name: /Continue with Sentinel/ })).toBeTruthy()
    current = member
  })
})
