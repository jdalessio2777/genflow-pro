/**
 * GenFlow Pro — recategorize & rename parts in Supabase from official spreadsheet rules.
 * Run: node fix_parts_catalog.js
 * Requires .env.local with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(url, key);

const BATCH = 50;

/** @type {Map<string, { category: string, brand: 'generac'|'kohler'|'briggs'|'none', exactName?: string, sparkModel?: string }>} */
const pnRules = new Map();

function norm(pn) {
  return String(pn ?? '').trim().toUpperCase();
}

function loose(pn) {
  return norm(pn).replace(/\s+/g, '');
}

function addKeys(keys, rule) {
  for (const raw of keys) {
    const n = norm(raw);
    const l = loose(raw);
    for (const k of [n, l].filter(Boolean)) {
      if (!pnRules.has(k)) pnRules.set(k, rule);
    }
  }
}

function addCategory(category, brand, partNumbers, extras = {}) {
  const rule = { category, brand, ...extras };
  addKeys(partNumbers, rule);
}

// --- Most specific first: SMM boards (override load_shed for same PNs) ---
addKeys(['A0001281459'], {
  category: 'smm_boards',
  brand: 'none',
  exactName: 'Generac SMM PCB Board NO (100A)',
});
addKeys(['A0001272964'], {
  category: 'smm_boards',
  brand: 'none',
  exactName: 'Generac SMM PCB Board NC (50A)',
});

// Controllers — WiFi module
addKeys(['0L6784'], { category: 'controllers', brand: 'none', exactName: 'Generac WiFi Module' });

// Gaskets — no brand
addKeys(['NAPA 745-1461', 'NAPA745-1461'], { category: 'gaskets_seals', brand: 'none', exactName: 'Gasket Maker' });

// Relays — Grainger
addKeys(['GRAINGER 6CWZ1'], { category: 'relays', brand: 'none', exactName: 'Relay 120V 30A SPDT' });

// Air filters
addCategory('air_filters', 'generac', [
  '0F5418', '0E9371AS', '0J8478S', '0G84420151', '0H3375A122', '0J1240', 'G073912', '0C8127', 'G073123', '0E9581',
  'G059402', '0G5894', 'G078601', '073111', '0D9723S', '0H6104', '0G3332', '0F5419', '0H08840SRV', '073267',
  '0A46370SRV', 'NAPA 2359', 'NAPA 22095', 'NAPA 1372', 'NAPA 2791', 'NAPA 2098', 'NAPA 2050', 'NAPA 6755',
  'NAPA 2150', '10000016218',
]);
addCategory('air_filters', 'kohler', [
  '32 083 12-S', '62 083 04-S', '253107', '24 083 09-S', '2408309S',
]);
addCategory('air_filters', 'briggs', ['841359', '394018S', '798748', '100149']);

// Oil filters
addCategory('oil_filters', 'generac', [
  'G055505', '0A45310244', '0E7080', '0A3970001', '0A86220296', '0D5419', '099021', '0E7415', '070185DS', '070185BS',
  '070185ES', '0J74890248', '0H48930301', '0H20520369', 'G0709390126', 'NAPA 1056', 'NAPA 3528', 'NAPA 7299', 'NAPA 1791',
  'NAPA 1040', 'NAPA 7094', 'NAPA 1607', 'NAPA 1356', 'NAPA 7400', 'NAPA 3394', 'NAPA 1515', 'NAPA 3691', 'NAPA 21060',
  'NAPA 1395', 'NAPA 7095', 'NAPA 1243', 'NAPA 7035', 'NAPA 21356', 'NAPA 21036', 'NAPA 7000', 'NAPA 7145', 'NAPA 1334',
  'NAPA 7037', 'NAPA 1516', 'NAPA 1348', 'NAPA 27145', 'NAPA 1374', 'NAPA 1335', 'NAPA 1069', 'NAPA 1376', 'NAPA 7750S',
  '10000005872',
]);
addCategory('oil_filters', 'kohler', ['52 050 02-S', 'GM16703', 'GM28351', '360031']);

