// The connector's tools (Run 12, B2). No delete tool, on purpose. Same rules as the
// app, through the shared rule files. Every message here may be read out by Claude.
import {
  etIso, etParts, jobTimeLabel, windowLabel, hasArrivalWindow, calendarEndMs, appointmentFromPicker, WINDOW_PRESETS, MODE_CUSTOM, MODE_EXACT,
} from './shared/arrivalWindow.js';
import {
  generatorsOf, generatorFor, generatorLine, generatorChanges, generatorPatch, normalizeBrand, normalizeKw, normalizeCooling,
  GENERATOR_BRANDS, COOLING_OPTIONS, GENERATOR_FIELD_IDS, MAIN_GENERATOR_ID,
} from './shared/generatorInfo.js';
import { TECHS, jobTechs, techsLabel, techsPatch } from './shared/jobTechs.js';
import { SERVICE_TYPES, isServiceType } from './shared/jobTypes.js';
import { DEFAULT_ESTIMATE_MINUTES, estimateMinutes } from './shared/jobDuration.js';

export class ToolError extends Error {
  constructor(message, data) { super(message); this.data = data; }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OPEN = ['scheduled', 'dispatched', 'on_site', 'in_progress'];
const MAX_RANGE_DAYS = 62;
const clean = (v) => String(v ?? '').trim();
const digits = (v) => clean(v).replace(/\D/g, '').slice(-10);
const nameKey = (v) => clean(v).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const todayEt = () => etParts(new Date().toISOString()).date;

function text(args, key, { required = false, max = 200 } = {}) {
  const v = args[key];
  if (v === undefined || v === null || v === '') {
    if (required) throw new ToolError(`${key} is required.`);
    return undefined;
  }
  if (typeof v !== 'string') throw new ToolError(`${key} must be text.`);
  const s = v.trim();
  if (!s && required) throw new ToolError(`${key} is required.`);
  if (s.length > max) throw new ToolError(`${key} is too long (limit ${max} characters).`);
  return s || undefined;
}
function uuid(args, key) {
  const v = text(args, key, { required: true });
  if (!UUID.test(v)) throw new ToolError(`${key} must be a customer or job id from search_customers or list_schedule.`);
  return v;
}
function dateArg(args, key, { required = true } = {}) {
  const v = text(args, key, { required });
  if (v === undefined) return v;
  if (!DATE.test(v) || Number.isNaN(Date.parse(`${v}T12:00:00Z`)) || new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) !== v) {
    throw new ToolError(`${key} must be a real date written YYYY-MM-DD.`);
  }
  return v;
}
function techList(value, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new ToolError(`techs is required: one or more of ${TECHS.join(', ')}.`);
    return undefined;
  }
  const list = Array.isArray(value) ? value : [value];
  const names = list.map((n) => {
    const hit = TECHS.find((t) => t.toLowerCase() === clean(n).split(/\s+/)[0].toLowerCase());
    if (!hit) throw new ToolError(`"${n}" isn't a tech. Choose from ${TECHS.join(', ')}.`);
    return hit;
  });
  if (!names.length && required) throw new ToolError(`techs is required: one or more of ${TECHS.join(', ')}.`);
  return [...new Set(names)];
}
function generatorArg(g) {
  if (g === undefined || g === null) return {};
  if (typeof g !== 'object' || Array.isArray(g)) throw new ToolError('generator must be an object of brand, kw, model, serial, install_date, cooling.');
  const out = {};
  const brand = text(g, 'brand', { max: 60 });
  if (brand) out.brand = normalizeBrand(brand);
  if (g.kw !== undefined && g.kw !== null && g.kw !== '') {
    const kw = normalizeKw(g.kw);
    if (kw === null) throw new ToolError('generator kw must be a number, like 17 or 17.5.');
    out.kw = kw;
  }
  const model = text(g, 'model', { max: 60 });
  if (model) out.model = model;
  const serial = text(g, 'serial', { max: 60 });
  if (serial) out.serial = serial;
  const install = dateArg(g, 'install_date', { required: false });
  if (install) out.install_date = install;
  if (g.cooling !== undefined && g.cooling !== null && g.cooling !== '') {
    const cooling = normalizeCooling(g.cooling);
    if (!cooling) throw new ToolError(`generator cooling must be one of ${COOLING_OPTIONS.join(', ')}.`);
    out.cooling = cooling;
  }
  return out;
}
function contactArg(args, { nameRequired = false } = {}) {
  const out = {};
  const name = text(args, 'name', { required: nameRequired, max: 120 });
  if (name) out.name = name;
  const phone = text(args, 'phone', { max: 40 });
  if (phone) {
    if (digits(phone).length < 7) throw new ToolError('phone does not look like a phone number.');
    out.phone = phone;
  }
  const email = text(args, 'email', { max: 200 });
  if (email) {
    if (!EMAIL.test(email)) throw new ToolError('email does not look like an email address.');
    out.email = email;
  }
  const address = text(args, 'address', { max: 300 });
  if (address) out.address = address;
  return out;
}

