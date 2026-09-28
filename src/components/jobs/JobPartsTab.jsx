import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Minus, Trash2, Package, ChevronRight, ChevronLeft, Pencil, Check, X, Search } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { usePreferences } from "@/hooks/usePreferences";
import { firstManagedPatch, suggestedSalePrice } from "@/lib/utils/partsManaged";
import { matchesPart, searchParts, sanitizeQuantityInput, parseQuantity } from "@/lib/utils/partsSearch";
import { toast } from "sonner";

const PART_CATEGORIES = [
  { key: "air_filters", label: "Air Filters", icon: "🌬️" },
  { key: "oil_filters", label: "Oil Filters", icon: "🛢️" },
  { key: "oils_fluids", label: "Oil", icon: "💧" },
  { key: "spark_plugs", label: "Spark Plugs", icon: "⚡" },
  { key: "batteries", label: "Batteries", icon: "🔋" },
  { key: "belt", label: "Belts", icon: "🔄" },
  { key: "gasket", label: "Gaskets", icon: "🔩" },
  { key: "electrical", label: "Electrical", icon: "⚡" },
  { key: "coolant", label: "Coolant", icon: "🧊" },
  { key: "hardware", label: "Hardware", icon: "🔧" },
  { key: "other", label: "Other", icon: "📦" },
];

const LEGACY_CATEGORY_MAP = {
  air_filter: "air_filters",
  oil_filter: "oil_filters",
  oil: "oils_fluids",
  spark_plug: "spark_plugs",
  battery: "batteries",
};
const normalizeCatalogPart = (p) =>
  LEGACY_CATEGORY_MAP[p.category] ? { ...p, category: LEGACY_CATEGORY_MAP[p.category] } : p;

const KNOWN_CATEGORY_KEYS = PART_CATEGORIES.filter(c => c.key !== "other").map(c => c.key);
const partsInCategory = (catalogParts, key) =>
  key === "other"
    ? catalogParts.filter(p => !KNOWN_CATEGORY_KEYS.includes(p.category))
    : catalogParts.filter(p => p.category === key);

// Max catalog search rows rendered at once (keeps typing snappy on phones).
const SEARCH_RESULT_LIMIT = 50;
const PAGE_SEARCH_RESULT_LIMIT = 15;

// quantity is held as a string so the field can be cleared while typing;
// it is parsed once (parseQuantity) in handleAdd.
const emptyForm = () => ({
  name: "",
  part_number: "",
  description: "",
  cost: 0,
  price: 0,
  catalogPrice: null,
  catalogCost: null,
  quantity: "1",
  charge_for_part: true,
  save_to_catalog: true,
  category: "other",
});

// Numeric qty field: select-on-focus, clearable while typing, snaps back to
// >= 1 on blur. Big -/+ buttons for one-handed use.
function QuantityField({ value, onChange, id }) {
  const current = parseQuantity(value);
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button" variant="outline" aria-label="Decrease quantity"
        className="h-12 w-12 shrink-0 rounded-xl p-0"
        disabled={current <= 1}
        onClick={() => onChange(String(Math.max(1, current - 1)))}
      >
        <Minus className="w-5 h-5" />
      </Button>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        enterKeyHint="done"
        autoComplete="off"
        aria-label="Quantity"
        value={value}
        onFocus={e => e.target.select()}
        onChange={e => onChange(sanitizeQuantityInput(e.target.value))}
        onBlur={() => onChange(String(parseQuantity(value)))}
        className="h-12 rounded-xl text-center text-base font-semibold"
      />
      <Button
        type="button" variant="outline" aria-label="Increase quantity"
        className="h-12 w-12 shrink-0 rounded-xl p-0"
        onClick={() => onChange(String(Math.min(9999, current + 1)))}
      >
        <Plus className="w-5 h-5" />
      </Button>
    </div>
  );
}

