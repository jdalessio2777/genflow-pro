import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, act, fireEvent, screen } from '@testing-library/react'

const mockSignOut = vi.hoisted(() => vi.fn())
const mockGetSession = vi.hoisted(() => vi.fn())
const mockOnAuthStateChange = vi.hoisted(() => vi.fn())
const mockAuth = vi.hoisted(() => ({ current: null }))

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
      signOut: mockSignOut,
      signInWithOAuth: vi.fn(),
    },
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
  },
}))

import { AuthProvider, useAuth } from '@/lib/AuthContext'
import { clearDeviceData } from '@/lib/signOutDevice'
import { queryClientInstance } from '@/lib/query-client'
import { memoryStorage } from './memoryStorage'

const SB_KEY = 'sb-proj-auth-token'

function seedDevice() {
  localStorage.setItem(SB_KEY, '{"access_token":"x"}')
  localStorage.setItem('genflow_google_tokens_v1', JSON.stringify({ userId: 'uid-1', accessToken: 'ya29.old', refreshToken: 'r-old', expiresAt: Date.now() + 3600e3 }))
  localStorage.setItem('genflow_jobs_calendar_v1', '{"jeremy@x.com":"cal-1"}')
  localStorage.setItem('genflow_calendar_pending_v1', '["job-1"]')
  localStorage.setItem('genflow_last_calendar_sync', '2026-10-20T10:00:00Z')
  localStorage.setItem('genflow.staffConfirmedUserId', 'uid-1')
  localStorage.setItem('genflow_preferences', '{"confirmDelete":true}')
  sessionStorage.setItem('gf-nav-v1', '{}')
  sessionStorage.setItem('genflow_auth_return_to', '/jobs/1')
  queryClientInstance.setQueryData(['customers'], [{ id: 'c1' }])
}

function makeSession(providerToken) {
  return {
    access_token: 'sb-access',
    user: { id: 'uid-1', email: 'jeremy@x.com', user_metadata: {}, app_metadata: {} },
    ...(providerToken ? { provider_token: providerToken, provider_refresh_token: 'r-new' } : {}),
  }
}

function Spy() { mockAuth.current = useAuth(); return null }

let replaceSpy
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('sessionStorage', memoryStorage())
  replaceSpy = vi.fn()
  vi.stubGlobal('location', { ...window.location, pathname: '/settings', origin: 'http://localhost', replace: replaceSpy, assign: vi.fn() })
  document.body.style.visibility = ''
  mockSignOut.mockResolvedValue({ error: null })
  mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
})
afterEach(() => { vi.unstubAllGlobals() })

describe('clearDeviceData', () => {
  it('removes Google tokens, calendar choice/queue/last sync, staff memory, the session key, sessionStorage and the query cache; keeps preferences', () => {
    seedDevice()
    clearDeviceData()
    for (const k of [SB_KEY, 'genflow_google_tokens_v1', 'genflow_jobs_calendar_v1', 'genflow_calendar_pending_v1', 'genflow_last_calendar_sync', 'genflow.staffConfirmedUserId']) {
      expect(localStorage.getItem(k), k).toBeNull()
    }
    expect(localStorage.getItem('genflow_preferences')).toBe('{"confirmDelete":true}')
    expect(sessionStorage.length).toBe(0)
    expect(queryClientInstance.getQueryData(['customers'])).toBeUndefined()
  })

  it('keepSession leaves only the Supabase session (needed to revoke it) and the preferences', () => {
    seedDevice()
    clearDeviceData({ keepSession: true })
    expect(localStorage.getItem(SB_KEY)).not.toBeNull()
    expect(localStorage.length).toBe(2)
  })
})