const CUSTOMER_FIELDS = 'id,name,phone,email,address,generator_brand,generator_kw,generator_model,generator_serial,generator_install_date,generator_cooling,extra_generators,property_notes,notes,repeat_note,membership_plan,membership_expiry,last_service_date,service_interval';
const JOB_FIELDS = 'id,customer_id,customer_name,title,job_type,status,scheduled_date,arrival_window_end,estimated_minutes,assigned_techs,assigned_to_name,customer_description,notes,generator_id,calendar_event_id,confirmation_sent_at';

const customerSummary = (c) => ({ id: c.id, name: clean(c.name), phone: c.phone || null, email: c.email || null, address: c.address || null, generator: generatorLine(c) || null });
const generatorOut = ({ id, label, brand, kw, model, serial, install_date, cooling }) => ({ id, label, brand: brand || null, kw: kw ?? null, model: model || null, serial: serial || null, install_date: install_date || null, cooling: cooling || null });

function jobOut(j) {
  const { date } = etParts(j.scheduled_date);
  return {
    id: j.id, customer_id: j.customer_id, customer: clean(j.customer_name), title: clean(j.title), service_type: j.job_type || null, status: j.status,
    date: date || null, time: j.scheduled_date ? jobTimeLabel(j) : null, arrival_window: windowLabel(j) || null,
    techs: jobTechs(j), estimated_minutes: estimateMinutes(j),
  };
}

async function getCustomerRow(ctx, id) {
  const rows = await ctx.rest(`customers?id=eq.${id}&select=${CUSTOMER_FIELDS}`);
  if (!rows?.length) throw new ToolError('No customer has that id. Use search_customers to find them.');
  return rows[0];
}

function likelyDuplicates(all, { name, phone, email }) {
  const p = phone ? digits(phone) : ''; const e = clean(email).toLowerCase(); const n = nameKey(name);
  return all.filter((c) =>
    (p.length >= 7 && digits(c.phone) === p) || (e && clean(c.email).toLowerCase() === e) || (n && nameKey(c.name) === n));
}

const dayRange = (from, to) => [etIso(from, '00:00'), etIso(addDays(to, 1), '00:00')];
function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
async function jobsBetween(ctx, from, to, { openOnly = false } = {}) {
  const [a, b] = dayRange(from, to);
  const status = openOnly ? `&status=in.(${OPEN.join(',')})` : '&status=neq.canceled';
  return ctx.rest(`jobs?scheduled_date=gte.${encodeURIComponent(a)}&scheduled_date=lt.${encodeURIComponent(b)}${status}&order=scheduled_date.asc&select=${JOB_FIELDS}`);
}
// The time a job holds a tech: start to (window end + time on site), as the calendar shows it.
function jobBlock(j) {
  return { start: new Date(j.scheduled_date).getTime(), end: calendarEndMs(j, estimateMinutes(j)) };
}

