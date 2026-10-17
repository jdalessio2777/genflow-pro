// The ONE save path for permanent catalog price changes. Used by the
// Catalog price editors and by the job screen's "Update catalog price for
// future jobs" toggle, so both write the same fields the same way.
//
// Only the catalog row changes. Job parts, job labor and quote lines store
// their own copy of the price when they're added, so existing jobs, quotes
// and invoices keep their prices; the new price applies to items added
// from now on.
import { db } from "@/lib/db";
import { buildPricePatch, describePriceChange } from "@/lib/utils/catalogPrice";

export async function saveCatalogPrice(kind, item, values) {
  const patch = buildPricePatch(kind, item, values);
  if (Object.keys(patch).length === 0) return { row: item, patch, message: "" };
  const api = kind === "part" ? db.Part : db.LaborRate;
  const row = await api.update(item.id, patch);
  return { row, patch, message: describePriceChange(kind, item, patch) };
}

// Put the saved values straight into every cached copy of the catalog so the
// new price shows immediately everywhere (Catalog lists, Catalog search, the
// job screen's part picker, Quote Builder), then refetch in the background.
export function applySavedPrice(queryClient, kind, id, patch) {
  const merge = (old) => (Array.isArray(old) ? old.map((x) => (x.id === id ? { ...x, ...patch } : x)) : old);
  if (kind === "part") {
    queryClient.setQueryData(["parts-catalog"], merge);
    queryClient.setQueriesData({ queryKey: ["catalog-parts-search"] }, merge);
    queryClient.invalidateQueries({ queryKey: ["parts-catalog"] });
    queryClient.invalidateQueries({ queryKey: ["catalog-parts-search"] });
  } else {
    queryClient.setQueryData(["labor-rates"], merge);
    queryClient.invalidateQueries({ queryKey: ["labor-rates"] });
  }
}