describe('AuthContext.signOut', () => {
  async function mount(session) {
    mockGetSession.mockResolvedValue({ data: { session }, error: null })
    let cb
    mockOnAuthStateChange.mockImplementation((fn) => { cb = fn; return { data: { subscription: { unsubscribe: vi.fn() } } } })
    await act(async () => { render(<AuthProvider><Spy /></AuthProvider>) })
    return (event, sess) => act(async () => { cb(event, sess) })
  }

  it('signs out this device only, clears its data, blanks the page and REPLACES the entry with /login', async () => {
    await mount(makeSession())
    seedDevice()
    await act(async () => { await mockAuth.current.signOut(true) })
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(localStorage.getItem('genflow_google_tokens_v1')).toBeNull()
    expect(localStorage.getItem('genflow_jobs_calendar_v1')).toBeNull()
    expect(localStorage.getItem(SB_KEY)).toBeNull()
    expect(mockAuth.current.isAuthenticated).toBe(false)
    expect(mockAuth.current.googleToken).toBeNull()
    expect(document.body.style.visibility).toBe('hidden')
    expect(replaceSpy).toHaveBeenCalledWith('/login')
    expect(window.location.assign).not.toHaveBeenCalled()
  })

  it('offline: Supabase keeps its session when the logout call fails — the stored session is removed anyway', async () => {
    await mount(makeSession())
    seedDevice()
    mockSignOut.mockResolvedValue({ error: { message: 'Failed to fetch' } })
    await act(async () => { await mockAuth.current.signOut(true) })
    expect(localStorage.getItem(SB_KEY)).toBeNull()
    expect(replaceSpy).toHaveBeenCalledWith('/login')
  })

  it('a back-forward-cache restore of the signed-out page goes to /login', async () => {
    await mount(makeSession())
    await act(async () => { await mockAuth.current.signOut(true) })
    replaceSpy.mockClear()
    const ev = new Event('pageshow'); ev.persisted = true
    window.dispatchEvent(ev)
    expect(replaceSpy).toHaveBeenCalledWith('/login')
  })

  it('signing back in with Google stores the NEW Google token again', async () => {
    const fire = await mount(makeSession('ya29.old'))
    await act(async () => { await mockAuth.current.signOut(true) })
    expect(localStorage.getItem('genflow_google_tokens_v1')).toBeNull()
    await fire('SIGNED_IN', makeSession('ya29.new'))
    expect(mockAuth.current.googleToken).toBe('ya29.new')
    const stored = JSON.parse(localStorage.getItem('genflow_google_tokens_v1'))
    expect(stored).toMatchObject({ userId: 'uid-1', accessToken: 'ya29.new', refreshToken: 'r-new' })
  })

  it('a signed-out visit to a staff screen goes to /login with replace (back can\'t pile up entries)', async () => {
    await mount(null)
    act(() => { mockAuth.current.navigateToLogin() })
    expect(replaceSpy).toHaveBeenCalledWith('/login')
    expect(window.location.assign).not.toHaveBeenCalled()
  })
})

// ─── Settings → Sign out button ────────────────────────────────────────────
vi.mock('@/lib/useSettings', () => ({ useSettings: () => ({ settings: {}, isLoading: true }) }))

describe('Settings → Sign out', () => {
  it('44 pt red button → the app\'s own dialog (no window.confirm); Cancel keeps you signed in; Sign out signs out', async () => {
    const { SignOutSection } = await import('@/pages/Settings')
    const signOut = vi.fn().mockResolvedValue()
    const confirmSpy = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmSpy)
    const AuthCtxSpy = await import('@/lib/AuthContext')
    const useAuthSpy = vi.spyOn(AuthCtxSpy, 'useAuth')
    useAuthSpy.mockReturnValue({ user: { email: 'qa@x.com' }, signOut })
    try {
      render(<SignOutSection />)
      const btn = screen.getByTestId('settings-sign-out')
      expect(btn.className).toContain('min-h-[44px]')
      expect(btn.className).toContain('text-destructive')
      expect(screen.getByText('Signed in as qa@x.com')).toBeTruthy()
      fireEvent.click(btn)
      expect(screen.getByText('Sign out of GenFlow?')).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(signOut).not.toHaveBeenCalled()
      fireEvent.click(screen.getByTestId('settings-sign-out'))
      await act(async () => { fireEvent.click(screen.getByTestId('confirm-sign-out')) })
      expect(signOut).toHaveBeenCalledWith(true)
      expect(confirmSpy).not.toHaveBeenCalled()
    } finally {
      useAuthSpy.mockRestore()
    }
  })
})
