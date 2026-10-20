import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, act, fireEvent, screen } from '@testing-library/react'

// vi.hoisted ensures these are defined before the vi.mock factory runs
const mockSignOut = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockGetSession = vi.hoisted(() => vi.fn())
const mockOnAuthStateChange = vi.hoisted(() => vi.fn())
const mockSignInWithOAuth = vi.hoisted(() => vi.fn())
const mockRpc = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
      signOut: mockSignOut,
      signInWithOAuth: mockSignInWithOAuth,
      refreshSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
    rpc: mockRpc,
  },
}))

import { AuthProvider, useAuth } from '@/lib/AuthContext'
import StaffCheckScreen from '@/components/StaffCheckScreen'

// In-memory localStorage (Node 25's built-in global one has no methods without
// --localstorage-file, and shadows jsdom's).
const memoryStorage = (() => {
  let m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)) },
    removeItem: (k) => { m.delete(k) },
    clear: () => { m = new Map() },
  }
})()
Object.defineProperty(window, 'localStorage', { value: memoryStorage, configurable: true })

// ─── Shared helpers ───────────────────────────────────────────────────────────

function makeSession(email, providerToken = 'tok') {
  return {
    user: { id: 'uid-1', email, user_metadata: { name: 'Test User' }, app_metadata: {} },
    provider_token: providerToken,
    provider_refresh_token: 'refresh-tok',
  }
}

function captureAuthCallback() {
  let captured = null
  mockOnAuthStateChange.mockImplementation((cb) => {
    captured = cb
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  return () => captured
}

function ConsumerSpy({ onValues }) {
  const auth = useAuth()
  React.useEffect(() => { onValues(auth) })
  return null
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue({ data: { session: null }, error: null })
  mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
  mockRpc.mockResolvedValue({ data: true, error: null })
  window.localStorage.clear()
})

// ─── B6: staff gate = public.staff via is_staff() ─────────────────────────────

async function signInWith(session, values) {
  mockGetSession.mockResolvedValue({ data: { session }, error: null })
  const getCallback = captureAuthCallback()
  render(<AuthProvider><ConsumerSpy onValues={(v) => Object.assign(values, v)} /></AuthProvider>)
  await act(async () => { getCallback()('SIGNED_IN', session) })
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}

describe('AuthContext — staff gate (is_staff)', () => {
  it('is_staff() false → signs out with "Access denied" (any email)', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null })
    const values = {}
    await signInWith(makeSession('jeremy.dalessio@genshieldservice.com'), values)
    expect(mockRpc).toHaveBeenCalledWith('is_staff')
    expect(mockSignOut).toHaveBeenCalledTimes(1)
    expect(values.isAuthenticated).toBe(false)
    expect(values.authError?.type).toBe('access_denied')
  })

  it('is_staff() true → no sign-out, staff, remembered on this device (email not consulted)', async () => {
    const values = {}
    await signInWith(makeSession('someone.new@example.com'), values)
    expect(mockSignOut).not.toHaveBeenCalled()
    expect(values.staffStatus).toBe('staff')
    expect(window.localStorage.getItem('genflow.staffConfirmedUserId')).toBe('uid-1')
  })

  it('check fails with no prior confirmation → Retry state, never a sign-out; Retry recovers', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } })
    const values = {}
    await signInWith(makeSession('genflow-qa-test@genshieldservice.com'), values)
    expect(values.staffStatus).toBe('error')
    expect(values.isAuthenticated).toBe(true)
    expect(mockSignOut).not.toHaveBeenCalled()
    mockRpc.mockResolvedValue({ data: true, error: null })
    await act(async () => { values.retryStaffCheck() })
    await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    expect(values.staffStatus).toBe('staff')
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it('slow check, user confirmed on this device before → staff immediately while it re-checks', async () => {
    window.localStorage.setItem('genflow.staffConfirmedUserId', 'uid-1')
    let resolveRpc
    mockRpc.mockReturnValue(new Promise((r) => { resolveRpc = r }))
    const values = {}
    await signInWith(makeSession('genflow-qa-test@genshieldservice.com'), values)
    expect(values.staffStatus).toBe('staff')
    await act(async () => { resolveRpc({ data: true, error: null }) })
    expect(values.staffStatus).toBe('staff')
  })

  it('slow check, first time on this device → "checking" (not staff yet)', async () => {
    mockRpc.mockReturnValue(new Promise(() => {}))
    const values = {}
    await signInWith(makeSession('genflow-qa-test@genshieldservice.com'), values)
    expect(values.staffStatus).toBe('checking')
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it('check fails but the user was confirmed before → keeps working, no sign-out', async () => {
    window.localStorage.setItem('genflow.staffConfirmedUserId', 'uid-1')
    mockRpc.mockRejectedValue(new Error('offline'))
    const values = {}
    await signInWith(makeSession('genflow-qa-test@genshieldservice.com'), values)
    expect(values.staffStatus).toBe('staff')
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it('a confirmed user later removed from public.staff → signed out and forgotten on this device', async () => {
    window.localStorage.setItem('genflow.staffConfirmedUserId', 'uid-1')
    mockRpc.mockResolvedValue({ data: false, error: null })
    const values = {}
    await signInWith(makeSession('former@example.com'), values)
    expect(mockSignOut).toHaveBeenCalled()
    expect(values.authError?.type).toBe('access_denied')
    expect(window.localStorage.getItem('genflow.staffConfirmedUserId')).toBeNull()
  })
})

describe('StaffCheckScreen', () => {
  it('error state shows Retry and Sign out; Retry calls back', () => {
    const onRetry = vi.fn()
    const onSignOut = vi.fn()
    render(<StaffCheckScreen status="error" error="Failed to fetch" onRetry={onRetry} onSignOut={onSignOut} />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onSignOut).not.toHaveBeenCalled()
  })
})

// ─── googleToken from provider_token ─────────────────────────────────────────

describe('AuthContext — googleToken', () => {
  it('sets googleToken from provider_token in session', async () => {
    const session = makeSession('jeremy.dalessio@genshieldservice.com', 'ya29.google-token')
    mockGetSession.mockResolvedValue({ data: { session }, error: null })

    const values = {}
    await act(async () => {
      render(
        <AuthProvider>
          <ConsumerSpy onValues={v => Object.assign(values, v)} />
        </AuthProvider>
      )
    })

    expect(values.googleToken).toBe('ya29.google-token')
  })

  it('sets googleToken to null when session.provider_token is missing', async () => {
    const session = makeSession('jeremy.dalessio@genshieldservice.com')
    delete session.provider_token
    mockGetSession.mockResolvedValue({ data: { session }, error: null })

    const values = {}
    await act(async () => {
      render(
        <AuthProvider>
          <ConsumerSpy onValues={v => Object.assign(values, v)} />
        </AuthProvider>
      )
    })

    expect(values.googleToken).toBeNull()
  })

  it('sets googleToken to null when there is no session at all', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null })

    const values = {}
    await act(async () => {
      render(
        <AuthProvider>
          <ConsumerSpy onValues={v => Object.assign(values, v)} />
        </AuthProvider>
      )
    })

    expect(values.googleToken).toBeNull()
  })
})
