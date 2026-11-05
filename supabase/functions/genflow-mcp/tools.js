// The connector's tools. No delete, email, payment or mileage tool, on purpose. Input checks
// and friendly messages live here; the rules that matter are repeated in the database, in one
// connector_* function per tool (Run 13, A3), which is the only thing this token can reach.
// Every message here may be read out by Claude.
import {
  etParts, jobTimeLabel, windowLabel, hasArrivalWindow, calendarEndMs, appointmentFromPicker, WINDOW_PRESETS, MODE_CUSTOM, MODE_EXACT,
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
const MAX_RANGE_DAYS = 62;
const clean = (v) => String(v ?? '').trim();
const digits = (v) => clean(v).replace(/\D/g, '').slice(-10);
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

// One database function per tool. A refusal comes back as { ok: false }, already audited there.
async function db(ctx, fn, args) {
  const out = await ctx.rpc(fn, args);
  if (!out?.ok) throw new ToolError(out?.message || 'GenFlow refused that.', out?.data);
  return out;
}
const getCustomerRow = (ctx, id) => db(ctx, 'connector_get_customer', { p_customer_id: id });

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
      const q = text(args, 'query', { required: true, max: 120 });
      if (q.length < 2) throw new ToolError('query needs at least 2 characters.');
      const { total, customers } = await db(ctx, 'connector_search_customers', { p_query: q });
      return { text: total ? `Found ${total} customer${total === 1 ? '' : 's'}.` : `No customer matches "${q}".`, data: { customers: customers.map(customerSummary), more: total > customers.length } };
    },
  },
  {
    name: 'get_customer', title: 'Get customer', annotations: READ,
    description: 'One customer with contact details, generator info and their 10 most recent jobs.',
    inputSchema: { type: 'object', required: ['customer_id'], additionalProperties: false, properties: { customer_id: { type: 'string' } } },
    async run(ctx, args) {
      const { customer: c, jobs } = await getCustomerRow(ctx, uuid(args, 'customer_id'));
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
      let saved;
      try {
        ({ customer: saved } = await db(ctx, 'connector_create_customer', {
          p_name: contact.name, p_phone: contact.phone ?? null, p_email: contact.email ?? null, p_address: contact.address ?? null, p_notes: notes ?? null,
          p_generator: generatorPatch(null, MAIN_GENERATOR_ID, gen), p_proceed_despite_duplicate: args.proceed_despite_duplicate === true,
        }));
      } catch (e) {
        if (e.data?.likely_duplicates) e.data = { likely_duplicates: e.data.likely_duplicates.map(customerSummary) };
        throw e;
      }
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
      const { customer: c } = await getCustomerRow(ctx, uuid(args, 'customer_id'));
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
      const { customer: saved } = await db(ctx, 'connector_update_customer_contact', { p_customer_id: c.id, p_patch: patch });
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
      const { jobs: all } = await db(ctx, 'connector_list_schedule', { p_from: from, p_to: to });
      const jobs = all.filter((j) => !tech || jobTechs(j).includes(tech));
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
      const { jobs } = await db(ctx, 'connector_check_availability', { p_date: date });
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
    description: 'Schedule a job for a customer: service type, one or more techs, an arrival window, notes and description. Never emails the customer; the tech sends any confirmation from the job screen in GenFlow. Refuses a likely duplicate (same customer, same day) unless allow_duplicate is true.',
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
        description: { type: 'string', description: 'Customer-facing: appears in the confirmation email if the tech sends one' },
        notes: { type: 'string', description: 'Internal notes, never shown to the customer' },
        estimated_minutes: { type: 'integer', description: `Time on site; defaults to ${DEFAULT_ESTIMATE_MINUTES}` },
        generator_id: { type: 'string', description: 'Only when the customer has more than one generator' },
        allow_duplicate: { type: 'boolean' },
      },
    },
    async run(ctx, args) {
      const customerId = uuid(args, 'customer_id');
      const type = text(args, 'service_type', { required: true, max: 40 });
      if (!isServiceType(type)) throw new ToolError(`service_type must be one of ${SERVICE_TYPES.map((t) => t.value).join(', ')}.`);
      const techs = techList(args.techs, { required: true });
      const { date, scheduled_date, arrival_window_end } = appointmentArg(args);
      if (date < todayEt()) throw new ToolError(`${date} is in the past.`);
      const generatorId = text(args, 'generator_id', { max: 60 });
      let job;
      try {
        ({ job } = await db(ctx, 'connector_create_job', {
          p_customer_id: customerId, p_job_type: type, p_techs: techs, p_scheduled_date: scheduled_date, p_arrival_window_end: arrival_window_end ?? null,
          p_estimated_minutes: estimateArg(args), p_title: text(args, 'title', { max: 200 }) ?? null, p_description: text(args, 'description', { max: 4000 }) ?? null,
          p_notes: text(args, 'notes', { max: 4000 }) ?? null, p_generator_id: generatorId && generatorId !== MAIN_GENERATOR_ID ? generatorId : null, p_allow_duplicate: args.allow_duplicate === true,
        }));
      } catch (e) {
        if (e.data?.existing_jobs) e.data = { existing_jobs: e.data.existing_jobs.map(jobOut) };
        throw e;
      }
      const when = `${date}, ${hasArrivalWindow(job) ? `arrival window ${windowLabel(job)}` : jobTimeLabel(job)}`;
      return {
        text: `Created "${clean(job.title)}" for ${clean(job.customer_name)}: ${when}, ${techsLabel(job)}. The customer was not notified. Google Calendar updates within a minute.`,
        data: { ...jobOut(job), customer_notified: false },
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
