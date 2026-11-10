// Add / edit any catalog item (HOTFIX catalog).
//
// The catalog lives in two tables:
//   parts        — parts (price default_price, cost, stock in_stock, part #)
//   labor_rates  — type "hourly" (rate / cost_rate) and type "flat_rate"
//                  (flat_price / flat_cost); the category picks the folder
//                  (maintenance, service_agreements, discounts, custom, …).
// labor_rates has no description column: its `notes` is the description.
//
// Prices are copied onto job/quote/invoice lines when added, so editing a
// catalog item only changes items added from now on.
// Nothing is hard-deleted any more: `is_hidden` archives an item.
import { firstManagedPatch } from "@/lib/utils/partsManaged";

// What the Add/Edit dialog offers as "Type". Each maps to a table + row type,
// and some fix the category (the Catalog's own top folders).
export const ITEM_TYPES = [
  { key: "part", label: "Part", table: "parts" },
  { key: "labor", label: "Labor (hourly)", table: "labor_rates", rowType: "hourly" },
  { key: "flat_rate", label: "Flat rate / Service", table: "labor_rates", rowType: "flat_rate" },
  { key: "maintenance", label: "Maintenance package", table: "labor_rates", rowType: "flat_rate", category: "maintenance" },
  { key: "service_agreement", label: "Service agreement", table: "labor_rates", rowType: "flat_rate", category: "service_agreements" },
  { key: "discount", label: "Discount", table: "labor_rates", rowType: "flat_rate", category: "discounts" },
];

export const CUSTOM_FLAT_CATEGORY = "custom";

export const PART_CATEGORY_OPTIONS = [
  ["air_filters", "Air Filters"], ["oil_filters", "Oil Filters"], ["oils_fluids", "Oils & Fluids"],
  ["spark_plugs", "Spark Plugs"], ["batteries", "Batteries"], ["battery_chargers", "Battery Chargers"],
  ["belt", "Belts"], ["gasket", "Gaskets"], ["electrical", "Electrical"], ["coolant", "Coolant"],
  ["hardware", "Hardware"], ["oil_pressure_switches", "Oil Pressure Switches"], ["starters", "Starters"],
  ["controllers", "Controllers"], ["load_shed", "Load Shed"], ["smm_boards", "SMM Boards"],
  ["fuel_system", "Fuel System"], ["brushes", "Brushes"], ["stepper_motors", "Stepper Motors"],
  ["air_boxes", "Air Boxes & Mixers"], ["transfer_switch", "Transfer Switch"], ["gaskets_seals", "Gaskets & Seals"],
  ["voltage_regulators", "Voltage Regulators"], ["ignition", "Ignition"], ["circuit_breakers", "Circuit Breakers"],
  ["relays", "Relays & Contactors"], ["other", "Other"],
];

export const LABOR_CATEGORY_OPTIONS = [
  ["labor", "Standard"], ["after_hours", "After Hours & Weekend"], ["emergency", "Emergency"], ["other", "Other"],
];

export const FLAT_CATEGORY_OPTIONS = [
  [CUSTOM_FLAT_CATEGORY, "Custom"],
  ["oil_pressure_switches", "Oil Pressure Switches"], ["starters", "Starters"], ["controllers", "Controllers"],
  ["load_shed", "Load Shed"], ["smm_boards", "SMM Boards"], ["fuel_system", "Fuel System"], ["brushes", "Brushes"],
  ["stepper_motors", "Stepper Motors"], ["air_boxes", "Air Boxes & Mixers"], ["transfer_switch", "Transfer Switch"],
  ["gaskets_seals", "Gaskets & Seals"], ["voltage_regulators", "Voltage Regulators"], ["ignition", "Ignition"],
  ["circuit_breakers", "Circuit Breakers"], ["relays", "Relays & Contactors"], ["batteries", "Batteries"],
  ["emergency", "Emergency (shows on Labor tab)"], ["other", "Other"],
];

export const typeByKey = (key) => ITEM_TYPES.find((t) => t.key === key) ?? ITEM_TYPES[0];

// Dialog type key for an existing row.
export function itemTypeKey(row, table) {
  if (table === "parts") return "part";
  if (row?.type === "hourly") return "labor";
  if (row?.category === "maintenance") return "maintenance";
  if (row?.category === "service_agreements") return "service_agreement";
  if (row?.category === "discounts") return "discount";
  return "flat_rate";
}

export function categoryOptionsFor(typeKey) {
  if (typeKey === "part") return PART_CATEGORY_OPTIONS;
  if (typeKey === "labor") return LABOR_CATEGORY_OPTIONS;
  if (typeKey === "flat_rate") return FLAT_CATEGORY_OPTIONS;
  return null; // fixed category
}

