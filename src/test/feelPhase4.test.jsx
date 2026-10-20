import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, act, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePullToRefresh, PullToRefreshIndicator, PULL_THRESHOLD } from '@/hooks/usePullToRefresh'

function Probe({ enabled = true }) {
  const ptr = usePullToRefresh(enabled)
  return <PullToRefreshIndicator {...ptr} />
}

const fire = (type, x, y) => {
  const ev = new Event(type, { bubbles: true })
  const t = { clientX: x, clientY: y }
  Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [t] })
  act(() => { document.body.dispatchEvent(ev) })
}
const pull = (x, y0, dy) => {
  fire('touchstart', x, y0)
  for (let i = 1; i <= 6; i++) fire('touchmove', x, y0 + (dy * i) / 6)
  const state = document.querySelector('[data-testid="pull-to-refresh"]')?.dataset.state || 'none'
  fire('touchend', x, y0 + dy)
  return state
}

describe('pull-to-refresh (Feel Phase 4)', () => {
  let qc
  beforeEach(() => {
    cleanup()
    qc = new QueryClient()
    vi.spyOn(qc, 'invalidateQueries').mockResolvedValue()
    window.scrollY = 0
  })
  const mount = (enabled) => render(<QueryClientProvider client={qc}><Probe enabled={enabled} /></QueryClientProvider>)

  it('a pull past the threshold at the top refreshes what is on screen', () => {
    mount(true)
    expect(pull(200, 200, PULL_THRESHOLD * 2 + 40)).toBe('release')
    expect(qc.invalidateQueries).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-testid="pull-to-refresh"]').dataset.state).toBe('refreshing')
  })

  it('a short pull does nothing', () => {
    mount(true)
    expect(pull(200, 200, 60)).toBe('pulling')
    expect(qc.invalidateQueries).not.toHaveBeenCalled()
  })

  it('leaves the iOS back-swipe edge, scrolled pages, upward drags and sideways swipes alone', () => {
    mount(true)
    pull(10, 200, 250) // left edge
    pull(200, 400, -250) // scroll up
    fire('touchstart', 200, 200); fire('touchmove', 260, 205); fire('touchmove', 330, 260); fire('touchend', 330, 260) // row swipe
    window.scrollY = 120
    pull(200, 200, 250) // not at the top
    expect(qc.invalidateQueries).not.toHaveBeenCalled()
  })

  it('does nothing while a dialog is open or when disabled', () => {
    mount(true)
    const d = document.createElement('div'); d.setAttribute('role', 'dialog'); document.body.appendChild(d)
    pull(200, 200, 250)
    d.remove()
    cleanup(); mount(false)
    pull(200, 200, 250)
    expect(qc.invalidateQueries).not.toHaveBeenCalled()
  })
})
