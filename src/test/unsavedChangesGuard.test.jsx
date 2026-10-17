import { describe, it, expect } from 'vitest'
import React, { useState } from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { useUnsavedChangesGuard, UnsavedChangesProvider } from '@/hooks/useUnsavedChangesGuard'

function Page() {
  const [dirty, setDirty] = useState(false)
  const guard = useUnsavedChangesGuard(dirty)
  const navigate = useNavigate()
  return (
    <div>
      <button onClick={() => setDirty(d => !d)}>toggle</button>
      <Link to="/home">home link</Link>
      <button onClick={() => navigate(-1)}>back</button>
      <button onClick={() => navigate('/catalog?section=parts')}>section</button>
      <button onClick={() => guard.confirmThen(() => setDirty(false))}>local action</button>
      {guard.blocked && (
        <div role="dialog">
          <button onClick={guard.stay}>Stay</button>
          <button onClick={guard.leave}>Leave</button>
          {/* like an AlertDialogAction: the action, then the dialog's own close */}
          <button onClick={() => { guard.leave(); guard.stay() }}>Leave then close</button>
        </div>
      )}
    </div>
  )
}
function Layout() {
  return (
    <UnsavedChangesProvider>
      <p data-testid="loc">{useLocation().pathname + useLocation().search}</p>
      <Outlet />
    </UnsavedChangesProvider>
  )
}
let router
const setup = () => {
  router = createMemoryRouter([
    { element: <Layout />, children: [
      { path: '/catalog', element: <Page /> },
      { path: '*', element: <p>elsewhere</p> },
    ] },
  ], { initialEntries: ['/start', '/catalog'], initialIndex: 1 })
  return render(<RouterProvider router={router} />)
}
const loc = () => screen.getByTestId('loc').textContent

describe('useUnsavedChangesGuard (data router useBlocker)', () => {
  it('does not prompt when clean', async () => {
    setup()
    fireEvent.click(screen.getByText('home link'))
    await waitFor(() => expect(loc()).toBe('/home'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('prompts on Link when dirty; Stay keeps the page, Leave navigates', async () => {
    setup()
    fireEvent.click(screen.getByText('toggle'))
    fireEvent.click(screen.getByText('home link'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    expect(loc()).toBe('/catalog')
    fireEvent.click(screen.getByText('Stay'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(loc()).toBe('/catalog')
    fireEvent.click(screen.getByText('home link'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    fireEvent.click(screen.getByText('Leave'))
    await waitFor(() => expect(loc()).toBe('/home'))
  })

  it('guards the in-app back button', async () => {
    setup()
    fireEvent.click(screen.getByText('toggle'))
    fireEvent.click(screen.getByText('back'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    expect(loc()).toBe('/catalog')
    fireEvent.click(screen.getByText('Leave'))
    await waitFor(() => expect(loc()).toBe('/start'))
  })

  it('guards a history POP (iOS edge swipe / browser back) — H-12', async () => {
    setup()
    fireEvent.click(screen.getByText('toggle'))
    await act(async () => { await router.navigate(-1) })
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    expect(loc()).toBe('/catalog')
    fireEvent.click(screen.getByText('Stay'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(loc()).toBe('/catalog')
  })

  it('also guards a query-string change (catalog sections)', async () => {
    setup()
    fireEvent.click(screen.getByText('toggle'))
    fireEvent.click(screen.getByText('section'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    expect(loc()).toBe('/catalog')
  })

  it('confirmThen runs immediately when clean, asks first when dirty', async () => {
    setup()
    fireEvent.click(screen.getByText('local action'))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByText('toggle'))
    fireEvent.click(screen.getByText('local action'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByText('Leave'))
    // action ran (dirty cleared) -> navigation is no longer guarded
    fireEvent.click(screen.getByText('home link'))
    await waitFor(() => expect(loc()).toBe('/home'))
  })

  it('Leave from an alert dialog (action, then its close) still leaves — H-12 Discard', async () => {
    setup()
    fireEvent.click(screen.getByText('toggle'))
    await act(async () => { await router.navigate(-1) })
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    fireEvent.click(screen.getByText('Leave then close'))
    await waitFor(() => expect(loc()).toBe('/start'))
  })
})
