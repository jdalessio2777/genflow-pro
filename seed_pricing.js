/**
 * GenFlow Pro — seed labor_rates from AJGS pricebook (May 2026).
 * Run: node seed_pricing.js
 * Re-seed / bypass non-empty check: node seed_pricing.js --force
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
const force = process.argv.includes('--force');

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(url, key);

const HOURLY = [
  {
    name: 'First ½ Hour — Service Call',
    type: 'hourly',
    category: 'labor',
    rate: 125,
    cost_rate: 0,
    flat_price: 0,
    flat_cost: 0,
    notes:
      'Initial 30 min on-site — always charged first on diagnostic-only calls',
  },
  {
    name: 'Standard ½ Hour',
    type: 'hourly',
    category: 'labor',
    rate: 60,
    cost_rate: 0,
    flat_price: 0,
    flat_cost: 0,
    notes: 'Each additional half hour, normal business hours',
  },
  {
    name: 'Standard Hour',
    type: 'hourly',
    category: 'labor',
    rate: 115,
    cost_rate: 0,
    flat_price: 0,
    flat_cost: 0,
    notes: 'Full hour billing, normal business hours',
  },
  {
    name: 'Night Rate / Saturday before 3:30 PM',
    type: 'hourly',
    category: 'after_hours',
    rate: 245,
    cost_rate: 0,
    flat_price: 0,
    flat_cost: 0,
    notes: 'After-hours weeknights and Saturday before 3:30 PM',
  },
  {
    name: 'Saturday after 3:30 PM / Sunday / Holiday',
    type: 'hourly',
    category: 'after_hours',
    rate: 330,
    cost_rate: 0,
    flat_price: 0,
    flat_cost: 0,
    notes: 'All day Sunday, all holidays, Saturday after 3:30 PM',
  },
];

const FLAT_REPAIRS = [
  {
    name: 'Battery 26R Replacement',
    type: 'flat_rate',
    category: 'batteries',
    rate: 0,
    cost_rate: 0,
    flat_price: 220,
    flat_cost: 90,
    notes: 'Group 26R replacement battery — parts + labor all-in',
  },
  {
    name: 'Oil Pressure Switch Replacement',
    type: 'flat_rate',
    category: 'oil_pressure_switches',
    rate: 0,
    cost_rate: 0,
    flat_price: 125,
    flat_cost: 26.69,
    notes: 'All 0L2917 variants — parts + labor all-in',
  },
  {
    name: 'Starter Motor Replacement',
    type: 'flat_rate',
    category: 'starters',
    rate: 0,
    cost_rate: 0,
    flat_price: 300,
    flat_cost: 80,
    notes: 'Gear reduced starter, 10kW+ air-cooled — OEM only',
  },
  {
    name: 'Control Board Evolution 2.0',
    type: 'flat_rate',
    category: 'controllers',
    rate: 0,
    cost_rate: 0,
    flat_price: 550,
    flat_cost: 180,
    notes: '10000003275 — 2020+ WiFi units, serial number specific',
  },
  {
    name: 'Control Board Nexus Replacement',
    type: 'flat_rate',
    category: 'controllers',
    rate: 0,
    cost_rate: 0,
    flat_price: 800,
    flat_cost: 350,
    notes: '0H6680D — 2010–2012 units — parts + labor all-in',
  },
  {
    name: 'Load Shed Replacement 100A',
    type: 'flat_rate',
    category: 'load_shed',
    rate: 0,
    cost_rate: 0,
    flat_price: 300,
    flat_cost: 90,
    notes: 'Full 100A load shed module — parts sourced per job',
  },
  {
    name: 'Load Shed Replacement 50A',
    type: 'flat_rate',
    category: 'load_shed',
    rate: 0,
    cost_rate: 0,
    flat_price: 300,
    flat_cost: 90,
    notes: 'Full 50A load shed module — parts sourced per job',
  },
  {
    name: 'SMM Board Replacement (NC)',
    type: 'flat_rate',
    category: 'smm_boards',
    rate: 0,
    cost_rate: 0,
    flat_price: 195,
    flat_cost: 65,
    notes: 'Normally Closed PCB — 50A Smart Management Module',
  },
  {
    name: 'SMM Board Replacement (NO)',
    type: 'flat_rate',
    category: 'smm_boards',
    rate: 0,
    cost_rate: 0,
    flat_price: 195,
    flat_cost: 65,
    notes: 'Normally Open PCB — 100A Smart Management Module',
  },
];

const MAINTENANCE = [
  {
    name: 'One-Time Tune-Up (Air-Cooled)',
    type: 'flat_rate',
    category: 'maintenance',
    rate: 0,
    cost_rate: 0,
    flat_price: 300,
    flat_cost: 27,
    notes:
      'Full maintenance — air filter, spark plugs, oil filter, oil (1.8 qt), inspection, test run',
  },
  {
    name: 'One-Time Oil Change (Air-Cooled)',
    type: 'flat_rate',
    category: 'maintenance',
    rate: 0,
    cost_rate: 0,
    flat_price: 200,
    flat_cost: 10,
    notes: 'Oil filter + oil (1.8 qt) only — no spark plugs or air filter',
  },
  {
    name: 'One-Time Tune-Up (Liquid-Cooled)',
    type: 'flat_rate',
    category: 'maintenance',
    rate: 0,
    cost_rate: 0,
    flat_price: 350,
    flat_cost: 35,
    notes: 'Full liquid-cooled maintenance service',
  },
  {
    name: 'One-Time Oil Change (Liquid-Cooled)',
    type: 'flat_rate',
    category: 'maintenance',
    rate: 0,
    cost_rate: 0,
    flat_price: 300,
    flat_cost: 15,
    notes: 'Oil service only — liquid-cooled units',
  },
];

const SERVICE_AGREEMENTS = [
  {
    name: 'Service Agreement (Air-Cooled) — Annual',
    type: 'flat_rate',
    category: 'service_agreements',
    rate: 0,
    cost_rate: 0,
    flat_price: 340,
    flat_cost: 0,
    notes:
      'Annual service agreement — 1 maintenance visit/yr · 10% off parts, labor & repairs · Price is fixed — never discounted',
  },
  {
    name: 'Service Agreement (Air-Cooled) — Semi-Annual',
    type: 'flat_rate',
    category: 'service_agreements',
    rate: 0,
    cost_rate: 0,
    flat_price: 595,
    flat_cost: 0,
    notes:
      'Semi-annual service agreement — 2 maintenance visits/yr · 15% off parts, labor & repairs · Price is fixed — never discounted',
  },
  {
    name: 'Service Agreement (Liquid-Cooled) — Annual',
    type: 'flat_rate',
    category: 'service_agreements',
    rate: 0,
    cost_rate: 0,
    flat_price: 340,
    flat_cost: 0,
    notes:
      'PLACEHOLDER — contract pending · Do not add to jobs yet · Price is fixed — never discounted',
  },
  {
    name: 'Service Agreement (Liquid-Cooled) — Semi-Annual',
    type: 'flat_rate',
    category: 'service_agreements',
    rate: 0,
    cost_rate: 0,
    flat_price: 595,
    flat_cost: 0,
    notes:
      'PLACEHOLDER — contract pending · Do not add to jobs yet · Price is fixed — never discounted',
  },
];

const ALL_RECORDS = [...HOURLY, ...FLAT_REPAIRS, ...MAINTENANCE, ...SERVICE_AGREEMENTS];

function pickColumns(sampleRow, record) {
  const keys =
    sampleRow && typeof sampleRow === 'object'
      ? Object.keys(sampleRow).filter(
          (k) =>
            k !== 'id' &&
            k !== 'created_at' &&
            k !== 'updated_at' &&
            k !== 'created_date' &&
            k !== 'updated_date'
        )
      : ['name', 'type', 'category', 'rate', 'cost_rate', 'flat_price', 'flat_cost', 'notes'];

  const out = {};
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(record, k)) out[k] = record[k];
  }
  return out;
}

function sanitizeForInsert(row) {
  const next = { ...row };
  for (const [k, v] of Object.entries(next)) {
    if (v === undefined) delete next[k];
  }
  return next;
}

async function main() {
  const { data: sample, error: sampleErr } = await supabase
    .from('labor_rates')
    .select('*')
    .limit(1);

  if (sampleErr) {
    console.error('Schema probe failed:', sampleErr.message);
    process.exit(1);
  }

  console.log('Sample row (schema probe):', sample?.[0] ?? '(table empty — using default column set)');
  const sampleRow = sample?.[0] ?? null;

  const { count, error: countErr } = await supabase
    .from('labor_rates')
    .select('*', { count: 'exact', head: true });

  if (countErr) {
    console.error('Count failed:', countErr.message);
    process.exit(1);
  }

  const existing = count ?? 0;
  if (existing > 0 && !force) {
    console.error(
      `\nlabor_rates already has ${existing} row(s). Refusing to insert duplicates.\n` +
        'Run with --force to insert anyway (may duplicate rows), or truncate the table first.\n' +
        '  node seed_pricing.js --force\n'
    );
    process.exit(1);
  }

  if (existing > 0 && force) {
    console.warn(`--force: inserting ${ALL_RECORDS.length} rows alongside ${existing} existing row(s).`);
  }

  const rows = ALL_RECORDS.map((r) => sanitizeForInsert(pickColumns(sampleRow, r)));

  const { data: inserted, error: insErr } = await supabase
    .from('labor_rates')
    .insert(rows)
    .select('id, name');

  if (insErr) {
    console.error('Insert failed:', insErr.message, insErr.details || '', insErr.hint || '');
    process.exit(1);
  }

  const list = inserted ?? [];
  for (const row of list) {
    console.log(`✓ ${row.name}`);
  }

  console.log(`\n${list.length} records seeded successfully.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
