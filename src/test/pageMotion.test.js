import { describe, it, expect, beforeEach, vi } from 'vitest'
import { installPageMotion, setNavDirection, __resetPageMotion, pageMotionSupported } from '../lib/pageMotion.js'

// C2: page push/back direction; iOS edge swipe never animated twice; reduced motion skips.
function fakeWindow({ reduce = false } = {}) {
  const listeners = {}
  const root = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v }, getAttribute(k) { return this.attrs[k] ?? null }, removeAttribute(k) { delete this.attrs[k] } }
  const transitions = []
  const doc = {
    documentElement: root,
    startViewTransition: (cb) => { let done; const t = { skipped: false, skipTransition() { this.skipped = true }, finished: new Promise(r => { done = r }), finish: () => done() }; transitions.push(t); cb?.(); return t },
  }
  return {
    document: doc, transitions, root,
    matchMedia: () => ({ matches: reduce }),
    addEventListener: (t, fn) => { listeners[t] = fn },
    pop: (e) => listeners.popstate?.(e),
  }
}

beforeEach(() => __resetPageMotion())

describe('page motion (C2)', () => {
  it('push slides in; back slides out; the attribute clears when done', async () => {
    const w = fakeWindow(); expect(installPageMotion(w)).toBe(true)
    expect(w.root.getAttribute('data-vt')).toBe('')
    setNavDirection('push'); const t = w.document.startViewTransition(() => {})
    expect(w.root.getAttribute('data-nav')).toBe('push'); expect(t.skipped).toBe(false)
    t.finish(); await t.finished; await Promise.resolve()
    expect(w.root.getAttribute('data-nav')).toBeNull()
    setNavDirection('back'); w.document.startViewTransition(() => {})
    expect(w.root.getAttribute('data-nav')).toBe('back')
  })
  it('a browser back (popstate) slides back; the iOS edge swipe (hasUAVisualTransition) is not animated again', () => {
    const w = fakeWindow(); installPageMotion(w)
    w.pop({ hasUAVisualTransition: false }); w.document.startViewTransition(() => {})
    expect(w.root.getAttribute('data-nav')).toBe('back')
    w.pop({ hasUAVisualTransition: true }); const t = w.document.startViewTransition(() => {})
    expect(t.skipped).toBe(true)
  })
  it('reduced motion: every transition is skipped (the screen just appears)', () => {
    const w = fakeWindow({ reduce: true }); installPageMotion(w)
    setNavDirection('push'); const t = w.document.startViewTransition(() => {})
    expect(t.skipped).toBe(true); expect(w.root.getAttribute('data-nav')).toBeNull()
  })
  it('no View Transitions support: nothing installed', () => {
    expect(installPageMotion({ document: { documentElement: {} } })).toBe(false)
    expect(pageMotionSupported({})).toBe(false)
  })
})
