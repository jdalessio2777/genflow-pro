/**
 * GenFlow Pro — seed the three core document templates.
 * Run:         node seed_document_templates.js
 * Force update: node seed_document_templates.js --force
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const url  = process.env.VITE_SUPABASE_URL;
const key  = process.env.VITE_SUPABASE_ANON_KEY;
const force = process.argv.includes('--force');

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(url, key);

// ── Shared field groups ────────────────────────────────────────────────────────

const HEADER_FIELDS = [
  { id: 'customer_name',    label: 'Customer Name',        type: 'text',   required: true  },
  { id: 'customer_address', label: 'Address',              type: 'text',   required: false },
  { id: 'customer_phone',   label: 'Phone',                type: 'text',   required: false },
  { id: 'customer_email',   label: 'Email',                type: 'text',   required: false },
  { id: 'date_of_service',  label: 'Date of Service',      type: 'date',   required: true  },
  { id: 'section_gen',      label: 'Generator Information',type: 'section_header' },
  { id: 'generator_brand',  label: 'Brand',                type: 'text',   required: false },
  { id: 'generator_kw',     label: 'kW Size',              type: 'number', required: false },
  { id: 'generator_model',  label: 'Model #',              type: 'text',   required: false },
  { id: 'generator_serial', label: 'Serial #',             type: 'text',   required: false },
  { id: 'run_hours',        label: 'Run Hours',            type: 'number', required: false },
  { id: 'exercise_datetime',label: 'Exercise Day & Time',  type: 'text',   required: false },
];

const BATTERY_FIELDS = [
  { id: 'section_battery',     label: 'Battery',                  type: 'section_header' },
  { id: 'battery_size_year',   label: 'Battery Size & Year',      type: 'text',     required: false },
  { id: 'battery_static_v',    label: 'Static Voltage (V)',       type: 'number',   required: false },
  { id: 'battery_cranking_v',  label: 'Cranking Voltage (V)',     type: 'number',   required: false },
  { id: 'battery_charging_v',  label: 'Charging Voltage (V)',     type: 'number',   required: false },
  { id: 'battery_notes',       label: 'Battery Notes',            type: 'textarea', required: false },
];

const FUEL_FIELDS = [
  { id: 'section_fuel',       label: 'Fuel Pressure', type: 'section_header' },
  { id: 'fuel_type',          label: 'Fuel Type',     type: 'dropdown',
    options: ['Natural Gas (NG)', 'Propane (LP)', 'Diesel'], required: false },
  { id: 'fuel_pressure_iwc',  label: 'Fuel Pressure (IWC)', type: 'number', required: false },
];

// ── Template definitions ───────────────────────────────────────────────────────

const TEMPLATES = [
  {
    name: 'Annual Maintenance Checklist',
    category: 'maintenance',
    description: 'Complete annual generator service checklist',
    field_definitions: [
      ...HEADER_FIELDS,
      { id: 'section_checklist', label: 'Annual Maintenance Checklist', type: 'section_header' },
      { id: 'chk_oil_filter',    label: 'Change oil and oil filter — fill oil to spec',            type: 'checkbox' },
      { id: 'chk_air_filter',    label: 'Inspect airbox, replace air filter',                      type: 'checkbox' },
      { id: 'chk_spark_plugs',   label: 'Replace spark plugs',                                     type: 'checkbox' },
      { id: 'chk_valve_adj',     label: 'Inspect and adjust valves (if applicable)',               type: 'checkbox' },
      { id: 'chk_battery_test',  label: 'Test battery for DC voltage output',                      type: 'checkbox' },
      { id: 'chk_battery_conn',  label: 'Inspect, clean, and tighten battery and battery connections', type: 'checkbox' },
      { id: 'chk_fuel_pressure', label: 'Test and record fuel pressure',                           type: 'checkbox' },
      { id: 'chk_reset_counter', label: 'Reset internal maintenance counter',                      type: 'checkbox' },
      { id: 'chk_leave_auto',    label: 'Leave unit in auto',                                      type: 'checkbox' },
      { id: 'chk_ats_conn',      label: 'Inspect and tighten ATS connections',                     type: 'checkbox' },
      { id: 'chk_transfer_test', label: 'Perform transfer test',                                   type: 'checkbox' },
      { id: 'chk_ac_voltage',    label: 'Test and record AC voltage and load amperage',            type: 'checkbox' },
      { id: 'section_notes',     label: 'Checklist Notes', type: 'section_header' },
      { id: 'checklist_notes',   label: 'Notes', type: 'textarea', required: false },
      ...BATTERY_FIELDS,
      ...FUEL_FIELDS,
      { id: 'section_transfer',  label: 'Transfer Test', type: 'section_header' },
      { id: 'ac_voltage_a',      label: 'AC Voltage — A',     type: 'number', required: false },
      { id: 'ac_voltage_b',      label: 'AC Voltage — B',     type: 'number', required: false },
      { id: 'ac_voltage_ab',     label: 'AC Voltage — A+B',   type: 'number', required: false },
      { id: 'amperage_a',        label: 'Amperage — A',       type: 'number', required: false },
      { id: 'amperage_b',        label: 'Amperage — B',       type: 'number', required: false },
      { id: 'amperage_c',        label: 'Amperage — C',       type: 'number', required: false },
      { id: 'transfer_notes',    label: 'Transfer Test Notes', type: 'textarea', required: false },
    ],
  },

  {
    name: 'Oil Change Visit Checklist',
    category: 'maintenance',
    description: 'Oil change visit checklist',
    field_definitions: [
      ...HEADER_FIELDS,
      { id: 'section_checklist', label: 'Oil Change Visit Checklist', type: 'section_header' },
      { id: 'chk_oil_filter',    label: 'Change oil and oil filter — fill oil to spec',                 type: 'checkbox' },
      { id: 'chk_air_filter',    label: 'Inspect airbox and air filter (replace if necessary)',          type: 'checkbox' },
      { id: 'chk_spark_plugs',   label: 'Inspect spark plugs (replace if necessary)',                   type: 'checkbox' },
      { id: 'chk_battery_test',  label: 'Test battery for DC voltage output',                           type: 'checkbox' },
      { id: 'chk_battery_conn',  label: 'Inspect, clean, and tighten battery and battery connections',  type: 'checkbox' },
      { id: 'chk_fuel_pressure', label: 'Test and record fuel pressure',                               type: 'checkbox' },
      { id: 'chk_reset_counter', label: 'Reset internal maintenance counter',                           type: 'checkbox' },
      { id: 'chk_manual_run',    label: 'Run unit in manual mode to ensure proper operation',           type: 'checkbox' },
      { id: 'chk_leave_auto',    label: 'Leave unit in auto',                                           type: 'checkbox' },
      { id: 'section_notes',     label: 'Checklist Notes', type: 'section_header' },
      { id: 'checklist_notes',   label: 'Notes', type: 'textarea', required: false },
      ...BATTERY_FIELDS,
      ...FUEL_FIELDS,
    ],
  },

  {
    name: 'Warranty Claim Documentation',
    category: 'warranty',
    description: 'Generac warranty claim documentation',
    field_definitions: [
      ...HEADER_FIELDS,
      { id: 'generator_install_date', label: 'Install Date',          type: 'date',   required: false },
      { id: 'run_hours_failure',      label: 'Run Hours at Failure',  type: 'number', required: true  },
      { id: 'section_claim',  label: 'Claim Information', type: 'section_header' },
      { id: 'control_number',   label: 'Generac Control Number', type: 'text', required: true },
      { id: 'failure_date',     label: 'Failure Date',     type: 'date', required: true },
      { id: 'diagnostic_date',  label: 'Diagnostic Date',  type: 'date', required: true },
      { id: 'repair_date',      label: 'Repair Date',      type: 'date', required: true },
      { id: 'warranty_status',  label: 'Warranty Status',  type: 'dropdown', required: true,
        options: ['Active — Unit within warranty period', 'Expired — Claim not eligible'] },
      { id: 'maintenance_on_file', label: 'Scheduled maintenance performed per Generac specs and records on file', type: 'checkbox' },
      { id: 'section_failure', label: 'Failure Documentation', type: 'section_header' },
      { id: 'reason_for_failure', label: 'Reason for Failure',           type: 'textarea', required: true },
      { id: 'diagnostic_steps',   label: 'Diagnostic Steps Performed',   type: 'textarea', required: true },
      { id: 'section_repair',  label: 'Repair Documentation', type: 'section_header' },
      { id: 'repair_steps',    label: 'Repair Steps Performed',    type: 'textarea', required: true  },
      { id: 'part_number_1',   label: 'Part Number 1',             type: 'text',     required: false },
      { id: 'part_desc_1',     label: 'Part Description 1',        type: 'text',     required: false },
      { id: 'part_number_2',   label: 'Part Number 2',             type: 'text',     required: false },
      { id: 'part_desc_2',     label: 'Part Description 2',        type: 'text',     required: false },
      { id: 'part_number_3',   label: 'Part Number 3',             type: 'text',     required: false },
      { id: 'part_desc_3',     label: 'Part Description 3',        type: 'text',     required: false },
      { id: 'labor_hours',     label: 'Labor Hours Claimed',        type: 'number',   required: false },
      { id: 'claim_total',     label: 'Total Claim Amount ($)',     type: 'number',   required: false },
    ],
  },
];

// ── Seed ──────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('Seeding document templates...\n');

  for (const template of TEMPLATES) {
    const { data: existing, error: fetchErr } = await supabase
      .from('document_templates')
      .select('id')
      .eq('name', template.name)
      .limit(1);

    if (fetchErr) {
      console.error(`  ERROR checking "${template.name}":`, fetchErr.message);
      continue;
    }

    if (existing?.length > 0) {
      if (!force) {
        console.log(`  SKIP    "${template.name}"  (already exists — use --force to overwrite)`);
        continue;
      }
      const { error } = await supabase
        .from('document_templates')
        .update({ field_definitions: template.field_definitions, category: template.category, description: template.description })
        .eq('id', existing[0].id);
      if (error) { console.error(`  ERROR updating "${template.name}":`, error.message); continue; }
      console.log(`  UPDATED "${template.name}"  (${template.field_definitions.length} fields)`);
    } else {
      const { error } = await supabase
        .from('document_templates')
        .insert(template);
      if (error) { console.error(`  ERROR inserting "${template.name}":`, error.message); continue; }
      console.log(`  INSERTED "${template.name}"  (${template.field_definitions.length} fields)`);
    }
  }

  console.log('\nDone.');
}

seed().catch(e => { console.error(e); process.exit(1); });
