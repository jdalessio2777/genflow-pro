// One rule for how a stock count reads (Decision 3). Plain ESM — also used
// by api/generate-parts-usage-report.js.
// Stock may go below 0 (a part was used that the count didn't have): that
// means the shelf count is wrong and needs a RECOUNT — it is not "low".
export const LOW_STOCK_MAX = 2;

export function stockStatus(inStock) {
  if (inStock === null || inStock === undefined) return "unknown";
  const n = Number(inStock);
  if (n < 0) return "recount";
  if (n === 0) return "out";
  if (n <= LOW_STOCK_MAX) return "low";
  return "ok";
}

export const STOCK_LABEL = {
  recount: "Recount",
  out: "OUT of stock",
  low: "LOW stock",
  ok: "In stock",
  unknown: "In stock",
};

const plural = (n, word) => `${n} part${n === 1 ? "" : "s"} ${word}`;

// Dashboard alert headline: a recount outranks out-of-stock, which outranks
// low — a negative count is a counting problem, not a normal low level.
export function stockAlertText(parts) {
  const by = (s) => parts.filter(p => stockStatus(p.in_stock) === s).length;
  const recount = by("recount");
  const out = by("out");
  const bits = [];
  if (recount) bits.push(plural(recount, recount === 1 ? "needs a recount" : "need a recount"));
  if (out) bits.push(plural(out, "out of stock"));
  if (!bits.length) return plural(parts.length, "running low");
  return bits.join(" · ");
}
