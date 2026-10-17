// One rule for "is this customer a member right now?" (D-01). A signed plan
// with no expiry, or an expiry still in the future, is active. An expired
// plan gets no member discount and no Member badge.
export function isActiveMember(customer, now = new Date()) {
  if (!customer?.membership_plan || !customer?.membership_signed) return false;
  if (!customer.membership_expiry) return true;
  return new Date(customer.membership_expiry) > now;
}

// Price multiplier for an active member: semi-annual 15% off, annual 10% off.
export function memberDiscountRateFor(customer, now = new Date()) {
  if (!isActiveMember(customer, now)) return 1.0;
  return customer.membership_plan === "semi_annual" ? 0.85 : 0.90;
}
