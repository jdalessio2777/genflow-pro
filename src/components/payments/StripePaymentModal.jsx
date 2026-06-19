import { useState, useCallback, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useTheme } from 'next-themes';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CreditCard, ShieldCheck } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { haptics } from '@/lib/haptics';
import { toast } from 'sonner';

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = STRIPE_KEY ? loadStripe(STRIPE_KEY) : null;

const SURCHARGE_RATE = 0.03;

// ─── Inner form (must be inside <Elements>) ───────────────────────────────────
//
// Phase machine:
//   'entry'      — customer filling in card details
//   'locking'    — POST /api/update-payment-intent in flight
//   'confirming' — server returned locked {surcharge, total}; credit card only
//   'submitting' — stripe.confirmPayment in flight

function PaymentForm({ invoice, clientSecret, paymentIntentId, onSuccess, onClose }) {
  const stripe = useStripe();
  const elements = useElements();

  const [phase, setPhase] = useState('entry');
  const [paymentType, setPaymentType] = useState(null);
  const [funding, setFunding] = useState(null);
  const [storedPm, setStoredPm] = useState(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [lockedSurcharge, setLockedSurcharge] = useState(null);
  const [lockedTotal, setLockedTotal] = useState(null);
  const [lockError, setLockError] = useState(null);

  const baseAmount = invoice.total || 0;

  // Preview values shown during card entry — never sent to Stripe directly
  const previewSurcharge = funding === 'credit'
    ? Math.round(baseAmount * SURCHARGE_RATE * 100) / 100
    : 0;
  const previewTotal = baseAmount + previewSurcharge;

  // Confirmed values are only set after server responds; UI switches to them at that point
  const isConfirming = phase === 'confirming';
  const displaySurcharge = isConfirming ? lockedSurcharge : previewSurcharge;
  const displayTotal     = isConfirming ? lockedTotal     : previewTotal;

  const isLocking    = phase === 'locking';
  const isSubmitting = phase === 'submitting';
  const isBusy       = isLocking || isSubmitting;
  const isEstimate   = phase === 'entry' && funding === 'credit';

  // ── onChange: detect funding type as card is filled in ───────────────────────

  const handleChange = useCallback(async (event) => {
    const type = event.value?.type ?? null;
    setPaymentType(type);
    setIsComplete(event.complete);

    // Card edited back to incomplete: reset everything so the full flow reruns
    if (!event.complete) {
      setStoredPm(null);
      setFunding(null);
      setPhase('entry');
      setLockedSurcharge(null);
      setLockedTotal(null);
      setLockError(null);
      return;
    }

    if (event.complete && type === 'card' && stripe && elements && !storedPm) {
      setIsDetecting(true);
      try {
        const { paymentMethod, error } = await stripe.createPaymentMethod({ elements });
        if (!error && paymentMethod) {
          setStoredPm(paymentMethod);
          setFunding(paymentMethod.card?.funding ?? 'unknown');
        }
      } catch {
        // Detection failed — surcharge preview stays at 0; flow continues normally
      } finally {
        setIsDetecting(false);
      }
    }
  }, [stripe, elements, storedPm]);

  // ── Pass 1: lock the amount server-side ──────────────────────────────────────

  const handlePay = async () => {
    if (!stripe || !elements || !isComplete || phase !== 'entry') return;
    setPhase('locking');
    setLockError(null);

    try {
      // Ensure we have a payment method (should already exist from auto-detect)
      let pm = storedPm;
      if (!pm) {
        const { paymentMethod, error: pmErr } = await stripe.createPaymentMethod({ elements });
        if (pmErr) throw new Error(pmErr.message);
        pm = paymentMethod;
        setStoredPm(pm);
        setFunding(pm.card?.funding ?? 'unknown');
      }

      const cardFunding = pm.card?.funding;
      const clientSurcharge = cardFunding === 'credit'
        ? Math.round(baseAmount * SURCHARGE_RATE * 100) / 100
        : 0;

      // Always POST even when surcharge is 0 — this resets the PI amount if the user
      // previously attempted a credit card and is now retrying with a debit card.
      const resp = await fetch('/api/update-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_intent_id: paymentIntentId,
          invoice_id: invoice.id,
          surcharge_amount: clientSurcharge,
        }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || 'Could not verify payment amount. Please try again.');
      }

      // Server is the single source of truth for both values displayed to the customer
      const { surcharge, total } = await resp.json();
      setLockedSurcharge(surcharge);
      setLockedTotal(total);

      if (surcharge > 0) {
        // Credit card: show the server-confirmed breakdown before charging
        setPhase('confirming');
      } else {
        // Debit / no surcharge: preview already showed $0, so amounts match —
        // skip the redundant confirm step and charge in one smooth motion
        await performConfirm(pm, surcharge);
      }
    } catch (err) {
      setLockError(err.message);
      setPhase('entry');
    }
  };

  // ── Pass 2: charge the locked amount ─────────────────────────────────────────

  const performConfirm = async (pm, surcharge) => {
    setPhase('submitting');
    try {
      if (paymentType === 'card') {
        const { error: confirmErr } = await stripe.confirmPayment({
          clientSecret,
          confirmParams: { payment_method: pm.id },
          redirect: 'if_required',
        });
        if (confirmErr) throw new Error(confirmErr.message);
      } else {
        // Digital wallet — no surcharge; native sheet handles PM creation
        const { error: confirmErr } = await stripe.confirmPayment({
          elements,
          clientSecret,
          confirmParams: { return_url: window.location.href },
          redirect: 'if_required',
        });
        if (confirmErr) throw new Error(confirmErr.message);
      }

      await onSuccess({ surchargeAmount: surcharge, paymentIntentId });
    } catch (err) {
      toast.error(err.message || 'Payment failed. Please try again.');
      haptics.error?.();
      // Reset to entry so the customer can retry with a different card;
      // the next handlePay call will re-lock the PI amount correctly.
      setPhase('entry');
      setStoredPm(null);
      setFunding(null);
      setLockedSurcharge(null);
      setLockedTotal(null);
    }
  };

  const handleConfirm = () => {
    if (phase !== 'confirming' || !storedPm || lockedSurcharge === null) return;
    performConfirm(storedPm, lockedSurcharge);
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const showSurcharge = paymentType === 'card';
  const fundingLabel = funding === 'credit'
    ? 'Credit card — 3% surcharge applies'
    : funding === 'debit'
    ? 'Debit card — no surcharge'
    : funding === 'prepaid'
    ? 'Prepaid card — no surcharge'
    : null;

  return (
    <div className="space-y-4">
      {/* Payment element — visually locked while confirming/submitting to prevent accidental edits */}
      <div className={isBusy || isConfirming ? 'pointer-events-none opacity-60' : ''}>
        <PaymentElement onChange={handleChange} />
      </div>

      {/* Breakdown */}
      <div className="rounded-xl bg-muted/40 border p-3 space-y-1.5 text-sm">
        {isDetecting && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Detecting card type…
          </p>
        )}
        {fundingLabel && !isDetecting && (
          <p className={`text-xs mb-1 ${isConfirming ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
            {fundingLabel}
          </p>
        )}

        <div className="flex justify-between">
          <span className="text-muted-foreground">Service subtotal</span>
          <span>{formatCurrency(baseAmount)}</span>
        </div>

        {showSurcharge && (
          <div className={`flex justify-between transition-opacity ${isEstimate ? 'opacity-50' : ''}`}>
            <span className="text-muted-foreground">
              Card surcharge (3%)
              {isEstimate && <span className="ml-1 text-xs">(est.)</span>}
            </span>
            <span>{funding === 'credit' ? formatCurrency(displaySurcharge) : '$0.00'}</span>
          </div>
        )}

        <div className={`flex justify-between font-semibold border-t pt-1.5 mt-0.5 transition-opacity ${isEstimate ? 'opacity-50' : ''}`}>
          <span>
            Total{isEstimate && <span className="ml-1 text-xs font-normal text-muted-foreground">(est.)</span>}
          </span>
          <span>{formatCurrency(displayTotal)}</span>
        </div>

        {isConfirming && (
          <div className="flex items-center gap-1.5 pt-0.5 text-xs text-green-600 dark:text-green-400">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            Amount verified by server — tap Confirm to charge
          </div>
        )}
      </div>

      {lockError && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {lockError}
        </div>
      )}

      <div className="flex gap-2">
        {isConfirming ? (
          <Button
            variant="outline"
            className="rounded-xl h-11 px-4"
            onClick={() => {
              setPhase('entry');
              setLockedSurcharge(null);
              setLockedTotal(null);
            }}
          >
            ← Change
          </Button>
        ) : (
          <Button
            variant="outline"
            className="flex-1 rounded-xl h-11"
            onClick={onClose}
            disabled={isBusy}
          >
            Cancel
          </Button>
        )}

        {isConfirming ? (
          <Button
            className="flex-1 rounded-xl h-11 gap-2 bg-green-600 hover:bg-green-700 text-white dark:bg-green-600 dark:hover:bg-green-700"
            onClick={handleConfirm}
          >
            <ShieldCheck className="w-4 h-4" />
            {`Confirm ${formatCurrency(lockedTotal)}`}
          </Button>
        ) : (
          <Button
            className="flex-1 rounded-xl h-11 gap-2"
            onClick={handlePay}
            disabled={!isComplete || isBusy || isDetecting}
          >
            {isBusy
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <CreditCard className="w-4 h-4" />}
            {isLocking ? 'Verifying…' : `Pay ${formatCurrency(previewTotal)}`}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Modal shell ──────────────────────────────────────────────────────────────

export default function StripePaymentModal({ invoice, open, onClose, onPaid }) {
  const { resolvedTheme } = useTheme();
  const [clientSecret, setClientSecret] = useState(null);
  const [paymentIntentId, setPaymentIntentId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initError, setInitError] = useState(null);

  // Initialize a PaymentIntent when the modal opens
  useEffect(() => {
    if (!open || clientSecret) return;
    if (!STRIPE_KEY) {
      setInitError('Stripe publishable key not configured. Add VITE_STRIPE_PUBLISHABLE_KEY to your environment variables.');
      return;
    }

    setLoading(true);
    setInitError(null);

    fetch('/api/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_id: invoice.id }),
    })
      .then(async (resp) => {
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || 'Failed to initialize payment');
        setClientSecret(data.client_secret);
        setPaymentIntentId(data.payment_intent_id);
      })
      .catch((e) => setInitError(e.message))
      .finally(() => setLoading(false));
  }, [open, invoice.id, clientSecret]);

  const handleOpenChange = (isOpen) => {
    if (!isOpen) {
      // Reset state so next open creates a fresh PI
      setClientSecret(null);
      setPaymentIntentId(null);
      setInitError(null);
      onClose();
    }
  };

  const handleSuccess = async ({ surchargeAmount, paymentIntentId: piId }) => {
    await onPaid({ surchargeAmount, paymentIntentId: piId });
    handleOpenChange(false);
  };

  const appearance = {
    theme: resolvedTheme === 'dark' ? 'night' : 'stripe',
    variables: {
      borderRadius: '12px',
      fontFamily: 'inherit',
    },
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" /> Charge Card
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {initError && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            {initError}
          </div>
        )}

        {!stripePromise && !loading && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            Stripe not configured. Contact support.
          </div>
        )}

        {clientSecret && !loading && stripePromise && (
          <Elements
            stripe={stripePromise}
            options={{ clientSecret, appearance, paymentMethodCreation: 'manual' }}
          >
            <PaymentForm
              invoice={invoice}
              clientSecret={clientSecret}
              paymentIntentId={paymentIntentId}
              onSuccess={handleSuccess}
              onClose={() => handleOpenChange(false)}
            />
          </Elements>
        )}
      </DialogContent>
    </Dialog>
  );
}
