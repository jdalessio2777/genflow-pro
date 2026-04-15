// GenFlow Pro — Supabase Seed Script
// Run with: node seed_supabase.js
// Requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

const parts = JSON.parse(readFileSync('./parts_seed.json', 'utf8'));

// ── CUSTOMERS ──────────────────────────────────────────────────────────────
const customers = [
  {
    name: 'Sample Customer A',
    phone: '5550001111',
    address: '100 Main St, Anytown, NJ 07000',
    generator_model: '17kW Generac',
    generator_serial: '0000001',
    service_interval: '12_months',
    repeat_note: 'Controller: Nexus',
  },
  {
    name: 'Sample Customer B',
    phone: '5550002222',
    address: '200 Oak Ave, Sometown, NJ 07000',
    generator_model: '20kW Generac',
    generator_serial: null,
    service_interval: '12_months',
    repeat_note: 'Controller: Nexus',
  },
];

async function seed() {
  console.log('🌱 Starting seed...\n');

  // Seed customers
  console.log('👥 Seeding customers...');
  for (const customer of customers) {
    const { data, error } = await supabase
      .from('customers')
      .insert(customer)
      .select();
    if (error) console.error(`  ❌ ${customer.name}:`, error.message);
    else console.log(`  ✅ ${customer.name}`);
  }

  // Seed parts in batches of 50
  console.log(`\n🔧 Seeding ${parts.length} parts...`);
  const batchSize = 50;
  let success = 0;
  let failed = 0;

  for (let i = 0; i < parts.length; i += batchSize) {
    const batch = parts.slice(i, i + batchSize);
    const { error } = await supabase.from('parts').insert(batch);
    if (error) {
      console.error(`  ❌ Batch ${Math.floor(i / batchSize) + 1}:`, error.message);
      failed += batch.length;
    } else {
      success += batch.length;
      process.stdout.write(`  ✅ ${success}/${parts.length} parts seeded\r`);
    }
  }

  console.log(`\n\n✅ Done! ${success} parts seeded, ${failed} failed.`);
}

seed().catch(console.error);
