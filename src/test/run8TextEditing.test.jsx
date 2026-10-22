import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React, { useState } from 'react'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, Outlet, Link, useLocation } from 'react-router-dom'
import { useKeyboardAware } from '@/hooks/useKeyboardAware'
import { UnsavedChangesProvider } from '@/hooks/useUnsavedChangesGuard'
import LongTextField from '@/components/ui/LongTextField'
import { readDraft, writeDraft, markDraftsSaved, draftToRestore, draftStorageKey } from '@/lib/textDrafts'
import { shouldShowCheckAll } from '@/lib/checklistCheckAll'
import { memoryStorage } from './memoryStorage'

vi.stubGlobal('localStorage', memoryStorage())

const rect = (top, height) => ({ top, bottom: top + height, height, left: 0, right: 100, width: 100, x: 0, y: top })

// ── A1: the shaking ───────────────────────────────────────────────────────────
// iOS fires visualViewport "scroll" on every page scroll while the keyboard is
// up. The old hook re-ran keepFieldVisible 60 ms after each one and pinned a
// tall text box's bottom above the keyboard: every finger scroll was undone.
describe('A1: keyboard handling never scrolls the page in response to scrolling or typing', () => {
  let vv, scrollBy
  function Harness() { useKeyboardAware(); return null }
  beforeEach(() => {
    vi.useFakeTimers()
    vv = new EventTarget()
    vv.height = 800; vv.width = 390; vv.offsetTop = 0
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => vv })
    Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => 800 })
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { cb(0); return 1 })
    scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
  })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); document.body.innerHTML = '' })

  const openKeyboard = () => { vv.height = 464; vv.dispatchEvent(new Event('resize')); vi.advanceTimersByTime(100) }

  it('a 60-line box (taller than the screen): no programmatic scroll on focus, keyboard, 40 scroll events or typing', () => {
    render(<Harness />)
    const ta = document.createElement('textarea'); document.body.appendChild(ta)
    ta.getBoundingClientRect = () => rect(-1200, 4338)
    ta.focus(); fireEvent.focusIn(ta); vi.advanceTimersByTime(100)
    openKeyboard()
    for (let i = 0; i < 40; i++) { vv.dispatchEvent(new Event('scroll')); window.dispatchEvent(new Event('scroll')); vi.advanceTimersByTime(16) }
    vi.advanceTimersByTime(200)
    fireEvent.input(ta, { target: { value: 'more words' } }); vi.advanceTimersByTime(200)
    expect(scrollBy).not.toHaveBeenCalled()
  })

  it('a short field under the keyboard is revealed ONCE when the keyboard opens, never again on scroll', () => {
    render(<Harness />)
    const input = document.createElement('input'); document.body.appendChild(input)
    let top = 600
    input.getBoundingClientRect = () => rect(top, 44)
    input.focus(); fireEvent.focusIn(input)
    openKeyboard()
    expect(scrollBy).toHaveBeenCalledTimes(1)
    // the user scrolls the field back down under the keyboard on purpose
    top = 520
    for (let i = 0; i < 20; i++) { vv.dispatchEvent(new Event('scroll')); vi.advanceTimersByTime(16) }
    vi.advanceTimersByTime(200)
    expect(scrollBy).toHaveBeenCalledTimes(1)
  })

  it('fields inside the full-screen editor are never moved', () => {
    render(<Harness />)
    const wrap = document.createElement('div'); wrap.setAttribute('data-no-kb-scroll', ''); document.body.appendChild(wrap)
    const ta = document.createElement('textarea'); wrap.appendChild(ta)
    ta.getBoundingClientRect = () => rect(600, 40)
    ta.focus(); fireEvent.focusIn(ta)
    openKeyboard()
    expect(scrollBy).not.toHaveBeenCalled()
  })
})

