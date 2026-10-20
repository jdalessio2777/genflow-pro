// B5a: start/expiry of the agreement being signed now. The membership itself
// lives on ONE row (customers.membership_*); signing again — a renewal from a
// job, or "Renew or Change Plan" — updates that row, never adds a second one.
//  - Same plan, still active (early renewal): the new year starts when the
//    current one ends, so no paid time is thrown away (audit D-03).
//  - New member, expired member, or a plan change: starts today (a plan
//    change takes effect now — the customer row can only hold one plan).
//  - Re-signing on a job that already has an agreement: keeps that
//    agreement's start, so signing twice never extends the term twice.
import { isActiveMember } from "./membership";

const addYear = (d) => { const x = new Date(d); x.setFullYear(x.getFullYear() + 1); return x; };

export function agreementTerm({ customer, plan, now = new Date(), jobAgreement = null }) {
  if (jobAgreement?.start_date) {
    const start = new Date(jobAgreement.start_date);
    return { start, expiry: addYear(start), kind: "resign" };
  }
  if (isActiveMember(customer, now) && customer.membership_expiry && customer.membership_plan === plan) {
    const start = new Date(customer.membership_expiry);
    return { start, expiry: addYear(start), kind: "renewal" };
  }
  const start = new Date(now);
  return { start, expiry: addYear(start), kind: isActiveMember(customer, now) ? "change" : "new" };
}
