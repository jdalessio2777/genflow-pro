import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import {
  sanitizeStockInput,
  parseStockDraft,
  resolveStockDraftOnBlur,
  stepStockDraft,
  isStockDraftDirty,
  stockUpdatePatch,
  resolveBulkCommit,
} from '@/lib/utils/stockDraft'
import StockEditor from '@/components/catalog/StockEditor'

describe('sanitizeStockInput', () => {
  it('keeps digits only, max 4', () => {
    expect(sanitizeStockInput('17')).toBe('17')
    expect(sanitizeStockInput('-3')).toBe('3')
    expect(sanitizeStockInput('1a2.')).toBe('12')
    expect(sanitizeStockInput('123456')).toBe('1234')
    expect(sanitizeStockInput('')).toBe('')
  })
})

describe('parseStockDraft', () => {
  it('parses valid counts including 0', () => {
    expect(parseStockDraft('0')).toBe(0)
    expect(parseStockDraft('17')).toBe(17)
    expect(parseStockDraft('007')).toBe(7)
    expect(parseStockDraft(' 5 ')).toBe(5)
  })
  it('returns null for empty / non-numeric / negative', () => {
    expect(parseStockDraft('')).toBeNull()
    expect(parseStockDraft(null)).toBeNull()
    expect(parseStockDraft('abc')).toBeNull()
    expect(parseStockDraft('-2')).toBeNull()
    expect(parseStockDraft('1.5')).toBeNull()
  })
  it('caps at 9999', () => {
    expect(parseStockDraft('99999')).toBe(9999)
  })
})

describe('resolveStockDraftOnBlur', () => {
  it('reverts empty/invalid to fallback', () => {
    expect(resolveStockDraftOnBlur('', 5)).toBe('5')
    expect(resolveStockDraftOnBlur('x', 0)).toBe('0')
    expect(resolveStockDraftOnBlur('', undefined)).toBe('0')
  })
  it('normalizes valid input and allows 0', () => {
    expect(resolveStockDraftOnBlur('0', 5)).toBe('0')
    expect(resolveStockDraftOnBlur('012', 5)).toBe('12')
  })
})

describe('stepStockDraft', () => {
  it('steps and clamps at 0', () => {
    expect(stepStockDraft('5', 1, 5)).toBe('6')
    expect(stepStockDraft('5', -1, 5)).toBe('4')
    expect(stepStockDraft('0', -1, 5)).toBe('0')
    expect(stepStockDraft('9999', 1, 0)).toBe('9999')
  })
  it('steps from fallback when draft is empty', () => {
    expect(stepStockDraft('', 1, 5)).toBe('6')
    expect(stepStockDraft('', -1, 0)).toBe('0')
  })
})

describe('isStockDraftDirty', () => {
  it('is dirty only for a valid, different value', () => {
    expect(isStockDraftDirty('5', 5)).toBe(false)
    expect(isStockDraftDirty('05', 5)).toBe(false)
    expect(isStockDraftDirty('17', 5)).toBe(true)
    expect(isStockDraftDirty('0', 5)).toBe(true)
    expect(isStockDraftDirty('', 5)).toBe(false)
    expect(isStockDraftDirty('0', null)).toBe(false)
  })
})

describe('stockUpdatePatch', () => {
  const managed = { id: 'p', first_managed_at: '2026-01-01T00:00:00Z', reorder_flagged: true }
  const fresh = { id: 'q', first_managed_at: null, reorder_flagged: false }

  it('day-to-day: flags reorder at 0, otherwise preserves the flag', () => {
    expect(stockUpdatePatch(managed, 0)).toEqual({ in_stock: 0, reorder_flagged: true })
    expect(stockUpdatePatch(managed, 3)).toEqual({ in_stock: 3, reorder_flagged: true })
    expect(stockUpdatePatch({ ...managed, reorder_flagged: null }, 3)).toEqual({ in_stock: 3, reorder_flagged: false })
  })
  it('bulk: reorder flag is exactly stock === 0', () => {
    expect(stockUpdatePatch(managed, 3, { clearReorderWhenStocked: true })).toEqual({ in_stock: 3, reorder_flagged: false })
    expect(stockUpdatePatch(managed, 0, { clearReorderWhenStocked: true })).toEqual({ in_stock: 0, reorder_flagged: true })
  })
  it('sets first_managed_at once for unmanaged parts', () => {
    const patch = stockUpdatePatch(fresh, 4)
    expect(patch.in_stock).toBe(4)
    expect(typeof patch.first_managed_at).toBe('string')
    expect('first_managed_at' in stockUpdatePatch(managed, 4)).toBe(false)
  })
})