function appointmentArg(args, { required = true } = {}) {
  const date = dateArg(args, 'date', { required });
  if (!date) return {};
  const windowName = text(args, 'arrival_window', { max: 20 });
  const start = text(args, 'window_start', { max: 5 });
  const end = text(args, 'window_end', { max: 5 });
  const exact = text(args, 'exact_time', { max: 5 });
  for (const [k, v] of [['window_start', start], ['window_end', end], ['exact_time', exact]]) {
    if (v && !TIME.test(v)) throw new ToolError(`${k} must be 24-hour time like 10:00 or 14:30, Eastern.`);
  }
  let picker;
  if (exact) {
    if (windowName || start || end) throw new ToolError('Give an arrival window or an exact time, not both.');
    picker = { date, mode: MODE_EXACT, start: exact };
  } else if (windowName) {
    const preset = WINDOW_PRESETS.find((p) => p.key === windowName);
    if (!preset) throw new ToolError(`arrival_window must be one of ${WINDOW_PRESETS.map((p) => `${p.key} (${p.label})`).join(', ')}. For anything else use window_start and window_end.`);
    picker = { date, mode: preset.key };
  } else if (start || end) {
    if (!start || !end) throw new ToolError('Give both window_start and window_end.');
    const preset = WINDOW_PRESETS.find((p) => p.start === start && p.end === end);
    picker = preset ? { date, mode: preset.key } : { date, mode: MODE_CUSTOM, start, end };
  } else {
    throw new ToolError('Give the arrival window: arrival_window, or window_start + window_end. exact_time is for emergencies.');
  }
  const appointment = appointmentFromPicker(picker);
  if (appointment.error) throw new ToolError(appointment.error);
  return { date, ...appointment };
}

