// F4: the card sheet starts Stripe.js when it opens — not when the invoice
// screen's code loads — and hands Elements that one memoised promise.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, cleanup, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({ getStripe: vi.fn(), elementsProps: [] }))

vi.mock('@/lib/stripeLoader', () => ({ STRIPE_KEY: 'pk_test_unit', getStripe: h.getStripe }))
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: (props) => { h.elementsProps.push(props); return <div data-testid="elements" /> },
  CardElement: () => null,
  useStripe: () => null,
  useElements: () => null,
}))
vi.mock('@/hooks/usePreferences', () => ({ usePreferences: () => ({ darkMode: false }) }))
vi.mock('@/lib/useSettings', () => ({ useSettings: () => ({ settings: {} }) }))
vi.mock('@/lib/supabaseClient', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) } },
}))

import StripePaymentModal from '@/components/payments/StripePaymentModal'

const invoice = { id: 'inv-1', total: 100, amount_paid: 0 }

describe('StripePaymentModal lazy Stripe.js (F4)', () => {
  beforeEach(() => {
    cleanup()
    h.elementsProps.length = 0
    h.getStripe.mockReset()
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ client_secret: 'cs_1', payment_intent_id: 'pi_1' }) }))
  })

  it('closed: Stripe.js is not started and no payment intent is requested', () => {
    render(<StripePaymentModal invoice={invoice} open={false} onClose={() => {}} onPaid={() => {}} />)
    expect(h.getStripe).not.toHaveBeenCalled()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('opening starts Stripe.js once and Elements receives that promise', async () => {
    const p = Promise.resolve({ fake: 'stripe' })
    h.getStripe.mockReturnValue(p)
    const { rerender, findByTestId } = render(<StripePaymentModal invoice={invoice} open={false} onClose={() => {}} onPaid={() => {}} />)
    rerender(<StripePaymentModal invoice={invoice} open onClose={() => {}} onPaid={() => {}} />)
    await findByTestId('elements')
    await waitFor(() => expect(h.elementsProps.length).toBeGreaterThan(0))
    expect(h.getStripe).toHaveBeenCalledTimes(1)
    expect(h.elementsProps.every((pr) => pr.stripe === p)).toBe(true)
    expect(h.elementsProps.at(-1).options.clientSecret).toBe('cs_1')
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/create-payment-intent', expect.objectContaining({ method: 'POST' }))
  })
})