// Spark plugs — all Generac naming; store display model as original key
const sparkPlugs = [
  'BKR5E', 'NGK BPR6HS', 'NGK BPR6ES', 'NGK BPR5ES', 'NAPA 344', 'NAPA 431', 'NAPA 71', 'NAPA RN9YC',
  'NAPA AUTOLIGHT 764', 'CHAMPION 3401', '0K8904', '0K8946', '0K9467', '10000005117',
];
for (const m of sparkPlugs) {
  addKeys([m], {
    category: 'spark_plugs',
    brand: 'generac',
    sparkModel: m.trim(),
  });
}

// Batteries
addCategory('batteries', 'generac', [
  '0H3421S', 'NAPA 7551R', 'NAPA 7524F', 'NAPA 7527F', 'NAPA 7237', '0G9449', '0H1663', 'G063998', 'NAPA 8229',
  '0D5070A', '0G8023', '0G8023A', '0F15770SRV', '0G8487', '0A18010SRV', 'NAPA 781104', '0K48480SRV',
]);

// Controllers (excluding 0L6784 already added)
addCategory('controllers', 'generac', [
  '10000003275', '0E97040SRV', '0E96680SRV', '0F15040SRV', '0D86150SRV', '076009ASRV', '0J8371C', '0J0064', '0H06430SRV',
  '0C15370SRV', '0G58840SRV', '0H6680D', '0H6680DSRV', '0G79010SRV', '098647ASRV', '0H7668DSRV', '0639190SRV',
  '0G8455DSRV', '0F8710BSRV', '0H1176BSRV', '0G3958DSRV', '0G3958CSRV', '0G8455ESRV', '0H1176ASRV', '10000003293',
  '0K2267A', '0K2267C', '0K0220A', '0830890SRV', '0L6733B', '0K7341A', '0k7341A',
]);
addCategory('controllers', 'kohler', [
  'GM92089', 'GM92090', 'GM95104', 'GM49103', 'GM81529-KP1', 'GM81385-KP3', 'GM92001-KP1', 'C284507',
]);

// Load shed (exclude SMM PNs — already mapped)
addCategory('load_shed', 'generac', ['7000', '7006', '10000004183', '0L3123', '0L3247']);
addCategory('load_shed', 'kohler', ['GM88281KP1Q', 'GM77177KP1QS', 'GM77177KP2QS']);

// Starters
addCategory('starters', 'generac', [
  'A0000501971', '0E9323', '0H58410154', '0D5418', '0E42710SRV', '0D92300ESV', '0E0601ASRV', '0G7461RWK', '0G9798',
  'G086729', '0G3351', 'G084464',
]);
addCategory('starters', 'kohler', ['2509820-S', '2509811-S']);

// Oil pressure switches
addCategory('oil_pressure_switches', 'generac', [
  '0D9235BSRV', '0L2917C', '0L2917D', '0H1315', '0C3025', '0G6820', '0G6542', 'G094090', '0E0502', '0A6751', 'G075281',
  '0C30250SRV', '0L2917A', '0L2917B',
]);

// Fuel system
addCategory('fuel_system', 'generac', [
  '0E1006', 'OE1006A', '0E1006A', '0F6390KSRV', '0G1397CSRV', '0H6620', '0G7622C', '0G7622H', '0G7622A', '0G7622FSRV',
  '0J9045', '0J8312', '0F9078', '0G7581', '075211', '0F8977', '0K80950SRV', '0F5022', '0F9273', '0J8315A', '0D4166A',
  '0J7137', '0F9968', '0D3031', '0H3419', '0J0974', '0H1326', '0D6313', '0J74890247', '0H48930266', 'NAPA 3908',
  'NAPA 3978', 'NAPA 3393', 'NAPA 3808', 'NAPA 3744', 'NAPA 3531', 'NAPA 3472', 'NAPA 3426', 'NAPA 3827', 'NAPA 3357',
  'NAPA 3351', 'NAPA 3961', 'NAPA 600158', '0G9914',
]);
addCategory('fuel_system', 'kohler', ['275501']);