const generatorSchema = {
  type: 'object', additionalProperties: false,
  description: 'Generator details. Leave out anything unknown.',
  properties: {
    brand: { type: 'string', enum: GENERATOR_BRANDS }, kw: { type: 'number' }, model: { type: 'string' }, serial: { type: 'string' },
    install_date: { type: 'string', description: 'YYYY-MM-DD' }, cooling: { type: 'string', enum: COOLING_OPTIONS },
  },
};
const contactSchema = { name: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' }, address: { type: 'string' } };
const READ = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

export const TOOLS = [
  {
    name: 'search_customers', title: 'Search customers', annotations: READ,
    description: 'Find GenFlow customers by name, phone, email or address. Use before creating a customer or a job.',
    inputSchema: { type: 'object', required: ['query'], additionalProperties: false, properties: { query: { type: 'string', description: 'Part of a name, phone, email or address' } } },
    async run(ctx, args) {
      const q = text(args, 'query', { required: true, max: 120 }).toLowerCase();
      if (q.length < 2) throw new ToolError('query needs at least 2 characters.');
      const qDigits = q.replace(/\D/g, '');
      const all = await ctx.rest(`customers?select=${CUSTOMER_FIELDS}&order=name.asc&limit=2000`);
      const hits = all.filter((c) => [c.name, c.email, c.address].some((f) => clean(f).toLowerCase().includes(q))
        || (qDigits.length >= 4 && clean(c.phone).replace(/\D/g, '').includes(qDigits)));
      const customers = hits.slice(0, 20).map(customerSummary);
      return { text: hits.length ? `Found ${hits.length} customer${hits.length === 1 ? '' : 's'}.` : `No customer matches "${q}".`, data: { customers, more: hits.length > 20 } };
    },
  },
  {
    name: 'get_customer', title: 'Get customer', annotations: READ,
    description: 'One customer with contact details, generator info and their 10 most recent jobs.',
    inputSchema: { type: 'object', required: ['customer_id'], additionalProperties: false, properties: { customer_id: { type: 'string' } } },
    async run(ctx, args) {
      const c = await getCustomerRow(ctx, uuid(args, 'customer_id'));
      const jobs = await ctx.rest(`jobs?customer_id=eq.${c.id}&order=scheduled_date.desc.nullslast&limit=10&select=${JOB_FIELDS}`);
      return {
        text: `${clean(c.name)}${generatorLine(c) ? `: ${generatorLine(c)}` : ''}.`,
        data: { ...customerSummary(c), notes: c.notes || null, property_notes: c.property_notes || null, always_show_note: c.repeat_note || null, membership_plan: c.membership_plan || null, membership_expiry: c.membership_expiry || null, generators: generatorsOf(c).map(generatorOut), recent_jobs: jobs.map(jobOut) },
      };
    },
  },
  {
    name: 'create_customer', title: 'Create customer', annotations: WRITE,
    description: 'Add a customer. Refuses likely duplicates (same phone, email or name) and lists them, unless proceed_despite_duplicate is true. Only set that after the person confirms it really is a different customer.',
    inputSchema: {
      type: 'object', required: ['name'], additionalProperties: false,
      properties: { ...contactSchema, notes: { type: 'string', description: 'Internal notes, never shown to the customer' }, generator: generatorSchema, proceed_despite_duplicate: { type: 'boolean' } },
    },
    async run(ctx, args) {
      const contact = contactArg(args, { nameRequired: true });
      const gen = generatorArg(args.generator);
      const notes = text(args, 'notes', { max: 4000 });
      const all = await ctx.rest('customers?select=id,name,phone,email,address,generator_brand,generator_kw,generator_model,generator_serial&limit=2000');
      const dupes = likelyDuplicates(all, contact);
      if (dupes.length && args.proceed_despite_duplicate !== true) {
        throw new ToolError(`Not created: ${dupes.length === 1 ? 'a customer' : `${dupes.length} customers`} may already match. Ask whether this is the same person. To add anyway, set proceed_despite_duplicate.`, { likely_duplicates: dupes.map(customerSummary) });
      }
      const row = { ...contact, ...(notes ? { notes } : {}), ...generatorPatch(null, MAIN_GENERATOR_ID, gen) };
      const [saved] = await ctx.rest('customers?select=id,name,phone,email,address,generator_brand,generator_kw,generator_model,generator_serial', { method: 'POST', body: row, prefer: 'return=representation' });
      return { text: `Created customer ${clean(saved.name)}.`, data: customerSummary(saved) };
    },
  },
  {
    name: 'update_customer_contact', title: 'Update customer contact or generator', annotations: WRITE,
    description: 'Change a customer\'s contact details or generator info, nothing else. Filling an empty generator field just saves. Changing a saved generator value is refused and shows the old and new values; set confirm_generator_changes only after the person confirms.',
    inputSchema: {
      type: 'object', required: ['customer_id'], additionalProperties: false,
      properties: { customer_id: { type: 'string' }, ...contactSchema, generator: generatorSchema, generator_id: { type: 'string', description: 'Only when the customer has more than one generator; from get_customer' }, confirm_generator_changes: { type: 'boolean' } },
    },
    async run(ctx, args) {
      const c = await getCustomerRow(ctx, uuid(args, 'customer_id'));
      const contact = contactArg(args);
      const gen = generatorArg(args.generator);
      if (!Object.keys(contact).length && !Object.keys(gen).length) throw new ToolError('Nothing to change: give a contact or generator field.');
      const generatorId = text(args, 'generator_id', { max: 60 }) || MAIN_GENERATOR_ID;
      const target = generatorsOf(c).find((g) => g.id === generatorId);
      if (!target) throw new ToolError('That customer has no generator with that id. Use get_customer to see them.');
      const byKey = Object.fromEntries(Object.entries(GENERATOR_FIELD_IDS).filter(([id]) => id.startsWith('generator_')).map(([id, key]) => [key, id]));
      const fields = Object.keys(gen).map((key) => ({ id: byKey[key] }));
      const values = Object.fromEntries(Object.entries(gen).map(([key, v]) => [byKey[key], v]));
      const { fills, conflicts } = generatorChanges(fields, values, target);
      if (conflicts.length && args.confirm_generator_changes !== true) {
        throw new ToolError(`Not changed. Confirm first: ${conflicts.map((x) => `update ${x.label} from ${x.from} to ${x.to}?`).join(' ')} Then call again with confirm_generator_changes.`, { changes_to_confirm: conflicts.map(({ label, from, to }) => ({ field: label, from, to })) });
      }
      const updates = { ...fills };
      for (const x of conflicts) updates[x.key] = x.key === 'kw' ? Number(x.to) : x.to;
      const patch = { ...contact, ...(Object.keys(updates).length ? generatorPatch(c, generatorId, updates) : {}) };
      if (!Object.keys(patch).length) return { text: `No change needed; ${clean(c.name)} already has those values.`, data: customerSummary(c) };
      const [saved] = await ctx.rest(`customers?id=eq.${c.id}&select=${CUSTOMER_FIELDS}`, { method: 'PATCH', body: patch, prefer: 'return=representation' });
      return { text: `Updated ${clean(saved.name)}: ${Object.keys(patch).map((k) => k.replace(/^generator_/, 'generator ')).join(', ')}.`, data: customerSummary(saved) };
    },
  },
  {
    name: 'list_schedule', title: 'List schedule', annotations: READ,
    description: 'Jobs on the schedule between two dates (Eastern), optionally for one tech. A shared job shows for each of its techs. Canceled jobs are left out.',
    inputSchema: {
      type: 'object', required: ['from'], additionalProperties: false,
      properties: { from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD; defaults to from' }, tech: { type: 'string', enum: TECHS } },
    },
    async run(ctx, args) {
      const from = dateArg(args, 'from');
      const to = dateArg(args, 'to', { required: false }) || from;
      if (to < from) throw new ToolError('to is before from.');
      if ((Date.parse(to) - Date.parse(from)) / 86400000 > MAX_RANGE_DAYS) throw new ToolError(`That range is too long; the limit is ${MAX_RANGE_DAYS} days.`);
      const [tech] = techList(args.tech) || [];
      const jobs = (await jobsBetween(ctx, from, to)).filter((j) => !tech || jobTechs(j).includes(tech));
      return { text: `${jobs.length} job${jobs.length === 1 ? '' : 's'} from ${from} to ${to}${tech ? ` for ${tech}` : ''}.`, data: { jobs: jobs.map(jobOut) } };
    },
  },
  {
    name: 'check_availability', title: 'Check availability', annotations: READ,
    description: 'Is a tech free on a date? Lists what each tech has that day, counting window start to (window end + time on site). With a window, says whether it clashes. Looks at GenFlow jobs only, not other Google Calendar events.',
    inputSchema: {
      type: 'object', required: ['date'], additionalProperties: false,
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD' }, techs: { type: 'array', items: { type: 'string', enum: TECHS }, description: 'Defaults to all techs' },
        arrival_window: { type: 'string', enum: WINDOW_PRESETS.map((p) => p.key) }, window_start: { type: 'string', description: 'HH:MM, Eastern' }, window_end: { type: 'string', description: 'HH:MM, Eastern' },
        estimated_minutes: { type: 'integer', description: `Defaults to ${DEFAULT_ESTIMATE_MINUTES}` },
      },
    },
    async run(ctx, args) {
      const date = dateArg(args, 'date');
      const techs = techList(args.techs) || TECHS;
      const wants = args.arrival_window || args.window_start || args.window_end;
      const want = wants ? appointmentArg(args) : null;
      const minutes = estimateArg(args);
      const proposed = want ? { start: new Date(want.scheduled_date).getTime(), end: calendarEndMs(want, minutes) } : null;
      const jobs = await jobsBetween(ctx, date, date, { openOnly: true });
      const byTech = techs.map((tech) => {
        const mine = jobs.filter((j) => jobTechs(j).includes(tech));
        const clashes = proposed ? mine.filter((j) => { const b = jobBlock(j); return b.start < proposed.end && proposed.start < b.end; }) : [];
        return {
          tech, jobs: mine.map((j) => ({ ...jobOut(j), holds_until: etParts(new Date(jobBlock(j).end).toISOString()).time })),
          ...(proposed ? { free: clashes.length === 0, clashes_with: clashes.map((j) => j.id) } : {}),
        };
      });
      const unassigned = jobs.filter((j) => !jobTechs(j).length).map(jobOut);
      const summary = proposed
        ? byTech.map((t) => `${t.tech} ${t.free ? 'is free' : `has ${t.clashes_with.length} clash${t.clashes_with.length === 1 ? '' : 'es'}`}`).join('; ')
        : byTech.map((t) => `${t.tech} has ${t.jobs.length} job${t.jobs.length === 1 ? '' : 's'}`).join('; ');
      return { text: `${date}: ${summary}. Other Google Calendar events aren't checked.`, data: { date, techs: byTech, unassigned_jobs: unassigned } };
    },
  },
  {
    name: 'create_job', title: 'Create job', annotations: WRITE,
    description: 'Schedule a job for a customer: service type, one or more techs, an arrival window, notes and description. Emails the customer ONLY if send_confirmation is true; by default nobody is notified. Refuses a likely duplicate (same customer, same day) unless allow_duplicate is true.',
    inputSchema: {
      type: 'object', required: ['customer_id', 'service_type', 'techs', 'date'], additionalProperties: false,
      properties: {
        customer_id: { type: 'string' },
        service_type: { type: 'string', enum: SERVICE_TYPES.map((t) => t.value) },
        techs: { type: 'array', items: { type: 'string', enum: TECHS }, minItems: 1, description: 'One or more. The first is the lead.' },
        date: { type: 'string', description: 'YYYY-MM-DD, Eastern' },
        arrival_window: { type: 'string', enum: WINDOW_PRESETS.map((p) => p.key), description: WINDOW_PRESETS.map((p) => `${p.key} = ${p.label}`).join(', ') },
        window_start: { type: 'string', description: 'Custom window start, HH:MM 24-hour Eastern' },
        window_end: { type: 'string', description: 'Custom window end, HH:MM 24-hour Eastern' },
        exact_time: { type: 'string', description: 'Emergencies only: exact time instead of a window, HH:MM' },
        title: { type: 'string', description: 'Short job title; defaults to the service type' },
        description: { type: 'string', description: 'Customer-facing: appears in the confirmation email' },
        notes: { type: 'string', description: 'Internal notes, never shown to the customer' },
        estimated_minutes: { type: 'integer', description: `Time on site; defaults to ${DEFAULT_ESTIMATE_MINUTES}` },
        generator_id: { type: 'string', description: 'Only when the customer has more than one generator' },
        send_confirmation: { type: 'boolean', description: 'true only when the person asked to email the customer now' },
        allow_duplicate: { type: 'boolean' },
      },
    },
    async run(ctx, args) {
      const customer = await getCustomerRow(ctx, uuid(args, 'customer_id'));
      const type = text(args, 'service_type', { required: true, max: 40 });
      if (!isServiceType(type)) throw new ToolError(`service_type must be one of ${SERVICE_TYPES.map((t) => t.value).join(', ')}.`);
      const techs = techList(args.techs, { required: true });
      const { date, scheduled_date, arrival_window_end } = appointmentArg(args);
      if (date < todayEt()) throw new ToolError(`${date} is in the past.`);
      const minutes = estimateArg(args);
      const send = args.send_confirmation === true; // never a truthy string or number
      if (args.send_confirmation !== undefined && typeof args.send_confirmation !== 'boolean') throw new ToolError('send_confirmation must be true or false.');
      if (send && !customer.email) throw new ToolError(`Not created: ${clean(customer.name)} has no email on file, so no confirmation can be sent. Add one with update_customer_contact, or create the job without send_confirmation.`);
      const generatorId = text(args, 'generator_id', { max: 60 });
      if (generatorId && !generatorsOf(customer).some((g) => g.id === generatorId)) throw new ToolError('That customer has no generator with that id.');
      const dupes = (await jobsBetween(ctx, date, date, { openOnly: true })).filter((j) => j.customer_id === customer.id);
      if (dupes.length && args.allow_duplicate !== true) {
        throw new ToolError(`Not created: ${clean(customer.name)} already has a job on ${date}. Ask whether this is a second visit. To add anyway, set allow_duplicate.`, { existing_jobs: dupes.map(jobOut) });
      }
      const label = SERVICE_TYPES.find((t) => t.value === type).label;
      const row = {
        customer_id: customer.id, customer_name: customer.name, title: text(args, 'title', { max: 200 }) || label, job_type: type, status: 'scheduled',
        scheduled_date, arrival_window_end, estimated_minutes: minutes, ...techsPatch(techs),
        customer_description: text(args, 'description', { max: 4000 }) || null, notes: text(args, 'notes', { max: 4000 }) || '',
        ...(generatorId && generatorId !== MAIN_GENERATOR_ID ? { generator_id: generatorId } : {}),
        // The app on a staff phone adds the Google Calendar event (see connector-design.md).
        ...(ctx.calendarPending ? { calendar_sync_pending: true } : {}),
      };
      const [job] = await ctx.rest(`jobs?select=${JOB_FIELDS}`, { method: 'POST', body: row, prefer: 'return=representation' });
      const warnings = [];
      // Same draft invoice as the app.
      try {
        await ctx.rest('invoices', { method: 'POST', prefer: 'return=minimal', body: {
          job_id: job.id, customer_id: customer.id, customer_name: customer.name, invoice_number: `INV-${Date.now().toString(36).toUpperCase()}`,
          parts_total: 0, labor_total: 0, total: 0, line_items: [], notes: '', status: 'draft',
        } });
      } catch { warnings.push('Its draft invoice was not created yet; Collect Payment will create it.'); }
      let emailed = false;
      if (send) {
        try {
          const r = await ctx.sendConfirmation(job.id);
          emailed = !r.skipped;
          if (r.skipped) warnings.push(`The confirmation was not sent (${r.skipped}).`);
        } catch { warnings.push('The confirmation email FAILED. The job screen has a Resend button.'); }
      }
      const when = `${date}, ${hasArrivalWindow(job) ? `arrival window ${windowLabel(job)}` : jobTimeLabel(job)}`;
      const email = emailed ? `Confirmation emailed to ${customer.email}.` : 'The customer was not notified.';
      const calendar = 'It will appear on Google Calendar the next time GenFlow is open on a staff phone.';
      return {
        text: [`Created "${clean(job.title)}" for ${clean(customer.name)}: ${when}, ${techsLabel(job)}.`, email, calendar, ...warnings].join(' '),
        data: { ...jobOut(job), customer_notified: emailed, calendar: 'pending', generator: generatorLine(customer, job) || null, warnings },
      };
    },
  },
];

function estimateArg(args) {
  const v = args.estimated_minutes;
  if (v === undefined || v === null) return DEFAULT_ESTIMATE_MINUTES;
  if (!Number.isInteger(v) || v <= 0 || v > 1440) throw new ToolError('estimated_minutes must be a whole number from 1 to 1440.');
  return v;
}

// What the audit row keeps: the inputs, each value cut short.
export function summarizeInputs(args) {
  const cut = (v) => {
    if (typeof v === 'string') return v.length > 200 ? `${v.slice(0, 200)}…` : v;
    if (Array.isArray(v)) return v.slice(0, 20).map(cut);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).slice(0, 30).map(([k, x]) => [k, cut(x)]));
    return v;
  };
  return cut(args);
}
