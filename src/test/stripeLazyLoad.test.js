// F4: Stripe.js loads only when the card sheet opens, once.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { makeStripeLoader } from '@/lib/stripeLoader';

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('makeStripeLoader', () => {
  it('does nothing until asked, then imports + loadStripe(key) exactly once', async () => {
    const fake = { id: 'stripe' };
    const loadStripe = vi.fn().mockResolvedValue(fake);
    const importStripe = vi.fn().mockResolvedValue({ loadStripe });
    const get = makeStripeLoader('pk_test_abc', importStripe);
    expect(importStripe).not.toHaveBeenCalled();
    const p1 = get();
    const p2 = get();
    expect(p1).toBe(p2);
    await expect(p1).resolves.toBe(fake);
    expect(importStripe).toHaveBeenCalledTimes(1);
    expect(loadStripe).toHaveBeenCalledTimes(1);
    expect(loadStripe).toHaveBeenCalledWith('pk_test_abc');
  });

  it('returns null without a key and never imports Stripe', () => {
    const importStripe = vi.fn();
    expect(makeStripeLoader(undefined, importStripe)()).toBeNull();
    expect(importStripe).not.toHaveBeenCalled();
  });

  it('a failed load is retried on the next opening', async () => {
    const loadStripe = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: 1 });
    const get = makeStripeLoader('pk_test_x', () => Promise.resolve({ loadStripe }));
    await expect(get()).rejects.toThrow('offline');
    await expect(get()).resolves.toEqual({ ok: 1 });
    expect(loadStripe).toHaveBeenCalledTimes(2);
  });
});

describe('no module-level Stripe start-up', () => {
  it('nothing in src statically imports @stripe/stripe-js', () => {
    const files = [];
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'test') walk(p); } else if (/\.(jsx?|tsx?)$/.test(e.name)) files.push(p);
    });
    walk(root);
    const offenders = files.filter((f) => /^\s*import[^(]*['"]@stripe\/stripe-js['"]/m.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('the payment modal gets its stripe promise from getStripe() only while open', () => {
    const src = read('components/payments/StripePaymentModal.jsx');
    expect(src).not.toMatch(/loadStripe\(/);
    expect(src).toMatch(/useMemo\(\(\) => \(open \? getStripe\(\) : null\), \[open\]\)/);
    expect(src).toMatch(/<Elements stripe=\{stripePromise\}/);
  });
});