// Brushes
addCategory('brushes', 'generac', ['0H0919', '066386SRV', '0J8415', '0F7874', 'G075591']);

// Stepper motors
addCategory('stepper_motors', 'generac', [
  '0G6452', 'G098290', '0G6453', '0G6454', '0G49290', '0H6677', '0H43470146',
]);

// Air boxes
addCategory('air_boxes', 'generac', [
  '0H6669', '0J1240A', '0J7782', '0J9892', '0J9742', '0F92550SRV', '0C9619', '0G8297SRV', '0K8424', '0J9743', '0D5864A',
  '0G1163', '0J00990SRV', '0E9443', '0K1902', '0J0602', '0E92950', '0E9542',
]);

// Transfer switch (before circuit_breakers so 073590A maps here per doc order)
addCategory('transfer_switch', 'generac', [
  '0D9618', '0L2910', '0L2911', '0E6154', '077220', '0E6154A', '077220A', '073590A', '0G4747', '0J2353', '0G0627',
  '0F6366A', 'G057909', 'G083264', 'G099076',
]);

// Gaskets & seals
addCategory('gaskets_seals', 'generac', [
  'A0002791673', 'G090239', '0J6184A', '0E9369', '0J6184', '0J7546B', '0C4138', '0A88290266', '0J7546A', '0G9916',
  'G0590890353', '0C3043', '0C2977', '0H33750175', 'G098228', '0E9471', '0E9472', '0G84420156', '0C3005', 'G090970',
  '0C2978', '0H33750', '021713B', '0E9351', '0H58410111', '0E9352', '0C2979', '0C3150A', '0C3150', 'G076701', '0E6586',
  '0C23980102', '0C4647', 'G086999', '0E9370', '0K1534', '0K2035', '0C5943', '0J33750146', '0E3812', '0K0710',
]);

// Voltage regulators
addCategory('voltage_regulators', 'generac', [
  '0F97190SRV', '0676800SRV', '0830480SRV', '0G28850SRV', '0H2579B', '0A1354A', 'G029673', '0D7177V',
]);

// Ignition
addCategory('ignition', 'generac', [
  '0G9241T', '0G3251TB', '0G3251TA', '0G3224TB', '0G84420150', '0G3224TA', '0H0348', '0E7953', '0H1083', '0G8951',
  '0H6169B', '0K3166', '0D6525', '0K63030SRV', 'G082130', '0D2244M', '0G1472A', '0E83360242', '0H33750131', '0J0833A',
  '10000004916', '10000004931', 'G077220',
]);

// Circuit breakers (073590A duplicate — already taken by transfer_switch)
addCategory('circuit_breakers', 'generac', [
  'G053623', 'G054502', 'G049350', 'G048512', '0E5840', '0G5644C', '0E7888A', '0E7886D', 'G039765', '0E7886K',
  '0E7886F', '0E7886J', '0E7886M', '0K0971', '099727', '067682B', '0E7403A', '0A9611', '0D7178T', 'G039985', '028578',
  '0E7403B', 'G022676', '0E7403C', 'G032300', '022669',
]);

// Relays (excluding GRAINGER handled)
addCategory('relays', 'generac', [
  'G063617', 'G027911', '0C2174', '0E6875A', '0K0103', 'G056739', '0K2098', '0C1503', '0E4395', '0E4394',
]);
addCategory('relays', 'kohler', ['GM50772', 'GM287812']);

// Oils & fluids — by part number keys; names kept as-is when matched
const oilsPns = [
  '5W-30', '0G0752', '0J5154A', 'NAPA VAL296', 'NOL 75123', 'UNIVERSAL', 'NAPA ORANGE', 'NAPA BLUE', 'NAPA GREEN',
  'NAPA 2417', 'NAPA B-101', 'NAPA 9016',
];
for (const p of oilsPns) {
  addKeys([p], { category: 'oils_fluids', brand: 'none', oilsAsIs: true });
  const l = loose(p);
  if (l && l !== norm(p)) addKeys([l], { category: 'oils_fluids', brand: 'none', oilsAsIs: true });
}

