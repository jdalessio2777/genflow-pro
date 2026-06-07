import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, act } from '@testing-library/react'

// vi.hoisted ensures these are defined before the vi.mock factory runs
const mockSignOut = vi.hoisted(() => vi.fn().mockResolvedValue({}))
const mockGetSession = vi.hoisted(() => vi.fn())
const mockOnAuthStateChange = vi.hoisted(() => vi.fn())
const mockSignInWithOAuth = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
      signOut: mockSignOut,
      signInWithOAuth: mockSignInWithOAuth,
      refreshSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  },
}))

import { AuthProvider, useAuth } from '@/lib/AuthContext'

// ─── Shared helpers ───────────────────────────────────────────────────────────

const ALLOWED_EMAILS = [
  'jeremy.dalessio@genshieldservice.com',
  'alex.russo@genshieldservice.com',
  'derek.j.sainz@gmail.com',
  'seanmch12@gmail.com',
]

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
})

// ─── ALLOWED_EMAILS list ──────────────────────────────────────────────────────

describe('ALLOWED_EMAILS whitelist (expected values)', () => {
  it('has exactly 4 allowed emails', () => {
    expect(ALLOWED_EMAILS).toHaveLength(4)
  })

  it('contains jeremy.dalessio@genshieldservice.com', () => {
    expect(ALLOWED_EMAILS).toContain('jeremy.dalessio@genshieldservice.com')
  })

  it('contains alex.russo@genshieldservice.com', () => {
    expect(ALLOWED_EMAILS).toContain('alex.russo@genshieldservice.com')
  })

  it('contains derek.j.sainz@gmail.com', () => {
    expect(ALLOWED_EMAILS).toContain('derek.j.sainz@gmail.com')
  })

  it('contains seanmch12@gmail.com', () => {
    expect(ALLOWED_EMAILS).toContain('seanmch12@gmail.com')
  })
})

// ─── Non-whitelisted email triggers sign-out ──────────────────────────────────

describe('AuthContext — non-whitelisted email', () => {
  it('calls signOut after SIGNED_IN with an unlisted email', async () => {
    const getCallback = captureAuthCallback()
    render(<AuthProvider><div /></AuthProvider>)
    const callback = getCallback()
    expect(callback).toBeTruthy()

    await act(async () => {
      await callback('SIGNED_IN', makeSession('hacker@evil.com'))
    })

    expect(mockSignOut).toHaveBeenCalled()
  })
})

// ─── Whitelisted email does NOT trigger sign-out ──────────────────────────────

describe('AuthContext — whitelisted email', () => {
  it('does NOT call signOut after SIGNED_IN with an allowed email', async () => {
    const getCallback = captureAuthCallback()
    render(<AuthProvider><div /></AuthProvider>)
    const callback = getCallback()

    await act(async () => {
      await callback('SIGNED_IN', makeSession('jeremy.dalessio@genshieldservice.com'))
    })

    expect(mockSignOut).not.toHaveBeenCalled()
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
