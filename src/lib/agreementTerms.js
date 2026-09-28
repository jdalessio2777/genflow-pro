// Plan + terms text for the Generator Maintenance (Protection Plan) Agreement.
// Plain ESM shared by the signing page (src/pages/MembershipAgreement.jsx) and
// the server-side agreement PDF (api/lib/pdf). A copy of the plan/terms as
// signed is also snapshotted into job_agreements.snapshot at signing time.
export const PLANS = {
  annual: {
    name: "Guardian Plan (Annual)",
    price: 325,
    billingLabel: "$325.00 / year",
    color: "border-blue-200 bg-blue-50",
    headerColor: "bg-blue-600",
    includes: [
      "One (1) full annual maintenance service",
      "10% off all parts, labor, and repair services",
      "Priority emergency service (24-hour response)",
    ],
  },
  semi_annual: {
    name: "Sentinel Plan (Semi-Annual)",
    price: 575,
    billingLabel: "$575.00 / year",
    color: "border-emerald-200 bg-emerald-50",
    headerColor: "bg-emerald-600",
    includes: [
      "Two (2) maintenance visits per year",
      "15% off all parts, labor, and repair services",
      "Priority emergency service (24-hour response)",
      "First 30 minutes of diagnostic labor free, per visit, during normal business hours",
    ],
  },
};

export const TERMS = [
  { n: "1", title: "Term & Payment", body: "This Agreement is valid for one (1) year from the date of execution. Payment is due in full at the time of signing. Annual billing only — no monthly payment option is available." },
  { n: "2", title: "Automatic Renewal", body: "If a credit card is on file, this Agreement auto-renews annually. You will be notified by email at least 30 days before renewal with the amount to be charged and the option to cancel. If no credit card is on file, you will receive an email 30 days before expiration advising that the Agreement will expire without further action." },
  { n: "3", title: "Cancellation", body: "After automatic renewal, cancellations submitted in writing within 7 days receive a full refund. Cancellations after that period and mid-term cancellations are non-refundable." },
  { n: "4", title: "Included Services", body: "Scheduled maintenance includes engine oil and filter replacement, air filtration inspection, spark plug inspection, battery and charging system check, fuel system verification, and full operational load test." },
  { n: "5", title: "Rollover Policy", body: "Unused included maintenance visits do not expire at the end of the agreement year. Any unused visit carries forward and remains available after renewal." },
  { n: "6", title: "Discount Application", body: "The member discount (10% for Annual plan; 15% for Semi-Annual plan) applies to all billable parts, hourly labor, and flat-rate services during the agreement term. Applied at time of service only — not retroactively. Does not apply to the Agreement cost itself or third-party fees." },
  { n: "7", title: "Emergency Service", body: "Agreement holders receive priority emergency scheduling. GenShield LLC will make reasonable effort to respond within 24 hours to generators that fail to operate during or immediately following a utility power outage. Subject to technician availability — not a guaranteed response time." },
  { n: "8", title: "Unit Specificity & Transferability", body: "This Agreement is specific to the generator identified above and is not transferable to a new property owner or any third party. However, if the covered unit is replaced with a new generator at the same customer's property, this Agreement transfers to the replacement unit at no charge upon notification and verification of the new unit's information. This Agreement follows the customer, not the address." },
  { n: "9", title: "Air-Cooled Units Only", body: "This Agreement applies exclusively to air-cooled generator units rated at 26kW or less. Liquid-cooled or industrial-grade units are not covered under this Agreement." },
  { n: "10", title: "Exclusions", body: "Does not cover repairs resulting from misuse, neglect, acts of nature, flood, fire, vandalism, or damage caused by installation not performed by GenShield LLC. Repair parts and labor are billed separately, subject to the member discount." },
  { n: "11", title: "Limitation of Liability", body: "GenShield LLC's liability under this Agreement is limited to the cost of the Agreement. Not liable for consequential, incidental, or special damages including food spoilage, property damage, or loss of income resulting from generator failure." },
  { n: "12", title: "Governing Law", body: "This Agreement is governed by the laws of the State of New Jersey. Disputes shall be resolved in the county where service was performed." },
];

// job_labor.requires_agreement values -> plan keys above.
export const AGREEMENT_TYPE_TO_PLAN = {
  annual_air_cooled: "annual",
  semi_annual_air_cooled: "semi_annual",
};

export const UNIT_TYPE_LABEL = "Air-cooled, 26kW or less";