describe('StockEditor', () => {
  const part = { id: 'p1', name: 'ZZ Part', in_stock: 5, first_managed_at: null }
  const input = () => screen.getByLabelText('In stock for ZZ Part')

  it('type -> unsaved -> Save -> Saved', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<StockEditor part={part} onSave={onSave} />)
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()

    fireEvent.focus(input())
    fireEvent.change(input(), { target: { value: '' } })
    expect(input().value).toBe('')
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    fireEvent.change(input(), { target: { value: '17' } })
    expect(screen.getByText(/Unsaved/)).toBeTruthy()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(onSave).toHaveBeenCalledWith(17)
    rerender(<StockEditor part={{ ...part, in_stock: 17 }} onSave={onSave} />)
    expect(screen.getByText('Saved')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(input().value).toBe('17')
  })

  it('+/- edit the draft only; blur on empty reverts', () => {
    const onSave = vi.fn()
    render(<StockEditor part={part} onSave={onSave} />)
    fireEvent.click(screen.getByLabelText('Increase stock'))
    fireEvent.click(screen.getByLabelText('Increase stock'))
    expect(input().value).toBe('7')
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()

    fireEvent.focus(input())
    fireEvent.change(input(), { target: { value: '' } })
    fireEvent.blur(input())
    expect(input().value).toBe('7')
  })

  it('shows an error and keeps the draft when save fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('network down'))
    render(<StockEditor part={part} onSave={onSave} />)
    fireEvent.change(input(), { target: { value: '9' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })) })
    expect(screen.getByRole('alert').textContent).toMatch(/Not saved/)
    expect(screen.queryByText(/network down/)).toBeNull()
    expect(input().value).toBe('9')
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
  })

  it('adopts a new DB value when there is no unsaved edit', () => {
    const { rerender } = render(<StockEditor part={part} onSave={vi.fn()} />)
    rerender(<StockEditor part={{ ...part, in_stock: 2 }} onSave={vi.fn()} />)
    expect(input().value).toBe('2')
  })

  it('reports dirty on edit, clean on revert, and clean on unmount', () => {
    const onDirty = vi.fn()
    const { unmount } = render(<StockEditor part={part} onSave={vi.fn()} onDirtyChange={onDirty} />)
    fireEvent.click(screen.getByLabelText('Increase stock'))
    expect(onDirty).toHaveBeenLastCalledWith(true)
    fireEvent.click(screen.getByLabelText('Decrease stock'))
    expect(onDirty).toHaveBeenLastCalledWith(false)
    fireEvent.click(screen.getByLabelText('Increase stock'))
    unmount()
    expect(onDirty).toHaveBeenLastCalledWith(false)
  })
})

describe('resolveBulkCommit', () => {
  it('blank / invalid reverts to saved with no write', () => {
    expect(resolveBulkCommit('', 7)).toEqual({ display: '7', write: null })
    expect(resolveBulkCommit(undefined, 0)).toEqual({ display: '0', write: null })
  })
  it('explicit 0 writes 0; unchanged value does not write', () => {
    expect(resolveBulkCommit('0', 7)).toEqual({ display: '0', write: 0 })
    expect(resolveBulkCommit('7', 7)).toEqual({ display: '7', write: null })
    expect(resolveBulkCommit('023', 7)).toEqual({ display: '23', write: 23 })
  })
})
