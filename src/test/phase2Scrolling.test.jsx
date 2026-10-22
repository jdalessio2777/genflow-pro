import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, fireEvent, screen } from '@testing-library/react'
import { Textarea } from '@/components/ui/textarea'
import { keepFieldVisible, isTextField } from '@/hooks/useKeyboardAware'
import BottomActionBar from '@/components/layout/BottomActionBar'

const rect = (top, height) => ({ top, bottom: top + height, height, left: 0, right: 100, width: 100, x: 0, y: top })

describe('Textarea grows instead of scrolling inside', () => {
  it('never scrolls internally and resizes to its content on input', () => {
    const { container } = render(<Textarea defaultValue="a" />)
    const ta = container.querySelector('textarea')
    expect(ta.style.overflowY).toBe('hidden')
    Object.defineProperty(ta, 'scrollHeight', { configurable: true, get: () => 140 })
    fireEvent.input(ta, { target: { value: 'a\nb\nc\nd' } })
    expect(ta.style.height).toBe('140px')
  })
  it('forwards refs and onInput', () => {
    const ref = React.createRef(); const onInput = vi.fn()
    const { container } = render(<Textarea ref={ref} onInput={onInput} />)
    fireEvent.input(container.querySelector('textarea'), { target: { value: 'x' } })
    expect(ref.current).toBe(container.querySelector('textarea'))
    expect(onInput).toHaveBeenCalled()
  })
})

describe('keepFieldVisible (keyboard never covers the field)', () => {
  const vv = { offsetTop: 0, height: 323 }
  const field = (top, height, tag = 'input') => { const el = document.createElement(tag); el.getBoundingClientRect = () => rect(top, height); document.body.appendChild(el); return el }
  it('scrolls a field below the keyboard up into view', () => {
    const spy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    const dy = keepFieldVisible(field(490, 36), { vv, topReserve: 132 })
    expect(dy).toBe(490 + 36 - (323 - 12))
    spy.mockRestore()
  })
  it('a text box taller than the visible band is left alone (iOS keeps the caret in view; Run 8 A1)', () => {
    const spy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    const dy = keepFieldVisible(field(250, 200, 'textarea'), { vv, topReserve: 180 })
    expect(dy).toBe(0)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
  it('does nothing for a visible field or a non-text control', () => {
    expect(keepFieldVisible(field(200, 36), { vv, topReserve: 100 })).toBe(0)
    const cb = field(600, 20); cb.type = 'checkbox'
    expect(isTextField(cb)).toBe(false)
    expect(keepFieldVisible(cb, { vv, topReserve: 0 })).toBe(0)
  })
})

describe('BottomActionBar', () => {
  it('renders nothing and reserves no space when no action applies', () => {
    const { container } = render(<BottomActionBar>{false}{null}</BottomActionBar>);
    expect(container.firstChild).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--action-h')).toBe('');
  });
  it('renders the bar when an action applies', () => {
    render(<BottomActionBar>{false}<button>Dispatch</button></BottomActionBar>);
    expect(screen.getByTestId('bottom-action-bar')).toBeTruthy();
  });
});
