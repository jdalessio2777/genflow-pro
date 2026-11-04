// One source for how a customer's generator is read, printed and saved back
// (Run 12, A3/A4). Pure, no app imports: used by the app, the customer emails,
// the PDFs in api/_lib and (Part B) the connector.
//
// The customer row's generator_* columns are the MAIN generator. A customer with
// more than one has the others in customers.extra_generators (JSON array of
// { id, label, brand, kw, model, serial, install_date, cooling }). A job says
// which one the visit is for in jobs.generator_id (empty = main).
export const GENERATOR_BRANDS = ["Generac", "Kohler", "Briggs & Stratton", "Champion", "Cummins", "Honeywell", "Other"];
export const COOLING_OPTIONS = ["Air-cooled", "Liquid-cooled"];
export const MAIN_GENERATOR_ID = "main";

const clean = (v) => String(v ?? "").trim();
const KW_RE = /(\d+(?:\.\d+)?)\s*kw\b/i;

export function normalizeBrand(value) {
  const s = clean(value).replace(/\s+/g, " ");
  if (!s) return "";
  if (/^briggs( (and|&) stratton)?$/i.test(s)) return "Briggs & Stratton";
  return GENERATOR_BRANDS.find((b) => b.toLowerCase() === s.toLowerCase()) || s;
}

export function normalizeCooling(value) {
  const s = clean(value).toLowerCase();
  if (!s) return "";
  if (s.startsWith("air")) return "Air-cooled";
  if (s.startsWith("liquid")) return "Liquid-cooled";
  return "";
}