const OILS_NAME_KEEP = new Set(
  [
    'Oil 5W-30',
    'Oil SAE 30',
    'Oil 10W-30',
    'Oil Synthetic 10W-30',
    'Oil Diesel 15W-40',
    'Coolant Universal',
    'Coolant Orange',
    'Coolant Blue',
    'Coolant Green 50/50',
    'Brake Cleaner 14oz',
    'Carb Cleaner / Gum Cutter',
    'Fuel Treatment',
  ].map((s) => s.toLowerCase().trim())
);

function hasBrandPrefix(name) {
  const n = String(name ?? '').trim();
  return /^(generac|kohler|briggs)\b/i.test(n);
}

function lookupRule(partNumber) {
  const n = norm(partNumber);
  const l = loose(partNumber);
  return pnRules.get(n) || pnRules.get(l) || null;
}

function buildNewName(part, rule) {
  const current = String(part.name ?? '').trim();
  const pn = String(part.part_number ?? '').trim();

  if (rule.exactName) return rule.exactName;

  if (rule.sparkModel) {
    return `Generac Spark Plug ${rule.sparkModel}`;
  }

  if (rule.oilsAsIs || rule.brand === 'none') {
    if (OILS_NAME_KEEP.has(current.toLowerCase())) return current;
    if (rule.oilsAsIs) return current || pn;
  }

  if (hasBrandPrefix(current)) {
    // Still may need category-only update; name unchanged
    return current;
  }

  const brandWord =
    rule.brand === 'generac' ? 'Generac' : rule.brand === 'kohler' ? 'Kohler' : rule.brand === 'briggs' ? 'Briggs' : '';

  if (!brandWord) return current;

  // Append part number when helpful (user: many air filters identical)
  const base = current || 'Part';
  const withPn =
    pn && !base.toUpperCase().includes(loose(pn)) ? `${base} ${pn}`.trim() : base;
  return `${brandWord} ${withPn}`.replace(/\s+/g, ' ').trim();
}

async function fetchAllParts() {
  const pageSize = 1000;
  let from = 0;
  const all = [];
  for (;;) {
    const { data, error } = await supabase
      .from('parts')
      .select('id, name, part_number, category')
      .order('id')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function main() {
  console.log('Fetching parts…');
  const parts = await fetchAllParts();
  console.log(`Loaded ${parts.length} rows.`);

  const updates = [];
  let skippedNoRule = 0;
  let skippedUnchanged = 0;

  for (const part of parts) {
    let rule = lookupRule(part.part_number);
    if (!rule && OILS_NAME_KEEP.has(String(part.name ?? '').toLowerCase().trim())) {
      rule = { category: 'oils_fluids', brand: 'none', oilsAsIs: true };
    }
    if (!rule) {
      skippedNoRule++;
      continue;
    }

    const newName = buildNewName(part, rule);
    const newCategory = rule.category;

    const nameSame = (part.name ?? '') === newName;
    const catSame = (part.category ?? '') === newCategory;
    if (nameSame && catSame) {
      skippedUnchanged++;
      continue;
    }

    updates.push({ id: part.id, name: newName, category: newCategory });
  }

  console.log(`Planned updates: ${updates.length} (no rule: ${skippedNoRule}, already OK: ${skippedUnchanged})`);

  let done = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const chunk = updates.slice(i, i + BATCH);
    const results = await Promise.all(
      chunk.map((u) =>
        supabase.from('parts').update({ name: u.name, category: u.category }).eq('id', u.id).select('id')
      )
    );
    for (const r of results) {
      if (r.error) {
        console.error('Update error:', r.error.message, r.error);
        throw r.error;
      }
    }
    done += chunk.length;
    console.log(`  Updated ${done}/${updates.length}`);
  }

  console.log(`\nDone. Updated ${updates.length} parts.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