export default function JobPartsTab({ jobId, parts, catalogParts: rawCatalogParts, memberDiscountRate = 1.0, searchFilter = "" }) {
  const catalogParts = useMemo(() => (rawCatalogParts ?? []).map(normalizeCatalogPart), [rawCatalogParts]);
  const isMember = memberDiscountRate < 1.0;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [partsFolder, setPartsFolder] = useState(null);
  const { confirmDelete } = usePreferences();
  const [editingPriceId, setEditingPriceId] = useState(null);
  const [editingPriceValue, setEditingPriceValue] = useState("");
  const [overriddenPriceIds, setOverriddenPriceIds] = useState(new Set());
  const [updateCatalogPrice, setUpdateCatalogPrice] = useState(false);
  const [saleTouchedInConfirm, setSaleTouchedInConfirm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [partSearch, setPartSearch] = useState("");
  const partSearchRef = useRef(null);

  const createMutation = useMutation({
    mutationFn: (data) => db.JobPart.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-parts", jobId] });
      setOpen(false);
      setPartsFolder(null);
      setUpdateCatalogPrice(false);
      setSaleTouchedInConfirm(false);
      setPartSearch("");
      setForm(emptyForm());
      toast.success("Part added");
    },
    onError: (err) => toast.error("Failed to add part: " + err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.JobPart.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-parts", jobId] });
      toast.success("Part removed");
    },
  });

  const updatePriceMutation = useMutation({
    mutationFn: ({ id, price, quantity }) =>
      db.JobPart.update(id, { price, total_price: price * quantity }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["job-parts", jobId] });
      setOverriddenPriceIds(prev => new Set(prev).add(id));
      setEditingPriceId(null);
      toast.success("Price updated");
    },
    onError: () => toast.error("Failed to update price"),
  });

  const startEditingPrice = (part) => {
    setEditingPriceId(part.id);
    setEditingPriceValue(String(part.price ?? 0));
  };

  const commitPriceEdit = (part) => {
    const newPrice = parseFloat(editingPriceValue);
    if (isNaN(newPrice) || newPrice < 0) { toast.error("Enter a valid price"); return; }
    updatePriceMutation.mutate({ id: part.id, price: newPrice, quantity: part.quantity });
  };

  const cancelPriceEdit = () => {
    setEditingPriceId(null);
    setEditingPriceValue("");
  };

  const saveCatalogMutation = useMutation({
    mutationFn: (data) => db.Part.create(data),
  });

  const handleAdd = async () => {
    if (!form.name.trim()) { toast.error("Part name required"); return; }
    if (form.charge_for_part && (!form.price || form.price <= 0)) {
      toast.error("Enter a price or turn off 'Charge for part'"); return;
    }

    // Parse the qty draft exactly once — the job_parts row, inventory
    // decrement and usage log all use this same value.
    const qty = parseQuantity(form.quantity);
    const basePrice = form.charge_for_part ? form.price : 0;
    const effectivePrice = isMember && form.charge_for_part
      ? Math.round(basePrice * memberDiscountRate * 100) / 100
      : basePrice;

    // Save to catalog first if toggled on
    let savedPartId = null;
    if (form.save_to_catalog && form.name.trim()) {
      try {
        const newPart = await saveCatalogMutation.mutateAsync({
          name: form.name.trim(),
          part_number: form.part_number.trim() || null,
          description: form.description.trim() || null,
          cost: form.cost || 0,
          default_price: form.price || 0,
          category: form.category,
          in_stock: 0,
          ...(form.price > 0 ? { first_managed_at: new Date().toISOString() } : {}),
        });
        savedPartId = newPart?.id || null;
        queryClient.invalidateQueries({ queryKey: ["parts-catalog"] });
      } catch {
        // silently fail — still add to job even if catalog save fails
      }
    }

    createMutation.mutate({
      job_id: jobId,
      name: form.name.trim(),
      part_number: form.part_number.trim() || null,
      description: form.description.trim() || null,
      cost: form.cost || 0,
      price: effectivePrice,
      quantity: qty,
      part_id: savedPartId || form.part_id,
      charge_for_part: form.charge_for_part,
      total_cost: (form.cost || 0) * qty,
      total_price: effectivePrice * qty,
    });

    // Auto-deduct from inventory if added from catalog
    if (form.part_id) {
      const catalogPart = catalogParts.find(p => p.id === form.part_id);
      if (catalogPart) {
        const currentStock = catalogPart.in_stock ?? 0;
        const newStock = Math.max(0, currentStock - qty);
        db.Part.update(form.part_id, {
          in_stock: newStock,
          reorder_flagged: newStock === 0 ? true : (catalogPart.reorder_flagged || false),
        });
        queryClient.invalidateQueries({ queryKey: ["parts-catalog"] });
      }
    }

    // Tech explicitly opted to carry a manually-typed cost/price forward to future jobs
    if (updateCatalogPrice && form.part_id && (form.price !== form.catalogPrice || form.cost !== form.catalogCost)) {
      const catalogPartForPrice = catalogParts.find(p => p.id === form.part_id) || {};
      const catalogPatch = {};
      if (form.price !== form.catalogPrice) catalogPatch.default_price = form.price;
      if (form.cost !== form.catalogCost) catalogPatch.cost = form.cost;
      db.Part.update(form.part_id, {
        ...catalogPatch,
        ...(catalogPatch.default_price !== undefined ? firstManagedPatch(catalogPartForPrice) : {}),
      }).then(() => queryClient.invalidateQueries({ queryKey: ["parts-catalog"] }));
    }

    // Usage log for the weekly "what got used" report — one row per part
    // added to a job, whether or not it's charged. Nothing to log against a
    // fully custom part that was never saved to (or sourced from) the catalog.
    const usageLogPartId = savedPartId || form.part_id;
    if (usageLogPartId) {
      db.PartsUsageLog.create({
        part_id: usageLogPartId,
        job_id: jobId,
        quantity: qty,
      }).catch(() => {
        // non-critical — never block adding the part to the job over a logging failure
      });
    }
  };

  // Single entry point for picking a catalog part — used by the category
  // list, the in-dialog search results and the page-level search results, so
  // Charge-for-Part defaults, x1.35 auto-markup and the no-duplicate-row fix
  // apply identically everywhere.
  const selectCatalogPart = (p) => {
    // save_to_catalog defaults true (for the Custom Part flow) — a
    // part picked FROM the catalog is already in the catalog, so
    // this must be off or handleAdd() creates a duplicate part row
    // and points the job at the duplicate instead of the real one.
    setForm(f => ({ ...f, name: p.name, part_number: p.part_number || "", cost: p.cost, price: p.default_price || 0, catalogPrice: p.default_price || 0, catalogCost: p.cost || 0, part_id: p.id, charge_for_part: (p.default_price || 0) > 0, save_to_catalog: false, quantity: "1" }));
    setUpdateCatalogPrice(false);
    setSaleTouchedInConfirm(false);
    setPartsFolder({ key: "confirm", label: "confirm", part: p });
  };

  const resetDialog = () => {
    setPartsFolder(null);
    setUpdateCatalogPrice(false);
    setSaleTouchedInConfirm(false);
    setPartSearch("");
    setForm(emptyForm());
  };

  // Page-level search (JobDetail "Search parts..." box): catalog matches shown
  // under the job's added parts; tapping one opens the dialog at Confirm.
  const pageQuery = searchFilter.trim();
  const pageCatalogSearch = useMemo(
    () => (pageQuery ? searchParts(catalogParts, pageQuery, PAGE_SEARCH_RESULT_LIMIT) : { results: [], total: 0 }),
    [catalogParts, pageQuery]
  );
  const filteredParts = pageQuery ? parts.filter(p => matchesPart(p, pageQuery)) : parts;

  // In-dialog search: whole catalog at the top level, current category
  // when drilled into one.
  const inCategory = !!partsFolder && partsFolder.key !== "custom" && partsFolder.key !== "confirm";
  const dialogQuery = partSearch.trim();
  const dialogSearch = useMemo(() => {
    if (!dialogQuery) return { results: [], total: 0 };
    const pool = inCategory ? partsInCategory(catalogParts, partsFolder.key) : catalogParts;
    return searchParts(pool, dialogQuery, SEARCH_RESULT_LIMIT);
  }, [catalogParts, dialogQuery, inCategory, partsFolder]);

  const renderPartRow = (p, { openDialog = false } = {}) => {
    const price = p.default_price || 0;
    const stock = p.in_stock ?? 0;
    return (
      <button
        key={p.id}
        type="button"
        onClick={() => { selectCatalogPart(p); if (openDialog) setOpen(true); }}
        className="w-full text-left min-h-[48px]"
      >
        <Card className="p-3 min-h-[56px] hover:border-primary/30 hover:bg-primary/5 transition-colors active:bg-primary/10">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-snug break-words">{p.name}</p>
              {p.part_number && <p className="text-xs text-muted-foreground font-mono truncate">#{p.part_number}</p>}
            </div>
            <div className="text-right shrink-0">
              {price > 0 ? (
                isMember ? (
                  <div>
                    <p className="text-sm font-bold text-emerald-600">{formatCurrency(Math.round(price * memberDiscountRate * 100) / 100)}</p>
                    <p className="text-[10px] text-muted-foreground line-through">{formatCurrency(price)}</p>
                  </div>
                ) : (
                  <p className="text-sm font-bold text-primary">{formatCurrency(price)}</p>
                )
              ) : (
                <p className="text-xs text-muted-foreground">No price</p>
              )}
              <p className={`text-xs ${stock > 0 ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"}`}>{stock} in stock</p>
            </div>
          </div>
        </Card>
      </button>
    );
  };

  const renderResultCount = ({ results, total }) =>
    total > results.length ? (
      <p className="text-xs text-muted-foreground text-center py-2">Showing {results.length} of {total} — keep typing to narrow</p>
    ) : null;

  const totalCost = parts.reduce((s, p) => s + (p.total_cost || 0), 0);
  const totalPrice = parts.reduce((s, p) => s + (p.total_price || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Cost: {formatCurrency(totalCost)} → Charge: {formatCurrency(totalPrice)}</p>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetDialog(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-xl gap-1 text-xs h-8">
              <Plus className="w-3 h-3" /> Add Part
            </Button>
          </DialogTrigger>
          {/* Pinned near the top on phones (not vertically centred) so the
              dialog doesn't jump as the result list grows/shrinks or the
              on-screen keyboard opens. */}
          <DialogContent
            className="max-w-sm top-3 translate-y-0 sm:top-[50%] sm:translate-y-[-50%] max-h-[calc(100dvh-1.5rem)] flex flex-col overflow-hidden"
            onOpenAutoFocus={(e) => {
              // Don't pop the keyboard over the category list on touch
              // devices; on desktop, focus the search box straight away.
              e.preventDefault();
              if (!partsFolder && window.matchMedia?.("(pointer: fine)").matches) partSearchRef.current?.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {inCategory ? (
                  <button onClick={() => setPartsFolder(null)} className="flex items-center gap-2 text-base font-bold min-h-[44px] -my-2">
                    <ChevronLeft className="w-4 h-4" /> {partsFolder.label}
                  </button>
                ) : partsFolder?.key === "confirm" ? (
                  <button onClick={() => setPartsFolder(null)} className="flex items-center gap-2 text-base font-bold min-h-[44px] -my-2">
                    <ChevronLeft className="w-4 h-4" /> Confirm Part
                  </button>
                ) : partsFolder?.key === "custom" ? (
                  <button onClick={() => setPartsFolder(null)} className="flex items-center gap-2 text-base font-bold min-h-[44px] -my-2">
                    <ChevronLeft className="w-4 h-4" /> Custom Part
                  </button>
                ) : "Add Part"}
              </DialogTitle>
            </DialogHeader>

            {/* Search box — top level searches the whole catalog, inside a
                category it searches that category. Stays put above the
                scrolling list. */}
            {(!partsFolder || inCategory) && (
              <div className="relative shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  ref={partSearchRef}
                  type="search"
                  inputMode="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={partSearch}
                  onChange={e => setPartSearch(e.target.value)}
                  placeholder={inCategory ? `Search ${partsFolder.label}...` : "Search all parts — name or part #"}
                  aria-label={inCategory ? `Search ${partsFolder.label}` : "Search all parts"}
                  className="h-12 pl-9 pr-11 rounded-xl text-base [&::-webkit-search-cancel-button]:hidden"
                />
                {partSearch && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => { setPartSearch(""); partSearchRef.current?.focus(); }}
                    className="absolute right-0 top-0 h-12 w-12 flex items-center justify-center text-muted-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {/* Search results (top level = whole catalog, in category = that category) */}
            {(!partsFolder || inCategory) && dialogQuery && (
              <div className="space-y-2 flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-1 px-1" data-testid="part-search-results">
                {inCategory && (
                  <button
                    type="button"
                    onClick={() => { setPartsFolder(null); partSearchRef.current?.focus(); }}
                    className="w-full min-h-[48px] flex items-center justify-between gap-2 px-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 text-primary text-sm font-semibold"
                  >
                    <span className="flex items-center gap-2 min-w-0"><Search className="w-4 h-4 shrink-0" /><span className="truncate">Search all parts for “{dialogQuery}”</span></span>
                    <ChevronRight className="w-4 h-4 shrink-0" />
                  </button>
                )}
                {dialogSearch.total === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No parts match “{dialogQuery}”{inCategory ? ` in ${partsFolder.label}` : ""}
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground px-1">
                      {dialogSearch.total} match{dialogSearch.total !== 1 ? "es" : ""}{inCategory ? ` in ${partsFolder.label}` : " in all parts"}
                    </p>
                    {dialogSearch.results.map(p => renderPartRow(p))}
                    {renderResultCount(dialogSearch)}
                  </>
                )}
                {!inCategory && (
                  <button onClick={() => setPartsFolder({ key: "custom", label: "Custom Part" })} className="w-full text-left min-h-[48px]">
                    <Card className="p-3 border-dashed hover:border-primary/30 hover:bg-primary/5 transition-colors">
                      <p className="text-sm font-semibold">✏️ Not listed? Add a custom part</p>
                    </Card>
                  </button>
                )}
              </div>
            )}

            {/* Category folder view */}
            {!partsFolder && !dialogQuery && (
              <div className="space-y-2 flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-1 px-1">
                {PART_CATEGORIES.map(cat => {
                  const catParts = partsInCategory(catalogParts, cat.key);
                  if (catParts.length === 0) return null;
                  return (
                    <button key={cat.key} onClick={() => setPartsFolder(cat)} className="w-full text-left min-h-[48px]">
                      <Card className="p-3 hover:border-primary/30 hover:bg-primary/5 transition-all active:scale-[0.99]">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <span className="text-lg">{cat.icon}</span>
                            <div>
                              <p className="text-sm font-semibold">{cat.label}</p>
                              <p className="text-xs text-muted-foreground">{catParts.length} part{catParts.length !== 1 ? "s" : ""}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </Card>
                    </button>
                  );
                })}
                <button onClick={() => setPartsFolder({ key: "custom", label: "Custom Part" })} className="w-full text-left min-h-[48px]">
                  <Card className="p-3 hover:border-primary/30 hover:bg-primary/5 transition-all border-dashed">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-lg">✏️</span>
                        <div>
                          <p className="text-sm font-semibold">Custom Part</p>
                          <p className="text-xs text-muted-foreground">Enter manually</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </Card>
                </button>
              </div>
            )}

            {/* Parts list within selected category (no search typed) */}
            {inCategory && !dialogQuery && (
              <div className="space-y-2 flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-1 px-1">
                {(() => {
                  const catParts = partsInCategory(catalogParts, partsFolder.key);
                  return catParts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No {partsFolder.label} in catalog</p>
                  ) : catParts.map(p => renderPartRow(p));
                })()}
              </div>
            )}

            {/* Custom part entry form */}
            {partsFolder?.key === "custom" && (
              <div className="space-y-3 flex-1 min-h-0 overflow-y-auto overscroll-contain pr-0.5">
                <div>
                  <Label className="text-xs font-semibold">Part Name *</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="mt-1 rounded-xl" placeholder="e.g. Oil Filter 90mm Extended" autoFocus />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Part Number</Label>
                  <Input value={form.part_number} onChange={e => setForm(f => ({...f, part_number: e.target.value}))} className="mt-1 rounded-xl font-mono text-sm" placeholder="e.g. 070185ES" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Description</Label>
                  <Input value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} className="mt-1 rounded-xl" placeholder="e.g. Fits Nexus 17-22kW standby units" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs font-semibold">Your Cost</Label>
                    <Input type="number" step="0.01" min="0" value={form.cost || ""} onChange={e => setForm(f => ({...f, cost: parseFloat(e.target.value) || 0}))} className="mt-1 rounded-xl" placeholder="0.00" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Sell Price</Label>
                    <Input type="number" step="0.01" min="0" value={form.price || ""} onChange={e => setForm(f => ({...f, price: parseFloat(e.target.value) || 0}))} className="mt-1 rounded-xl" placeholder="0.00" disabled={!form.charge_for_part} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="custom-part-qty" className="text-xs font-semibold">Qty</Label>
                  <div className="mt-1">
                    <QuantityField id="custom-part-qty" value={form.quantity} onChange={q => setForm(f => ({ ...f, quantity: q }))} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-semibold">Category</Label>
                  <div className="grid grid-cols-3 gap-1.5 mt-1">
                    {PART_CATEGORIES.map(cat => (
                      <button key={cat.key} type="button" onClick={() => setForm(f => ({...f, category: cat.key}))}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-medium transition-colors ${form.category === cat.key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/40"}`}>
                        <span>{cat.icon}</span>
                        <span className="truncate">{cat.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <button type="button" onClick={() => setForm(f => ({...f, charge_for_part: !f.charge_for_part}))}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors ${form.charge_for_part ? "border-green-500 bg-green-50 text-green-700 dark:border-green-600 dark:bg-green-900/30 dark:text-green-300" : "border-border bg-muted/30 text-muted-foreground"}`}>
                  <span className="text-sm font-medium">Charge customer for this part</span>
                  <div className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${form.charge_for_part ? "bg-green-500" : "bg-muted-foreground/30"}`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${form.charge_for_part ? "translate-x-5" : "translate-x-0"}`} />
                  </div>
                </button>
                {isMember && form.charge_for_part && form.price > 0 && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg px-3 py-2">
                    🛡️ Member price: ${(Math.round(form.price * memberDiscountRate * 100) / 100).toFixed(2)} ({Math.round((1-memberDiscountRate)*100)}% off ${form.price.toFixed(2)})
                  </p>
                )}
                <button type="button" onClick={() => setForm(f => ({...f, save_to_catalog: !f.save_to_catalog}))}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors ${form.save_to_catalog ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-900/30 dark:text-blue-300" : "border-border bg-muted/30 text-muted-foreground"}`}>
                  <div className="text-left">
                    <p className="text-sm font-medium">Save to parts catalog</p>
                    <p className="text-xs opacity-75">Available for future jobs</p>
                  </div>
                  <div className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 shrink-0 ml-2 ${form.save_to_catalog ? "bg-blue-500" : "bg-muted-foreground/30"}`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${form.save_to_catalog ? "translate-x-5" : "translate-x-0"}`} />
                  </div>
                </button>
                {form.charge_for_part && form.price > 0 && (
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/30 rounded-xl">
                    <p className="text-xs text-muted-foreground">
                      {parseQuantity(form.quantity)} × ${isMember ? (Math.round(form.price * memberDiscountRate * 100) / 100).toFixed(2) : form.price.toFixed(2)}
                    </p>
                    <p className="text-sm font-bold">
                      Total: ${(parseQuantity(form.quantity) * (isMember ? Math.round(form.price * memberDiscountRate * 100) / 100 : form.price)).toFixed(2)}
                    </p>
                  </div>
                )}
                <Button onClick={handleAdd} className="w-full rounded-xl h-11 gap-2" disabled={createMutation.isPending || saveCatalogMutation.isPending}>
                  {createMutation.isPending ? "Adding..." : "Add Part to Job"}
                </Button>
              </div>
            )}

            {/* Confirm screen after selecting a catalog part */}
            {partsFolder?.key === "confirm" && (
              <div className="space-y-3 flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-1 px-1">
                <Card className="p-3 bg-muted/30">
                  <p className="text-sm font-semibold">{form.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {form.part_number ? <span className="font-mono">#{form.part_number} · </span> : null}
                    {catalogParts.find(p => p.id === form.part_id)?.in_stock ?? 0} in stock · Selected from catalog
                  </p>
                </Card>
                <div>
                  <Label htmlFor="confirm-part-qty" className="text-xs">Qty</Label>
                  <div className="mt-1">
                    <QuantityField id="confirm-part-qty" value={form.quantity} onChange={q => setForm(f => ({ ...f, quantity: q }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Cost</Label>
                    <Input
                      type="number" step="0.01" value={form.cost} onFocus={e => e.target.select()}
                      onChange={e => {
                        const newCost = parseFloat(e.target.value) || 0;
                        const catalogPart = catalogParts.find(p => p.id === form.part_id);
                        const eligible = !!form.part_id && !catalogPart?.first_managed_at && !((form.catalogPrice || 0) > 0);
                        setForm(f => ({
                          ...f,
                          cost: newCost,
                          ...(eligible && !saleTouchedInConfirm ? { price: suggestedSalePrice(newCost) } : {}),
                        }));
                      }}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Price</Label>
                    <Input
                      type="number" step="0.01" value={form.price} onFocus={e => e.target.select()}
                      onChange={e => { setSaleTouchedInConfirm(true); setForm(f => ({...f, price: parseFloat(e.target.value) || 0})); }}
                      className="mt-1"
                    />
                  </div>
                </div>
                {!!form.part_id && !catalogParts.find(p => p.id === form.part_id)?.first_managed_at && !((form.catalogPrice || 0) > 0) && !saleTouchedInConfirm && form.cost > 0 && (
                  <p className="text-[10px] text-blue-600 dark:text-blue-400 -mt-1">Price auto-suggested at cost ×1.35 — edit freely before adding</p>
                )}
                <button
                  type="button"
                  disabled={!(form.price > 0)}
                  title={!(form.price > 0) ? "No price set — enter a price above to enable charging" : undefined}
                  onClick={() => setForm(f => ({...f, charge_for_part: !f.charge_for_part}))}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors ${
                    !(form.price > 0)
                      ? "border-border bg-muted/20 text-muted-foreground/50 cursor-not-allowed"
                      : form.charge_for_part
                        ? "border-green-500 bg-green-50 text-green-700 dark:border-green-600 dark:bg-green-900/30 dark:text-green-300"
                        : "border-border bg-muted/30 text-muted-foreground"
                  }`}>
                  <span className="text-sm font-medium">{!(form.price > 0) ? "No price set" : "Charge for part"}</span>
                  <div className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${form.charge_for_part && form.price > 0 ? "bg-green-500" : "bg-muted-foreground/30"}`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${form.charge_for_part && form.price > 0 ? "translate-x-5" : "translate-x-0"}`} />
                  </div>
                </button>
                {isMember && form.charge_for_part && form.price > 0 && (
                 <p className="text-xs text-emerald-600 font-medium">🛡️ Member price: {formatCurrency(Math.round(form.price * memberDiscountRate * 100) / 100)} ({Math.round((1-memberDiscountRate)*100)}% off)</p>
                )}
                {form.part_id && ((form.price > 0 && form.price !== form.catalogPrice) || form.cost !== form.catalogCost) && (
                  <button type="button" onClick={() => setUpdateCatalogPrice(v => !v)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors ${updateCatalogPrice ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-900/30 dark:text-blue-300" : "border-border bg-muted/30 text-muted-foreground"}`}>
                    <div className="text-left">
                      <p className="text-xs font-medium">
                        Update catalog {form.cost !== form.catalogCost && form.price !== form.catalogPrice ? "cost & price" : form.cost !== form.catalogCost ? "cost" : "price"} for future jobs
                      </p>
                      <p className="text-[10px] opacity-75">
                        Catalog currently shows {formatCurrency(form.catalogCost)} cost / {formatCurrency(form.catalogPrice)} price
                      </p>
                    </div>
                    <div className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 shrink-0 ml-2 ${updateCatalogPrice ? "bg-blue-500" : "bg-muted-foreground/30"}`}>
                      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${updateCatalogPrice ? "translate-x-5" : "translate-x-0"}`} />
                    </div>
                  </button>
                )}
                {form.charge_for_part && form.price > 0 && (
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/30 rounded-xl" data-testid="confirm-total">
                    <p className="text-xs text-muted-foreground">
                      {parseQuantity(form.quantity)} × {formatCurrency(isMember ? Math.round(form.price * memberDiscountRate * 100) / 100 : form.price)}
                    </p>
                    <p className="text-sm font-bold">
                      Total: {formatCurrency(parseQuantity(form.quantity) * (isMember ? Math.round(form.price * memberDiscountRate * 100) / 100 : form.price))}
                    </p>
                  </div>
                )}
                <Button onClick={handleAdd} className="w-full rounded-xl h-12 text-base" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Adding..." : `Add ${parseQuantity(form.quantity)} to Job`}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {parts.length === 0 && !pageQuery ? (
        <Card className="p-6 text-center">
          <Package className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No parts added yet</p>
        </Card>
      ) : filteredParts.length === 0 ? null : (
        <div className="space-y-2">
          {pageQuery && (
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">On this job</p>
          )}
          {filteredParts.map(part => (
            <Card key={part.id} className="p-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{part.name}</p>
                    {part.charge_for_part ? (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200">Charged</span>
                    ) : (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">No Charge</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {part.quantity}x{part.part_number ? ` · #${part.part_number}` : ""} · cost {formatCurrency(part.cost)}
                  </p>
                  {part.description && (
                    <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{part.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {editingPriceId === part.id ? (
                    <>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editingPriceValue}
                        onChange={e => setEditingPriceValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") commitPriceEdit(part);
                          if (e.key === "Escape") cancelPriceEdit();
                        }}
                        className="w-20 h-7 text-sm text-right px-2 rounded-lg"
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-green-600 hover:bg-green-50"
                        onClick={() => commitPriceEdit(part)}
                        disabled={updatePriceMutation.isPending}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground"
                        onClick={cancelPriceEdit}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="text-right">
                        <span className="text-sm font-semibold">{formatCurrency(part.total_price)}</span>
                        {overriddenPriceIds.has(part.id) && (
                          <p className="text-[10px] text-muted-foreground leading-none mt-0.5">edited</p>
                        )}
                      </div>
                      {part.charge_for_part !== false && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => startEditingPrice(part)}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { if (!confirmDelete || window.confirm(`Remove "${part.name}" from this job?`)) { deleteMutation.mutate(part.id); } }}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Catalog matches for the page-level search box — tap to add */}
      {pageQuery && (
        <div className="space-y-2" data-testid="page-catalog-results">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Add from catalog{pageCatalogSearch.total > 0 ? ` (${pageCatalogSearch.total})` : ""}
          </p>
          {pageCatalogSearch.total === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">No catalog parts match “{pageQuery}”</p>
          ) : (
            <>
              {pageCatalogSearch.results.map(p => renderPartRow(p, { openDialog: true }))}
              {renderResultCount(pageCatalogSearch)}
            </>
          )}
        </div>
      )}
    </div>
  );
}