// A number for kW, or null ("17", "17.5", "17kW", 17 -> 17 / 17.5).
export function normalizeKw(value) {
  const m = clean(value).match(/^(\d+(?:\.\d+)?)\s*(?:kw)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? n : null;
}

// "YYYY-MM-DD" from whatever is stored (date, or an old timestamp), else "".
export function dateOnly(value) {
  const m = clean(value).match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : "";
}

// "May 1, 2024" without time zones moving it a day.
export function installDateLabel(value) {
  const key = dateOnly(value);
  if (!key) return "";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// Older records hold the brand and size in the model box ("17kW Generac",
// "Generac "). Pull those out so they never print as a model number.
export function splitLegacyModel(value) {
  let rest = clean(value);
  let kw = null;
  let brand = "";
  const k = rest.match(KW_RE);
  if (k) { kw = normalizeKw(k[1]); rest = rest.replace(KW_RE, " "); }
  for (const b of [...GENERATOR_BRANDS, "Briggs and Stratton", "Briggs"]) {
    if (b === "Other") continue;
    const re = new RegExp(`(^|\\s)${b.replace(/[&]/g, "\\&")}(?=\\s|$)`, "i");
    if (re.test(rest)) { brand = normalizeBrand(b); rest = rest.replace(re, " "); break; }
  }
  return { brand, kw, model: rest.replace(/\s+/g, " ").trim() };
}

function readGenerator(raw, id, label) {
  const parts = splitLegacyModel(raw.model);
  return {
    id,
    label,
    brand: normalizeBrand(raw.brand) || parts.brand,
    kw: normalizeKw(raw.kw) ?? parts.kw,
    model: parts.model,
    serial: clean(raw.serial),
    install_date: dateOnly(raw.install_date),
    cooling: normalizeCooling(raw.cooling),
  };
}

// Every generator on the customer, main first.
export function generatorsOf(customer) {
  const c = customer || {};
  const main = readGenerator({
    brand: c.generator_brand, kw: c.generator_kw, model: c.generator_model, serial: c.generator_serial,
    install_date: c.generator_install_date, cooling: c.generator_cooling,
  }, MAIN_GENERATOR_ID, "Main generator");
  const extras = (Array.isArray(c.extra_generators) ? c.extra_generators : [])
    .filter((g) => g && g.id)
    .map((g, i) => readGenerator(g, String(g.id), clean(g.label) || `Generator ${i + 2}`));
  return [main, ...extras];
}

// The generator this job is for: the one it names, else the main one.
export function generatorFor(customer, job) {
  const all = generatorsOf(customer);
  return all.find((g) => g.id === job?.generator_id) || all[0];
}

export function hasGeneratorInfo(gen) {
  return !!gen && !!(gen.brand || gen.kw || gen.model || gen.serial || gen.install_date || gen.cooling);
}

// "Generac 17kW" — "Other" is a form choice, not something to show a customer.
function makeAndSize(gen) {
  const brand = gen.brand === "Other" ? "" : gen.brand;
  return [brand, gen.kw ? `${gen.kw}kW` : ""].filter(Boolean).join(" ");
}

// "Generac 17kW · Model 0060531 · S/N 6737426". Empty parts are left out; "" when
// nothing is known. Takes a generator, or a customer row (+ job).
export function generatorLine(source, job) {
  const gen = source && "label" in source ? source : generatorFor(source, job);
  return [makeAndSize(gen), gen.model ? `Model ${gen.model}` : "", gen.serial ? `S/N ${gen.serial}` : ""].filter(Boolean).join(" · ");
}

// The same without the serial, for lists and subtitles.
export function generatorSummary(source, job) {
  const gen = source && "label" in source ? source : generatorFor(source, job);
  return [makeAndSize(gen), gen.model ? `Model ${gen.model}` : ""].filter(Boolean).join(" · ");
}

// ── checklist <-> customer record (A4) ────────────────────────────────────────
// Checklist field id -> generator key. gen_* are the ids of old templates.
export const GENERATOR_FIELD_IDS = {
  generator_brand: "brand",
  generator_kw: "kw",
  generator_model: "model",
  generator_serial: "serial",
  generator_install_date: "install_date",
  generator_cooling: "cooling",
  gen_brand: "brand",
  gen_kw: "kw",
  gen_model: "model",
  gen_serial: "serial",
  gen_install_date: "install_date",
};
export const GENERATOR_FIELD_LABELS = {
  brand: "brand", kw: "kW", model: "model #", serial: "serial #", install_date: "install date", cooling: "cooling",
};

// A generator value as the checklist shows it, "" when empty.
export function generatorFieldValue(gen, key) {
  const v = gen?.[key];
  return v == null ? "" : String(v);
}

function normalizedFieldValue(key, value) {
  if (key === "brand") return normalizeBrand(value);
  if (key === "kw") return normalizeKw(value);
  if (key === "install_date") return dateOnly(value);
  if (key === "cooling") return normalizeCooling(value);
  return clean(value);
}

const sameValue = (key, a, b) =>
  (typeof a === "string" && typeof b === "string" ? a.toLowerCase() === b.toLowerCase() : a === b);

// What this checklist means for the customer's record:
//   fills     { key: value } saved field is empty: saved with no question
//   conflicts [{ key, label, fieldIds, from, to }] saved field differs: ask first
// Only generator fields on this checklist count; a blank box never erases a
// saved value; run hours, voltages and notes aren't in the map so never get here.
export function generatorChanges(fields, values, gen) {
  const fills = {};
  const conflicts = new Map();
  for (const f of fields || []) {
    const key = GENERATOR_FIELD_IDS[f.id];
    if (!key) continue;
    const entered = normalizedFieldValue(key, values?.[f.id]);
    if (entered === "" || entered == null) continue;
    const saved = normalizedFieldValue(key, gen?.[key]);
    if (saved === "" || saved == null) { fills[key] = entered; continue; }
    if (sameValue(key, entered, saved)) continue;
    const existing = conflicts.get(key);
    if (existing) existing.fieldIds.push(f.id);
    else conflicts.set(key, { key, label: GENERATOR_FIELD_LABELS[key], fieldIds: [f.id], from: String(saved), to: String(entered) });
  }
  return { fills, conflicts: [...conflicts.values()] };
}

const MAIN_COLUMNS = {
  brand: "generator_brand", kw: "generator_kw", model: "generator_model", serial: "generator_serial",
  install_date: "generator_install_date", cooling: "generator_cooling",
};

// The update for the customer row that writes `updates` to that generator.
export function generatorPatch(customer, generatorId, updates) {
  if (!generatorId || generatorId === MAIN_GENERATOR_ID) {
    return Object.fromEntries(Object.entries(updates).map(([k, v]) => [MAIN_COLUMNS[k], v]));
  }
  const extras = Array.isArray(customer?.extra_generators) ? customer.extra_generators : [];
  return { extra_generators: extras.map((g) => (String(g.id) === String(generatorId) ? { ...g, ...updates } : g)) };
}
