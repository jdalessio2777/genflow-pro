import { describe, it, expect } from 'vitest'
import React, { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'

function Page() {
  const [dirty, setDirty] = useState(false)
  const guard = useUnsavedChangesGuard(dirty)
  const navigate = useNavigate()
  return (
    <div>
      <button onClick={() => setDirty(d => !d)}>toggle</button>
      <Link to="/home">home link</Link>
      <button onClick={() => navigate(-1)}>back</button>
      <button onClick={() => guard.confirmThen(() => setDirty(false))}>local action</button>
      {guard.blocked && (
        <div role="dialog">
          <button onClick={guard.stay}>Stay</button>
          <button onClick={guard.leave}>Leave</button>
        </div>
      )}
    </div>
  )
}
function Where() { return <p data-testid="loc">{useLocation().pathname}</p> }
const setup = () => render(
  <MemoryRouter initialEntries={['/start', '/catalog']} initialIndex={1}>
    <Where />
    <Routes>
      <Route path="/catalog" element={<Page />} />
      <Route path="*" element={<p>elsewhere</p>} />
    </Routes>
  </MemoryRouter>
)
const loc = () => screen.getByTestId('loc').textContent

describe('useUnsavedChangesGuard', () => {
  it('does not prompt when clean', () => {
    setup()
    fireEvent.click(screen.getByText('home link'))
    expect(loc()).toBe('/home')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('prompts on Link when dirty; Stay keeps the page, Leave navigates', () => {
    setup()
    fireEvent.click(screen.getByText('toggle'))
    fireEvent.click(screen.getByText('home link'))
    expect(loc()).toBe('/catalog')
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByText('Stay'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(loc()).toBe('/catalog')
    fireEvent.click(screen.getByText('home link'))
    fireEvent.click(screen.getByText('Leave'))
    expect(loc()).toBe('/home')
  })

  it('guards navigate(-1) (in-app back button)', () => {
    setup()
    fireEvent.click(screen.getByText('toggle'))
    fireEvent.click(screen.getByText('back'))
    expect(loc()).toBe('/catalog')
    fireEvent.click(screen.getByText('Leave'))
    expect(loc()).toBe('/start')
  })

  it('confirmThen runs immediately when clean, asks first when dirty', () => {
    setup()
    fireEvent.click(screen.getByText('local action'))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByText('toggle'))
    fireEvent.click(screen.getByText('local action'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByText('Leave'))
    // action ran (dirty cleared) -> navigation is no longer guarded
    fireEvent.click(screen.getByText('home link'))
    expect(loc()).toBe('/home')
  })
})
