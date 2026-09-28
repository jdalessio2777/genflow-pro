// Shared invoice fixtures for the invoiceSummaryHTML golden (byte-identical)
// tests. Dates are pinned to 12:00 UTC so the rendered calendar date is the
// same in every US/EU timezone the suite might run in.
export const goldenCustomer = {
  name: 'Big BOB',
  email: 'bob@example.com',
  address: '1 Test Lane, Summit NJ',
  phone: '973-555-0100',
  generator_model: 'Generac 22kW',
  generator_serial: 'SN-12345',
}

const baseInvoice = {
  invoice_number: 'INV-GOLDEN1',
  created_date: '2026-06-10T12:00:00.000Z',
  customer_name: 'Big BOB',
  parts_total: 42.5,
  labor_total: 245.05,
  tax_amount: 19.05,
  surcharge_amount: 0,
  line_items: [
    { type: 'part', description: 'Oil Filter', quantity: 1, unit_price: 18.5, total: 18.5 },
    { type: 'part', description: 'Spark Plug', quantity: 2, unit_price: 12, total: 24 },
    { type: 'labor', description: 'Annual maintenance labor', quantity: 1, unit_price: 245.05, total: 245.05 },
  ],
  notes: 'Changed oil & filter. Load test OK.',
  customer_signature: 'data:image/png;base64,iVBORw0KGgo=',
}

const creditLine = [{ type: 'labor', description: 'Goodwill credit', quantity: 1, unit_price: -25, total: -25 }]

export const goldenCases = {
  unpaid: { ...baseInvoice, paid_date: null },
  paid_cash: { ...baseInvoice, paid_date: '2026-06-10T12:00:00.000Z', payment_method: 'cash' },
  paid_check_ref: { ...baseInvoice, paid_date: '2026-06-11T12:00:00.000Z', payment_method: 'check', payment_reference: '1042' },
  paid_stripe_surcharge: { ...baseInvoice, paid_date: '2026-06-10T12:00:00.000Z', payment_method: 'stripe', surcharge_amount: 9.2 },
  unpaid_one_cent: {
    ...baseInvoice, parts_total: 0, labor_total: 0.01, tax_amount: 0,
    line_items: [{ type: 'labor', description: 'Token charge', quantity: 1, unit_price: 0.01, total: 0.01 }],
    notes: '', customer_signature: null, paid_date: null,
  },
  // Negative totals (credit exceeds charges) are NOT $0 — they must keep the
  // existing paid/unpaid rendering exactly.
  unpaid_negative: { ...baseInvoice, parts_total: 0, labor_total: -25, tax_amount: -1.66, line_items: creditLine, notes: '', customer_signature: null, paid_date: null },
  paid_negative: { ...baseInvoice, parts_total: 0, labor_total: -25, tax_amount: -1.66, line_items: creditLine, notes: '', customer_signature: null, paid_date: '2026-06-10T12:00:00.000Z', payment_method: 'other' },
  unpaid_no_items: { ...baseInvoice, line_items: [], notes: '', customer_signature: null, paid_date: null },
}