// ── A4: drafts ────────────────────────────────────────────────────────────────
describe('A4: text drafts (lib)', () => {
  beforeEach(() => localStorage.clear())
  it('per record and field; markDraftsSaved clears only that record', () => {
    writeDraft('job:A:invoice_notes', 'text A', '')
    writeDraft('job:B:invoice_notes', 'text B', '')
    expect(readDraft('job:A:invoice_notes').text).toBe('text A')
    markDraftsSaved('job:A:')
    expect(readDraft('job:A:invoice_notes')).toBeNull()
    expect(readDraft('job:B:invoice_notes').text).toBe('text B')
  })
  it('restores only when the draft differs from what is on screen', () => {
    expect(draftToRestore({ text: 'x' }, 'x')).toBeNull()
    expect(draftToRestore({ text: 'typed' }, 'saved')).toBe('typed')
    expect(draftToRestore({ text: '' }, 'saved')).toBe('')
    expect(draftToRestore(null, 'saved')).toBeNull()
  })
  it('a corrupt entry is ignored', () => {
    localStorage.setItem(draftStorageKey('k'), '{not json')
    expect(readDraft('k')).toBeNull()
  })
})

function Field({ draftKey = 'quote:new:scope_notes', saved = '', initial = '' }) {
  const [v, setV] = useState(initial)
  return <LongTextField value={v} onChange={setV} savedValue={saved} draftKey={draftKey} title="Scope of Work" rows={10} data-testid="f" />
}

describe('A4: LongTextField keeps typed text through a reload', () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers() })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('writes a draft as you type and restores it after a remount, with a note and Discard', () => {
    const r = render(<Field />)
    fireEvent.change(screen.getByTestId('f'), { target: { value: 'line 1\nline 2' } })
    act(() => { vi.advanceTimersByTime(500) })
    expect(readDraft('quote:new:scope_notes').text).toBe('line 1\nline 2')
    r.unmount() // app killed / reloaded
    render(<Field />)
    expect(screen.getByTestId('f').value).toBe('line 1\nline 2')
    expect(screen.getByTestId('draft-restored').textContent).toMatch(/Restored unsaved text/)
    fireEvent.click(screen.getByText('Discard'))
    expect(screen.getByTestId('f').value).toBe('')
    expect(readDraft('quote:new:scope_notes')).toBeNull()
  })

  it('saves the draft immediately when the app is hidden (no debounce wait)', () => {
    render(<Field />)
    fireEvent.change(screen.getByTestId('f'), { target: { value: 'typed right before the lock' } })
    window.dispatchEvent(new Event('pagehide'))
    expect(readDraft('quote:new:scope_notes').text).toBe('typed right before the lock')
  })

  it('never restores another record\'s draft', () => {
    writeDraft('job:A:invoice_notes', 'for job A', '')
    render(<Field draftKey="job:B:invoice_notes" />)
    expect(screen.getByTestId('f').value).toBe('')
    expect(screen.queryByTestId('draft-restored')).toBeNull()
  })

  it('a draft equal to the saved text is dropped, not restored', () => {
    writeDraft('job:A:invoice_notes', 'already saved', '')
    render(<Field draftKey="job:A:invoice_notes" saved="already saved" initial="already saved" />)
    expect(screen.queryByTestId('draft-restored')).toBeNull()
    expect(readDraft('job:A:invoice_notes')).toBeNull()
  })

  it('clears after a successful save', () => {
    render(<Field />)
    fireEvent.change(screen.getByTestId('f'), { target: { value: 'sent text' } })
    act(() => { vi.advanceTimersByTime(500) })
    act(() => { markDraftsSaved('quote:new:') })
    act(() => { vi.advanceTimersByTime(500) })
    expect(readDraft('quote:new:scope_notes')).toBeNull()
  })

  it('comfortable size: 10 lines, 16 px text, Expand button', () => {
    render(<Field />)
    const ta = screen.getByTestId('f')
    expect(ta.getAttribute('rows')).toBe('10')
    expect(ta.className).toMatch(/text-base/)
    expect(screen.getByLabelText('Expand Scope of Work')).toBeTruthy()
  })
})

