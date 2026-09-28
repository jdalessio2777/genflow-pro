import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { initSignatureCanvas } from '../lib/signatureCanvas.js'
import SignatureGuideOverlay from '../components/ui/SignatureGuideOverlay.jsx'

describe('signature pad', () => {
  it('initSignatureCanvas paints only the white background (no hint text or guide line)', () => {
    const ctx = { fillRect: vi.fn(), fillText: vi.fn(), stroke: vi.fn(), setLineDash: vi.fn(), beginPath: vi.fn() }
    const canvas = { width: 300, height: 150, getContext: () => ctx }
    initSignatureCanvas(canvas)
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 300, 150)
    expect(ctx.fillStyle).toBe('#ffffff')
    expect(ctx.fillText).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
    expect(ctx.setLineDash).not.toHaveBeenCalled()
  })

  it('guide overlay is DOM, hidden from a11y and non-interactive', () => {
    const { getByTestId } = render(<SignatureGuideOverlay />)
    const el = getByTestId('signature-guide')
    expect(el.textContent).toContain('Sign here')
    expect(el.getAttribute('aria-hidden')).toBe('true')
    expect(el.style.pointerEvents).toBe('none')
  })
})
