// Parts catalog search + quantity-input helpers for the job Add Part flow
// (JobPartsTab.jsx). Pure functions so they can be unit-tested.

// Lowercase and drop spaces / dashes / dots / underscores / slashes so
// "62 083 04-S", "6208304s" and "62-083-04.s" all compare equal.
export function normalizePartText(value) {
  return String(value ?? "").toLowerCase().replace(/[\s\-._/]+/g, "");
}

// True when every whitespace-separated token of the query appears in the
// part's name or part number (after normalization). The whole query with
// separators removed is also tried, so "62 083" still finds "6208304S".
export function matchesPart(part, query) {
  const q = String(query ?? "").trim();
  if (!q) return true;
  const name = normalizePartText(part?.name);
  const pn = normalizePartText(part?.part_number);
  const whole = normalizePartText(q);
  if (!whole) return true;
  if (name.includes(whole) || pn.includes(whole)) return true;
  const tokens = q.toLowerCase().split(/\s+/).map(normalizePartText).filter(Boolean);
  if (tokens.length < 2) return false;
  return tokens.every(t => name.includes(t) || pn.includes(t));
}

// Lower is better: exact part number, part-number prefix, name prefix,
// name/number contains, then token-only match.
function rankPart(part, whole) {
  const pn = normalizePartText(part?.part_number);
  const name = normalizePartText(part?.name);
  if (pn && pn === whole) return 0;
  if (pn && pn.startsWith(whole)) return 1;
  if (name.startsWith(whole)) return 2;
  if (name.includes(whole) || pn.includes(whole)) return 3;
  return 4;
}

// Filter + rank a parts list. Returns { results (capped at `limit`), total }.
export function searchParts(parts, query, limit = 50) {
  const list = parts ?? [];
  const q = String(query ?? "").trim();
  if (!q) return { results: list.slice(0, limit), total: list.length };
  const whole = normalizePartText(q);
  const matched = list.filter(p => matchesPart(p, q));
  matched.sort((a, b) =>
    rankPart(a, whole) - rankPart(b, whole) ||
    String(a?.name ?? "").localeCompare(String(b?.name ?? ""))
  );
  return { results: matched.slice(0, limit), total: matched.length };
}

// Quantity field: held as a string while typing so it can be cleared.
// Keeps digits only (numeric keypad may still paste other chars), max 4 digits.
export function sanitizeQuantityInput(raw) {
  return String(raw ?? "").replace(/\D/g, "").slice(0, 4);
}

// Final quantity used for add: empty / NaN / < 1 -> 1.
export function parseQuantity(draft) {
  const n = parseInt(String(draft ?? "").trim(), 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}
