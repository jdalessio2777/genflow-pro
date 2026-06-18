import { useState, useCallback, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useTheme } from 'next-themes';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CreditCard } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { haptics } from '@/lib/haptics';
import { toast } from 'sonner';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

const SURCHARGE_RATE = 0.03;

// ─── Inner form (must be inside <Elements>) ───────────────────────────────────

function PaymentForm({ invoice, clientSecret, paymentIntentId, onSuccess, onClose }) {
  const stripe = useStripe();
  const elements = useElements();

  const [paymentType, setPaymentType] = useState(null); // 'card' | 'apple_pay' | etc.
  const [funding, setFunding] = useState(null);         // 'credit' | 'debit' | 'prepaid' | 'unknown'
  const [storedPm, setStoredPm] = useState(null);       // PaymentMethod from createPaymentMethod
  const [isDetecting, setIsDetecting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const baseAmount = invoice.total || 0;
  const surchargeAmount = funding === 'credit'
    ? Math.round(baseAmount * SURCHARGE_RATE * 100) / 100
    : 0;
  const totalAmount = baseAmount + surchargeAmount;

  const handleChange = useCallback(async (event) => {
    const type = event.value?.type ?? null;
    setPaymentType(type);
    setIsComplete(event.complete);

    // When the card entry becomes incomplete (user edits it), clear stored PM
    if (!event.complete) {
      setStoredPm(null);
      setFunding(null);
      return;
    }

    // Auto-detect funding type as soon as a full card number is entered
    if (event.complete && type === 'card' && stripe && elements && !storedPm) {
      setIsDetecting(true);
      try {
        const { paymentMethod, error } = await stripe.createPaymentMethod({ elements });
        if (!error && paymentMethod) {
          setStoredPm(paymentMethod);
          setFunding(paymentMethod.card?.funding ?? 'unknown');
        }
      } catch {
        // Detection failed — user can still pay; surcharge defaults to 0
      } finally {
        setIsDetecting(false);
      }
    }
  }, [stripe, elements, storedPm]);

  const handleSubmit = async () => {
    if (!stripe || !elements || !isComplete || isSubmitting) return;
    setIsSubmitting(true);

    try {
      if (paymentType === 'card') {
        // Card path: we may already have a PM from the auto-detect step
        let pm = storedPm;
        if (!pm) {
          const { paymentMethod, error: pmErr } = await stripe.createPaymentMethod({ elements });
          if (pmErr) throw new Error(pmErr.message);
          pm = paymentMethod;
        }

        const cardFunding = pm.card?.funding;
        const appliedSurcharge = cardFunding === 'credit'
          ? Math.round(baseAmount * SURCHARGE_RATE * 100) / 100
          : 0;

        if (appliedSurcharge > 0) {
          const resp = await fetch('/api/update-payment-intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              payment_intent_id: paymentIntentId,
              invoice_id: invoice.id,
              surcharge_amount: appliedSurcharge,
            }),
          });
          if (!resp.ok) {
            const { error: e } = await resp.json().catch(() => ({}));
            throw new Error(e || 'Failed to apply surcharge');
          }
        }

        // Confirm using the already-created PM (does not re-prompt the user)
        const { error: confirmErr } = await stripe.confirmPayment({
          clientSecret,
          confirmParams: { payment_method: pm.id },
          redirect: 'if_required',
        });
        if (confirmErr) throw new Error(confirmErr.message);

        await onSuccess({ surchargeAmount: appliedSurcharge, paymentIntentId });
      } else {
        // Digital wallet (Apple Pay / Google Pay) — no surcharge, elements handle the native sheet
        const { error: confirmErr } = await stripe.confirmPayment({
          elements,
          clientSecret,
          confirmParams: { return_url: window.location.href },
          redirect: 'if_required',
        });
        if (confirmErr) throw new Error(confirmErr.message);

        await onSuccess({ surchargeAmount: 0, paymentIntentId });
      }
    } catch (err) {
      toast.error(err.message || 'Payment failed. Please try again.');
      haptics.error?.();
    } finally {
      setIsSubmitting(false);
    }
  };

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
      <PaymentElement onChange={handleChange} />

      {/* Transparent breakdown — always shown once element is visible */}
      <div className="rounded-xl bg-muted/40 border p-3 space-y-1.5 text-sm">
        {isDetecting && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Detecting card type…
          </p>
        )}
        {fundingLabel && !isDetecting && (
          <p className="text-xs text-muted-foreground mb-1">{fundingLabel}</p>
        )}

        <div className="flex justify-between">
          <span className="text-muted-foreground">Service subtotal</span>
          <span>{formatCurrency(baseAmount)}</span>
        </div>

        {showSurcharge && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Card surcharge (3%){funding === null ? ' — detecting…' : ''}
            </span>
            <span>{funding === 'credit' ? formatCurrency(surchargeAmount) : '$0.00'}</span>
          </div>
        )}

        <div className="flex justify-between font-semibold border-t pt-1.5 mt-0.5">
          <span>Total</span>
          <span>{formatCurrency(totalAmount)}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1 rounded-xl h-11"
          onClick={onClose}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          className="flex-1 rounded-xl h-11 gap-2"
          onClick={handleSubmit}
          disabled={!isComplete || isSubmitting || isDetecting}
        >
          {isSubmitting
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <CreditCard className="w-4 h-4" />}
          {isSubmitting ? 'Processing…' : `Pay ${formatCurrency(totalAmount)}`}
        </Button>
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

        {clientSecret && !loading && (
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