describe('A3: full-screen editor', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => cleanup())
  it('Expand opens it with the text; Done saves back; Cancel with changes asks first', () => {
    render(<Field initial="first" />)
    fireEvent.click(screen.getByLabelText('Expand Scope of Work'))
    const ed = screen.getByTestId('fullscreen-editor-text')
    expect(ed.value).toBe('first')
    fireEvent.change(ed, { target: { value: 'first\nsecond' } })
    fireEvent.click(screen.getByTestId('fullscreen-editor-done'))
    expect(screen.queryByTestId('fullscreen-editor')).toBeNull()
    expect(screen.getByTestId('f').value).toBe('first\nsecond')

    fireEvent.click(screen.getByLabelText('Expand Scope of Work'))
    fireEvent.change(screen.getByTestId('fullscreen-editor-text'), { target: { value: 'changed' } })
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.getByText('Discard changes?')).toBeTruthy()
    fireEvent.click(screen.getByText('Keep editing'))
    expect(screen.getByTestId('fullscreen-editor-text').value).toBe('changed')
    fireEvent.click(screen.getByText('Cancel'))
    fireEvent.click(screen.getByText('Discard'))
    expect(screen.queryByTestId('fullscreen-editor')).toBeNull()
    expect(screen.getByTestId('f').value).toBe('first\nsecond')
  })
  it('the page underneath is held still while it is open', () => {
    render(<Field initial="x" />)
    fireEvent.click(screen.getByLabelText('Expand Scope of Work'))
    expect(document.body.style.position).toBe('fixed')
    fireEvent.click(screen.getByTestId('fullscreen-editor-done'))
    expect(document.body.style.position).toBe('')
  })
})

// ── A4: leaving with unsaved text asks first (back arrow, tab bar, swipe) ─────
describe('A4: leaving with unsaved text warns', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => cleanup())
  function Layout() {
    return <UnsavedChangesProvider><p data-testid="loc">{useLocation().pathname}</p><Link to="/home">home</Link><Outlet /></UnsavedChangesProvider>
  }
  it('asks; Stay keeps the screen; Leave goes and keeps the draft', async () => {
    const router = createMemoryRouter([{ element: <Layout />, children: [
      { path: '/quotes/new', element: <Field /> }, { path: '*', element: <p>elsewhere</p> },
    ] }], { initialEntries: ['/quotes/new'] })
    render(<RouterProvider router={router} />)
    fireEvent.change(screen.getByTestId('f'), { target: { value: 'half a scope' } })
    await act(async () => { fireEvent.click(screen.getByText('home')) })
    expect(screen.getByText('Leave without saving?')).toBeTruthy()
    expect(screen.getByTestId('loc').textContent).toBe('/quotes/new')
    await act(async () => { fireEvent.click(screen.getByText('Stay')) })
    expect(screen.getByTestId('loc').textContent).toBe('/quotes/new')
    await act(async () => { fireEvent.click(screen.getByText('home')) })
    await act(async () => { fireEvent.click(screen.getByText('Leave')) })
    expect(screen.getByTestId('loc').textContent).toBe('/home')
    expect(readDraft('quote:new:scope_notes').text).toBe('half a scope')
  })
  it('the back gesture (history pop) is held too', async () => {
    const router = createMemoryRouter([{ element: <Layout />, children: [
      { path: '/quotes/new', element: <Field /> }, { path: '*', element: <p>elsewhere</p> },
    ] }], { initialEntries: ['/jobs', '/quotes/new'], initialIndex: 1 })
    render(<RouterProvider router={router} />)
    fireEvent.change(screen.getByTestId('f'), { target: { value: 'typed' } })
    await act(async () => { router.navigate(-1) })
    expect(screen.getByText('Leave without saving?')).toBeTruthy()
    expect(screen.getByTestId('loc').textContent).toBe('/quotes/new')
  })
})

// ── B1: Check all on every checklist while it's being filled out ─────────────
describe('B1: Check all', () => {
  const docs = ['Annual Maintenance Checklist', 'Oil Change Visit Checklist', 'Warranty Claim Documentation', 'Anything New']
  it.each(docs)('shows on "%s" while in progress', (name) => {
    expect(shouldShowCheckAll({ template_name: name, status: 'in_progress' }, 9)).toBe(true)
  })
  it('never on a completed checklist, or one without checkboxes', () => {
    expect(shouldShowCheckAll({ template_name: 'Annual Maintenance Checklist', status: 'completed' }, 12)).toBe(false)
    expect(shouldShowCheckAll({ template_name: 'Notes only', status: 'in_progress' }, 0)).toBe(false)
    expect(shouldShowCheckAll(null, 3)).toBe(false)
  })
})
