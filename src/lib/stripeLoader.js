// Stripe.js is loaded only when a card-payment screen opens (F4).
//
// Importing '@stripe/stripe-js' injects the js.stripe.com script and starts
// it up as a side effect. Done at module level in the payment modal, that ran
// whenever the invoice screen's code was loaded or preloaded — including the
// idle preload while a tech is opening a job — and cost ~200 ms of main
// thread at 4x CPU. Now the library is imported, and loadStripe called, the
// first time the card sheet opens; the promise is memoised so Stripe.js loads
// once and <Elements> always gets the same stripe promise.
//
// The publishable key stays in this (same-origin) chunk, which the QA guard's
// stripeModeOf() scan relies on to tell test keys from live keys.

export const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

export function makeStripeLoader(key, importStripe = () => import('@stripe/stripe-js')) {
  let promise = null;
  return function getStripe() {
    if (!key) return null;
    if (!promise) {
      promise = importStripe()
        .then((m) => m.loadStripe(key))
        .catch((e) => {
          promise = null; // a failed script load can be retried by reopening the sheet
          throw e;
        });
    }
    return promise;
  };
}

export const getStripe = makeStripeLoader(STRIPE_KEY);