// Which fields the dialog shows for a type.
export function fieldsFor(typeKey) {
  const isPart = typeKey === "part";
  return {
    partNumber: isPart,
    stock: isPart,
    price: typeKey !== "discount", // discount rows are $0; the % lives in the description
    cost: typeKey !== "discount",
    category: !!categoryOptionsFor(typeKey),
    priceLabel: typeKey === "labor" ? "Rate / hr" : "Price",
    costLabel: typeKey === "labor" ? "Cost / hr" : "Cost",
  };
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const str = (v) => String(v ?? "").trim();

// Form state (all strings/bools) from a row. `table` is "parts" | "labor_rates".
export function formFromRow(row = {}, table = "parts") {
  const typeKey = itemTypeKey(row, table);
  const isPart = table === "parts";
  return {
    typeKey,
    name: row.name ?? "",
    part_number: isPart ? row.part_number ?? "" : "",
    price: String(num(isPart ? row.default_price : row.type === "hourly" ? row.rate : row.flat_price)),
    cost: String(num(isPart ? row.cost : row.type === "hourly" ? row.cost_rate : row.flat_cost)),
    description: (isPart ? row.description : row.notes) ?? "",
    category: row.category ?? "",
    in_stock: String(isPart ? row.in_stock ?? 0 : 0),
    is_hidden: !!row.is_hidden,
  };
}

export function blankForm(typeKey = "part", category = "") {
  const t = typeByKey(typeKey);
  return {
    typeKey: t.key,
    name: "",
    part_number: "",
    price: "0",
    cost: "0",
    description: "",
    category: t.category ?? category ?? "",
    in_stock: "0",
    is_hidden: false,
  };
}

// Returns an error message, or null when the form can be saved.
export function validateForm(form) {
  if (!str(form.name)) return "Name is required";
  const t = typeByKey(form.typeKey);
  const f = fieldsFor(t.key);
  const okMoney = (v) => /^\d{0,5}(\.\d{0,2})?$/.test(str(v)) && str(v) !== "." && Number(str(v) || 0) <= 99999.99;
  if (f.price && !okMoney(form.price)) return "Enter a price like 125 or 125.50";
  if (f.cost && !okMoney(form.cost)) return "Enter a cost like 40 or 40.25";
  if (f.stock && !/^-?\d{1,4}$/.test(str(form.in_stock || "0"))) return "Stock must be a whole number";
  if (f.category && !str(form.category) && !t.category) return "Pick a category";
  return null;
}

// Full DB row for the form's table (insert values, or the target state on edit).
export function rowFromForm(form) {
  const t = typeByKey(form.typeKey);
  const f = fieldsFor(t.key);
  const category = t.category ?? (str(form.category) || "other");
  if (t.table === "parts") {
    return {
      name: str(form.name),
      part_number: str(form.part_number) || null,
      default_price: num(form.price),
      cost: num(form.cost),
      description: str(form.description) || null,
      category,
      in_stock: parseInt(str(form.in_stock) || "0", 10) || 0,
      is_hidden: !!form.is_hidden,
    };
  }
  const base = { name: str(form.name), type: t.rowType, category, notes: str(form.description) || null, is_hidden: !!form.is_hidden };
  if (t.rowType === "hourly") return { ...base, rate: num(form.price), cost_rate: num(form.cost) };
  return { ...base, flat_price: f.price ? num(form.price) : 0, flat_cost: f.cost ? num(form.cost) : 0 };
}

// Insert payload for a new item. A part with a real price or stock count is
// "managed" from the start (same rule as the old Add Part box).
export function createPayload(form) {
  const row = rowFromForm(form);
  if (typeByKey(form.typeKey).table === "parts" && (row.default_price > 0 || row.in_stock > 0)) {
    row.first_managed_at = new Date().toISOString();
  }
  return row;
}

// Only the columns that changed, for an edit that stays in the same table.
// A rate switching hourly <-> flat moves its price/cost across columns.
export function updatePatch(original, form) {
  const next = rowFromForm(form);
  const patch = {};
  const same = (a, b) => (a ?? null) === (b ?? null) || (typeof b === "number" && num(a) === b);
  for (const [k, v] of Object.entries(next)) {
    if (!same(original?.[k], v)) patch[k] = v;
  }
  if (typeByKey(form.typeKey).table === "parts") {
    if ((patch.default_price > 0) || ("in_stock" in patch)) Object.assign(patch, firstManagedPatch(original));
    if ("in_stock" in patch && patch.in_stock === 0) patch.reorder_flagged = true;
  }
  return patch;
}

// True when a type change moves the item to the other table (part <-> rate).
// That is saved as "add the new item, hide the old one" so past jobs that
// point at the old row keep working.
export function changesTable(table, form) {
  return typeByKey(form.typeKey).table !== table;
}

export function isFormDirty(original, table, form) {
  if (!original) return true;
  return changesTable(table, form) || Object.keys(updatePatch(original, form)).length > 0;
}

// ---- Custom flat rates on a job ----------------------------------------

const norm = (s) => str(s).toLowerCase().replace(/\s+/g, " ");

// Existing custom flat rates with the same name (any visibility).
export function findCustomDuplicates(rates = [], name) {
  const n = norm(name);
  if (!n) return [];
  return rates.filter((r) => r?.type === "flat_rate" && r.category === CUSTOM_FLAT_CATEGORY && norm(r.name) === n);
}

// The catalog row a saved custom flat rate becomes.
export function customFlatRateRow({ name, price, description }) {
  return {
    name: str(name),
    type: "flat_rate",
    category: CUSTOM_FLAT_CATEGORY,
    flat_price: num(price),
    flat_cost: 0,
    notes: str(description) || null,
    is_hidden: false,
  };
}

// Invoice line text for a custom flat rate: the name, plus the typed
// description when there is one.
export function customLineName({ name, description }) {
  const d = str(description);
  return d ? `${str(name)} — ${d}` : str(name);
}

// Catalog rows that may be offered on jobs and quotes.
export const isVisible = (row) => !row?.is_hidden;
