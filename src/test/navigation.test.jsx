import { describe, it, expect, beforeEach } from 'vitest'
import React, { useState } from 'react'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import { createBrowserRouter, RouterProvider, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { installNavigationHooks } from '@/router'
import { useBack } from '@/hooks/useBack'
import { useUrlState } from '@/hooks/useUrlState'
import { parentFor, defaultTabFor, currentEntry, tabLast, __resetNavigationStore, historyIdx } from '@/lib/navigation'
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'

function Screen() {
  const { pathname, search, state } = useLocation()
  const back = useBack()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useUrlState('q', '')
  const [tab, setTab] = useUrlState('tab', 'active')
  return (
    <div>
      <p data-testid="loc">{pathname + search}</p>
      <p data-testid="sheet">{state?.__sheet ? 'sheet' : 'page'}</p>
      <button onClick={back}>arrow</button>
      <button onClick={() => setOpen(true)}>open sheet</button>
      <button onClick={() => { setTab('history'); setQ('') }}>history tab</button>
      <button onClick={() => setQ('smith')}>search</button>
      <span data-testid="state">{tab}|{q}</span>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>Cancel job?</AlertDialogTitle>
          <AlertDialogDescription>d</AlertDialogDescription>
          <AlertDialogCancel>Keep</AlertDialogCancel>
          <AlertDialogAction onClick={() => navigate('/invoices/i1')}>Go invoice</AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
function Layout() { return <Outlet /> }

let router
function mount(path) {
  cleanup()
  __resetNavigationStore()
  window.history.replaceState(null, '', path)
  router = installNavigationHooks(createBrowserRouter([{ element: <Layout />, children: [{ path: '*', element: <Screen /> }] }]))
  render(<RouterProvider router={router} />)
}
const loc = () => screen.getByTestId('loc').textContent
const go = async (to, opts) => { await act(async () => { await router.navigate(to, opts) }) }
const swipe = async () => { await act(async () => { router.navigate(-1) }) }

describe('route parents and tabs', () => {
  it('parents', () => {
    expect(parentFor({ pathname: '/jobs/abc' })).toBe('/jobs')
    expect(parentFor({ pathname: '/jobs/abc/edit' })).toBe('/jobs/abc')
    expect(parentFor({ pathname: '/customers/c1/edit' })).toBe('/customers/c1')
    expect(parentFor({ pathname: '/customers/c1/membership' })).toBe('/customers/c1')
    expect(parentFor({ pathname: '/catalog', search: '?section=parts&sub=filters' })).toBe('/catalog?section=parts')
    expect(parentFor({ pathname: '/catalog', search: '?section=parts' })).toBe('/catalog')
    expect(parentFor({ pathname: '/catalog' })).toBeNull()
    expect(parentFor({ pathname: '/inbox' })).toBeNull()
    expect(parentFor({ pathname: '/invoices/i1/send' })).toBe('/invoices/i1')
  })
  it('default tabs', () => {
    expect(defaultTabFor('/jobs/x')).toBe('jobs')
    expect(defaultTabFor('/quotes/q')).toBe('inbox')
    expect(defaultTabFor('/invoices/i')).toBe('home')
    expect(defaultTabFor('/documents/fill/d')).toBe('jobs')
  })
})

describe('useBack: arrow and swipe agree', () => {
  beforeEach(() => mount('/customers/c1'))

  it('arrow pops to the screen you came from (customer → job → customer)', async () => {
    await go('/jobs/j1')
    fireEvent.click(screen.getByText('arrow'))
    await waitFor(() => expect(loc()).toBe('/customers/c1'))
    expect(historyIdx()).toBe(0)
  })

  it('cold start: arrow replaces with the logical parent (never dead)', async () => {
    mount('/jobs/j9')
    fireEvent.click(screen.getByText('arrow'))
    await waitFor(() => expect(loc()).toBe('/jobs'))
    expect(historyIdx()).toBe(0)
  })

  it('a replaced form never reappears (create → replace → back)', async () => {
    await go('/jobs/new')
    await go('/jobs/j2', { replace: true })
    fireEvent.click(screen.getByText('arrow'))
    await waitFor(() => expect(loc()).toBe('/customers/c1'))
  })

  it('a pushed screen belongs to the tab it was opened from', async () => {
    await go('/jobs/j1')
    expect(currentEntry().tab).toBe('customers')
    expect(tabLast('customers')).toBe('/jobs/j1')
  })
})

describe('sheets get a history entry (F-10)', () => {
  beforeEach(() => mount('/jobs/j1'))

  it('back swipe closes the sheet and stays on the screen', async () => {
    await go('/jobs/j1?x=1')
    const before = historyIdx()
    fireEvent.click(screen.getByText('open sheet'))
    await waitFor(() => expect(screen.getByTestId('sheet').textContent).toBe('sheet'))
    expect(historyIdx()).toBe(before + 1)
    await swipe()
    await waitFor(() => expect(screen.queryByText('Cancel job?')).toBeNull())
    expect(loc()).toBe('/jobs/j1?x=1')
    expect(historyIdx()).toBe(before)
  })

  it('closing from the UI removes the entry (no dead entry left)', async () => {
    const before = historyIdx()
    fireEvent.click(screen.getByText('open sheet'))
    await waitFor(() => expect(historyIdx()).toBe(before + 1))
    fireEvent.click(screen.getByText('Keep'))
    await waitFor(() => expect(historyIdx()).toBe(before))
    expect(screen.getByTestId('sheet').textContent).toBe('page')
  })

  it('an action that navigates replaces the sheet entry', async () => {
    const before = historyIdx()
    fireEvent.click(screen.getByText('open sheet'))
    await waitFor(() => expect(historyIdx()).toBe(before + 1))
    fireEvent.click(screen.getByText('Go invoice'))
    await waitFor(() => expect(loc()).toBe('/invoices/i1'))
    await new Promise(r => setTimeout(r, 50))
    expect(historyIdx()).toBe(before + 1)
    expect(loc()).toBe('/invoices/i1')
    await swipe()
    await waitFor(() => expect(loc()).toBe('/jobs/j1'))
  })

  it('the arrow with a sheet open pops past it', async () => {
    mount('/customers/c1')
    await go('/jobs/j1')
    fireEvent.click(screen.getByText('open sheet'))
    await waitFor(() => expect(historyIdx()).toBe(2))
    fireEvent.click(screen.getByText('arrow'))
    await waitFor(() => expect(loc()).toBe('/customers/c1'))
  })
})

describe('list state in the URL (F-08)', () => {
  beforeEach(() => mount('/jobs'))
  it('several updates in one tick merge; the entry is replaced', async () => {
    fireEvent.click(screen.getByText('search'))
    await waitFor(() => expect(loc()).toBe('/jobs?q=smith'))
    fireEvent.click(screen.getByText('history tab'))
    await waitFor(() => expect(loc()).toBe('/jobs?tab=history'))
    expect(screen.getByTestId('state').textContent).toBe('history|')
    expect(historyIdx()).toBe(0)
  })
  it('back to the list restores its state', async () => {
    fireEvent.click(screen.getByText('history tab'))
    await waitFor(() => expect(loc()).toBe('/jobs?tab=history'))
    await go('/jobs/j1')
    await swipe()
    await waitFor(() => expect(loc()).toBe('/jobs?tab=history'))
    expect(screen.getByTestId('state').textContent).toBe('history|')
  })
})

describe('tab of an entry after a page load', () => {
  it('a new page load at a reused index takes the screen\'s own tab, not a stale one', async () => {
    mount('/')
    // simulate a full reload onto another screen at the same history index
    cleanup()
    window.history.replaceState({ idx: 0 }, '', '/customers')
    router = installNavigationHooks(createBrowserRouter([{ element: <Layout />, children: [{ path: '*', element: <Screen /> }] }]))
    render(<RouterProvider router={router} />)
    expect(currentEntry().tab).toBe('customers')
  })
})
