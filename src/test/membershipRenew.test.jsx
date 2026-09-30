import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const member = {
  id: 'c1', name: 'ZZ Member', membership_plan: 'annual', membership_signed: true,
  membership_start: '2026-01-01T00:00:00Z', membership_expiry: '2027-01-01T00:00:00Z',
}
vi.mock('@/lib/db', () => ({ db: { Customer: { filter: vi.fn(async () => [member]), update: vi.fn() }, MembershipRenewal: { create: vi.fn() } } }))
vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: vi.fn() } }))
vi.mock('@/lib/coreIntegrations', () => ({ integrationsCore: { SendEmailWithRetry: vi.fn() } }))
vi.mock('@/lib/notifyTeam', () => ({ notifyTeam: vi.fn(), buildTable: vi.fn(), buildRow: vi.fn(), buildEventBadge: vi.fn() }))
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: { email: 'qa@example.com' } }) }))

const { default: MembershipAgreement } = await import('../pages/MembershipAgreement.jsx')

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/customers/c1/membership']}>
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
