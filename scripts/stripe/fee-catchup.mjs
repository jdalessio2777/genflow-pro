// Stripe fee catch-up (Run 13, Part F). Turns a Stripe "Payments" export (CSV) into SQL
// that records each paid charge's exact fee through public.record_stripe_fee(), the same
// function the webhook uses: same matching, same UNIQUE charge id, so running it twice, or
// after the webhook already recorded a fee, changes nothing.
//
// Usage: node scripts/stripe/fee-catchup.mjs <payments.csv> > catchup.sql
// Reads the CSV only. Writes nothing to the database: review the SQL, then run it yourself
// in the Supabase SQL editor. Never commit the CSV (it holds customer payment data).
import fs from 'node:fs';

export function parseCsv(text) {
  const out = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  const [head, ...rest] = out.filter((r) => r.length > 1);
  return rest.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i]])));
}

const CHARGE = /^(ch|py)_[A-Za-z0-9]+$/;
const MONEY = /^\d+(\.\d{1,2})?$/;
const WHEN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/;

// The paid card charges with an exact fee, ready for record_stripe_fee. Anything odd is skipped with a reason.
export function chargesFrom(rows) {
  const ok = []; const skipped = [];
  for (const r of rows) {
    if (r.Status !== 'Paid') continue; // incomplete, canceled, failed: no money, no fee
    const why = !CHARGE.test(r.id || '') ? 'no charge id'
      : !MONEY.test(r.Amount || '') ? 'amount'
      : !MONEY.test(r.Fee || '') ? 'no exact fee in the export'
      : !WHEN.test(r['Created date (UTC)'] || '') ? 'date'
      : (r.Currency || '').toLowerCase() !== 'usd' ? 'not USD' : null;
    if (why) { skipped.push({ id: r.id || '(blank)', why }); continue; }
    ok.push({ id: r.id, amount: r.Amount, fee: r.Fee, paidAt: `${r['Created date (UTC)'].replace(' ', 'T')}Z`, refunded: r['Amount Refunded'] && Number(r['Amount Refunded']) > 0 ? r['Amount Refunded'] : null });
  }
  return { ok, skipped };
}

export function catchupSql(charges) {
  const lines = [
    '-- Stripe fee catch-up. Safe to re-run: a charge already recorded is skipped (UNIQUE stripe_charge_id).',
    'begin;',
    'select r.charge_id, r.result from (values',
    charges.map((c) => `  ('${c.id}', public.record_stripe_fee('${c.id}', ${c.amount}, ${c.fee}, '${c.paidAt}'))`).join(',\n'),
    ') as r(charge_id, result);',
  ];
  const refunds = charges.filter((c) => c.refunded);
  if (refunds.length) lines.push(...refunds.map((c) => `select public.note_stripe_refund('${c.id}', ${c.refunded}, now());`));
  lines.push(
    "select count(*) as fee_expenses, sum(amount) as total_fees, count(*) filter (where invoice_id is null) as unmatched from public.expenses where source = 'stripe';",
    'commit;',
  );
  return lines.join('\n') + '\n';
}

if (process.argv[1] && process.argv[1].endsWith('fee-catchup.mjs')) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node scripts/stripe/fee-catchup.mjs <payments.csv>'); process.exit(2); }
  const { ok, skipped } = chargesFrom(parseCsv(fs.readFileSync(file, 'utf8')));
  for (const s of skipped) console.error(`skipped ${s.id}: ${s.why}`);
  console.error(`${ok.length} paid charges, total fees $${ok.reduce((n, c) => n + Math.round(Number(c.fee) * 100), 0) / 100}`);
  process.stdout.write(catchupSql(ok));
}
