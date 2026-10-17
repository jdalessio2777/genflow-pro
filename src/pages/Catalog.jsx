import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { stockStatus } from "@/lib/utils/stockStatus";
import { supabase } from "@/lib/supabaseClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Package, Clock, Zap, Trash2, Search, ChevronRight, Wrench, Loader2, X, FileText, BadgePercent } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { usePreferences } from "@/hooks/usePreferences";
import { firstManagedPatch, isManaged } from "@/lib/utils/partsManaged";
import { resolveBulkCommit, stockUpdatePatch } from "@/lib/utils/stockDraft";
import StockCountInput from "@/components/catalog/StockCountInput";
import StockEditor from "@/components/catalog/StockEditor";
import PriceEditor from "@/components/catalog/PriceEditor";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import PageHeader from "@/components/layout/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/ui/StatusBadge";
import { toast } from "sonner";

/** Slugs align with Supabase `parts.category` (AJGS / fix_all_categories). */
const PART_CATEGORIES = [
  { key: "air_filters", label: "Air Filters", icon: "🌬️" },
  { key: "oil_filters", label: "Oil Filters", icon: "🛢️" },
  { key: "oils_fluids", label: "Oils & Fluids", icon: "💧" },
  { key: "spark_plugs", label: "Spark Plugs", icon: "⚡" },
  { key: "batteries", label: "Batteries", icon: "🔋" },
  { key: "battery_chargers", label: "Battery Chargers", icon: "🔌" },
  { key: "belt", label: "Belts", icon: "🔄" },
  { key: "gasket", label: "Gaskets", icon: "🔩" },
  { key: "electrical", label: "Electrical", icon: "⚡" },
  { key: "coolant", label: "Coolant", icon: "🧊" },
  { key: "hardware", label: "Hardware", icon: "🔧" },
  { key: "other", label: "Other", icon: "📦" },
];

const FLAT_RATE_FOLDERS = [
  { key: "oil_pressure_switches", label: "Oil Pressure Switches", icon: "🔧" },
  { key: "starters", label: "Starters", icon: "⚡" },
  { key: "controllers", label: "Controllers", icon: "🖥️" },
  { key: "load_shed", label: "Load Shed", icon: "🔌" },
  { key: "smm_boards", label: "SMM Boards", icon: "📟" },
  { key: "fuel_system", label: "Fuel System", icon: "⛽" },
  { key: "brushes", label: "Brushes", icon: "✏️" },
  { key: "stepper_motors", label: "Stepper Motors", icon: "⚙️" },
  { key: "air_boxes", label: "Air Boxes & Mixers", icon: "📦" },
  { key: "transfer_switch", label: "Transfer Switch", icon: "🔀" },
  { key: "gaskets_seals", label: "Gaskets & Seals", icon: "🔩" },
  { key: "voltage_regulators", label: "Voltage Regulators", icon: "📈" },
  { key: "ignition", label: "Ignition", icon: "🔥" },
  { key: "circuit_breakers", label: "Circuit Breakers", icon: "💥" },
  { key: "relays", label: "Relays & Contactors", icon: "🔗" },
  { key: "batteries", label: "Batteries", icon: "🔋" },
  { key: "other", label: "Other", icon: "📦" },
];

/** Main parts grid: primary rows + flat-rate-style categories (deduped by key). */
const CATALOG_PART_BROWSE_ROWS = (() => {
  const byKey = new Map();
  for (const c of PART_CATEGORIES) {
    if (c.key === "other") continue;
    byKey.set(c.key, c);
  }
  for (const f of FLAT_RATE_FOLDERS) {
    if (f.key === "other") continue;
    if (!byKey.has(f.key)) byKey.set(f.key, f);
  }
  return [...byKey.values(), { key: "other", label: "Other", icon: "📦" }];
})();

const ALL_CATALOG_PART_KEYS = CATALOG_PART_BROWSE_ROWS.filter((r) => r.key !== "other").map((r) => r.key);

// Parts written to Supabase before the recategorization commit used the old
// singular slugs. Normalize them to the current plural keys on read so existing
// rows appear in the correct folder without a DB migration.
const LEGACY_CATEGORY_MAP = {
  air_filter: "air_filters",
  oil_filter: "oil_filters",
  oil:        "oils_fluids",
  spark_plug: "spark_plugs",
  battery:    "batteries",
};
const normalizePart = (p) =>
  LEGACY_CATEGORY_MAP[p.category]
    ? { ...p, category: LEGACY_CATEGORY_MAP[p.category] }
    : p;

const TOP_FOLDERS = [
  { key: "parts", label: "Parts", icon: Package, color: "bg-blue-100 text-blue-700", description: "Parts catalog & inventory" },
  { key: "labor_rates", label: "Labor Rates", icon: Clock, color: "bg-amber-100 text-amber-700", description: "Hourly billing rates" },
  { key: "flat_rates", label: "Flat Rates", icon: Zap, color: "bg-purple-100 text-purple-700", description: "Fixed-price service jobs" },
  { key: "maintenance", label: "Maintenance", icon: Wrench, color: "bg-green-100 text-green-700", description: "Maintenance packages" },
  { key: "discounts", label: "Discounts", icon: BadgePercent, color: "bg-orange-100 text-orange-700", description: "Referral, review & loyalty discounts" },
  { key: "documents", label: "Document Templates", icon: FileText, color: "bg-rose-100 text-rose-700", description: "Checklists and inspection forms" },
];

// Keys ("stock:<id>", "price:<id>") of editors holding an unsaved draft.
function useDirtyKeys() {
  const [keys, setKeys] = useState(() => new Set());
  const markDirty = (key, isDirty) => setKeys(prev => {
    if (prev.has(key) === isDirty) return prev;
    const next = new Set(prev);
    if (isDirty) next.add(key); else next.delete(key);
    return next;
  });
  return [keys.size, markDirty];
}

function UnsavedChangesDialog({ guard, count }) {
  return (
    <AlertDialog history={false} open={guard.blocked} onOpenChange={(o) => { if (!o) guard.stay(); }}>
      <AlertDialogContent className="max-w-sm rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>You have unsaved changes</AlertDialogTitle>
          <AlertDialogDescription>
            {count === 1 ? "1 stock or price edit hasn't" : `${count} stock or price edits haven't`} been saved. Leaving will discard {count === 1 ? "it" : "them"}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel className="h-11 rounded-xl" onClick={guard.stay}>Stay</AlertDialogCancel>
          <AlertDialogAction className="h-11 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={guard.leave}>Discard and leave</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── PARTS CATEGORY LIST ──────────────────────────────────────────────────────
function PartsCategoryList({ parts, onSelectCategory }) {
  const queryClient = useQueryClient();
  const knownKeys = ALL_CATALOG_PART_KEYS;
  const reorderParts = parts.filter(p => p.reorder_flagged && isManaged(p));
  return (
    <div className="space-y-2">
      {reorderParts.length > 0 && (
        <Card className="p-3.5 border-orange-200 bg-orange-50">
          <p className="text-xs font-bold text-orange-800 uppercase tracking-wider mb-2">
            🛒 Reorder List ({reorderParts.length} item{reorderParts.length !== 1 ? "s" : ""})
          </p>
          <div className="space-y-2">
            {reorderParts.map(part => (
              <div key={part.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{part.name}</p>
                  {part.part_number && <p className="text-xs text-muted-foreground">#{part.part_number}</p>}
                </div>
                <button
                  onClick={() => {
                    db.Part.update(part.id, { reorder_flagged: false, in_stock: 1, ...firstManagedPatch(part) })
                      .then(() => queryClient.invalidateQueries({ queryKey: ["parts-catalog"] }));
                  }}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-orange-600 text-white shrink-0 active:scale-95"
                >
                  ✓ Reordered
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
      {CATALOG_PART_BROWSE_ROWS.map((cat) => {
        const count = cat.key === "other"
          ? parts.filter(p => !knownKeys.includes(p.category)).length
          : parts.filter(p => p.category === cat.key).length;
        return (
          <button key={cat.key} onClick={() => onSelectCategory(cat)} className="w-full text-left">
            <Card className="p-3.5 hover:border-primary/30 hover:bg-muted/20 transition-all active:scale-[0.99]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{cat.icon}</span>
                  <div>
                    <p className="text-sm font-semibold">{cat.label}</p>
                    <p className="text-xs text-muted-foreground">{count} part{count !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </Card>
          </button>
        );
      })}
    </div>
  );
}

// ─── PARTS ITEM LIST ──────────────────────────────────────────────────────────
function PartsItemList({ category, parts }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", part_number: "", cost: 0, default_price: 0, in_stock: 0 });
  const { confirmDelete } = usePreferences();
  const [bulkEdit, setBulkEdit] = useState(false);
  const [bulkValues, setBulkValues] = useState({});
  // Stock and price editors whose draft differs from the DB value.
  const [unsavedCount, markDirty] = useDirtyKeys();
  const stockGuard = useUnsavedChangesGuard(unsavedCount > 0);

  const knownKeys = ALL_CATALOG_PART_KEYS;
  const items = category.key === "other"
    ? parts.filter(p => !knownKeys.includes(p.category))
    : parts.filter(p => p.category === category.key);

  const createMutation = useMutation({
    mutationFn: (data) => db.Part.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["parts-catalog"] }); setOpen(false); setForm({ name: "", part_number: "", cost: 0, default_price: 0, in_stock: 0 }); toast.success("Part added"); },
  });
  const reorderMutation = useMutation({
    mutationFn: ({ id, data }) => db.Part.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["parts-catalog"] }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => db.Part.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["parts-catalog"] }); toast.success("Part removed"); },
  });

  const enterBulkEdit = () => {
    setBulkValues(Object.fromEntries(items.map(p => [p.id, String(p.in_stock ?? 0)])));
    setBulkEdit(true);
  };

  const commitBulkValue = (part) => {
    // Blank/invalid reverts to the saved count with no write (same rule as
    // the day-to-day field). An explicit 0 still saves 0. A positive count
    // clears the reorder flag (Bulk Count Entry semantics).
    const { display, write: newStock } = resolveBulkCommit(bulkValues[part.id], part.in_stock);
    setBulkValues(v => ({ ...v, [part.id]: display }));
    if (newStock === null) return;
    reorderMutation.mutate({ id: part.id, data: stockUpdatePatch(part, newStock, { clearReorderWhenStocked: true }) });
  };

  // Day-to-day stock Save (StockEditor). Resolves/rejects so the editor can
  // show Saved / error state. Patch keeps parity with the old +/- steppers.
  const saveStock = async (part, newStock) => {
    try {
      const row = await db.Part.update(part.id, stockUpdatePatch(part, newStock));
      queryClient.setQueryData(["parts-catalog"], (old) =>
        Array.isArray(old) ? old.map(p => (p.id === part.id ? normalizePart({ ...p, ...row }) : p)) : old);
      queryClient.invalidateQueries({ queryKey: ["parts-catalog"] });
    } catch (err) {
      console.error("Stock save failed", part.id, err);
      toast.error(`Stock not saved for "${part.name}"`);
      throw err;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        {items.length > 0 ? (
          <Button
            variant={bulkEdit ? "default" : "outline"}
            size="sm"
            className="rounded-xl gap-1.5 text-xs"
            onClick={() => (bulkEdit ? setBulkEdit(false) : stockGuard.confirmThen(enterBulkEdit))}
          >
            {bulkEdit ? "Done" : "Bulk Count Entry"}
          </Button>
        ) : <div />}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-xl gap-1.5"><Plus className="w-4 h-4" /> Add Part</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>New {category.label} Part</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-xs">Name *</Label><Input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="mt-1" /></div>
              <div><Label className="text-xs">Part Number</Label><Input value={form.part_number} onChange={e => setForm(f => ({...f, part_number: e.target.value}))} className="mt-1" /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-xs">Cost</Label><Input type="number" step="0.01" value={form.cost} onFocus={e => e.target.select()} onChange={e => setForm(f => ({...f, cost: parseFloat(e.target.value) || 0}))} className="mt-1" /></div>
                <div><Label className="text-xs">Price</Label><Input type="number" step="0.01" value={form.default_price} onFocus={e => e.target.select()} onChange={e => setForm(f => ({...f, default_price: parseFloat(e.target.value) || 0}))} className="mt-1" /></div>
                <div><Label className="text-xs">In Stock</Label><Input type="number" value={form.in_stock} onFocus={e => e.target.select()} onChange={e => setForm(f => ({...f, in_stock: parseInt(e.target.value) || 0}))} className="mt-1" /></div>
              </div>
              <Button onClick={() => { if (!form.name) { toast.error("Name required"); return; } createMutation.mutate({ ...form, category: category.key, ...((form.default_price > 0 || form.in_stock > 0) ? { first_managed_at: new Date().toISOString() } : {}) }); }} className="w-full rounded-xl" disabled={createMutation.isPending}>Add Part</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {items.length === 0 ? <EmptyState icon={Package} title={`No ${category.label} yet`} description="Tap + to add one" /> : (
        <div className="space-y-2">
          {items.map(part => {
            const st = stockStatus(part.in_stock);
            const isRecount = st === "recount";
            const isOut = st === "out";
            const isLow = st === "low";
            return (
              <Card key={part.id} className={`p-3 ${isRecount ? "border-red-500 border-2" : isOut ? "border-red-200" : isLow ? "border-amber-200" : ""}`}>
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium flex items-center gap-1.5 flex-wrap">{part.name}{isRecount && <span data-testid="recount-badge" className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Recount</span>}</p>
                    {part.part_number && <p className="text-xs text-muted-foreground">#{part.part_number}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {bulkEdit && (
                      <div className="flex flex-col items-center min-w-[64px]">
                        <StockCountInput
                          aria-label={`Count for ${part.name}`}
                          value={bulkValues[part.id] ?? ""}
                          onChange={val => setBulkValues(v => ({ ...v, [part.id]: val }))}
                          onBlur={() => commitBulkValue(part)}
                        />
                        <span className="text-[9px] text-muted-foreground leading-none mt-0.5">{isRecount ? "RECOUNT" : isOut ? "OUT" : isLow ? "LOW" : "count"}</span>
                      </div>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { if (!confirmDelete || window.confirm(`Delete "${part.name}"? This cannot be undone.`)) deleteMutation.mutate(part.id); }}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
                {!bulkEdit && <PriceEditor kind="part" item={part} onDirtyChange={(d) => markDirty(`price:${part.id}`, d)} />}
                {!bulkEdit && <StockEditor part={part} onSave={(n) => saveStock(part, n)} onDirtyChange={(d) => markDirty(`stock:${part.id}`, d)} />}
              </Card>
            );
          })}
        </div>
      )}
      <UnsavedChangesDialog guard={stockGuard} count={unsavedCount} />
    </div>
  );
}

// ─── LABOR RATES LIST ─────────────────────────────────────────────────────────
function LaborRatesList() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", rate: 115, cost_rate: 0, notes: "" });
  const { confirmDelete } = usePreferences();
  const [unsavedCount, markDirty] = useDirtyKeys();
  const priceGuard = useUnsavedChangesGuard(unsavedCount > 0);

  const { data: rates = [] } = useQuery({ queryKey: ["labor-rates"], queryFn: () => db.LaborRate.list("name") });
  const hourly = rates.filter(r => r.type === "hourly");

  const createMutation = useMutation({
    mutationFn: (data) => db.LaborRate.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["labor-rates"] }); setOpen(false); setForm({ name: "", rate: 115, cost_rate: 0, notes: "" }); toast.success("Rate saved"); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => db.LaborRate.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["labor-rates"] }); toast.success("Rate removed"); },
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-xl gap-1.5"><Plus className="w-4 h-4" /> Add Rate</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>New Labor Rate</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-xs">Name *</Label><Input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="mt-1" placeholder="e.g. Standard Hour" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Bill Rate/hr</Label><Input type="number" step="0.01" value={form.rate} onFocus={e => e.target.select()} onChange={e => setForm(f => ({...f, rate: parseFloat(e.target.value) || 0}))} className="mt-1" /></div>
                <div><Label className="text-xs">Cost Rate/hr</Label><Input type="number" step="0.01" value={form.cost_rate} onFocus={e => e.target.select()} onChange={e => setForm(f => ({...f, cost_rate: parseFloat(e.target.value) || 0}))} className="mt-1" /></div>
              </div>
              <div><Label className="text-xs">Notes</Label><Input value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} className="mt-1" /></div>
              <Button onClick={() => { if (!form.name) { toast.error("Name required"); return; } createMutation.mutate({ ...form, type: "hourly" }); }} className="w-full rounded-xl" disabled={createMutation.isPending}>Save Rate</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {hourly.length === 0 ? <EmptyState icon={Clock} title="No labor rates yet" description="Add hourly billing rates" /> : (
        <div className="space-y-2">
          {hourly.map(r => (
            <Card key={r.id} className="p-3">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium">{r.name}</p>{r.notes && <p className="text-xs text-muted-foreground italic">{r.notes}</p>}</div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{formatCurrency(r.rate)}/hr</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { if (!confirmDelete || window.confirm(`Delete "${r.name}"? This cannot be undone.`)) deleteMutation.mutate(r.id); }}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
              <PriceEditor kind="hourly" item={r} onDirtyChange={(d) => markDirty(`price:${r.id}`, d)} />
            </Card>
          ))}
        </div>
      )}
      <UnsavedChangesDialog guard={priceGuard} count={unsavedCount} />
    </div>
  );
}

// ─── FLAT RATES FOLDER LIST ───────────────────────────────────────────────────
function FlatRatesFolderList({ onSelectFolder }) {
  const { data: rates = [] } = useQuery({ queryKey: ["labor-rates"], queryFn: () => db.LaborRate.list("name") });
  const flatRates = rates.filter(r => r.type === "flat_rate");
  const knownKeys = [...FLAT_RATE_FOLDERS.filter(f => f.key !== "other").map(f => f.key), "maintenance", "discounts"];

  const countForFolder = (key) => {
    if (key === "other") return flatRates.filter(r => !knownKeys.includes(r.category)).length;
    return flatRates.filter(r => r.category === key).length;
  };

  return (
    <div className="space-y-2">
      {FLAT_RATE_FOLDERS.map(folder => (
        <button key={folder.key} onClick={() => onSelectFolder(folder)} className="w-full text-left">
          <Card className="p-3.5 hover:border-primary/30 hover:bg-muted/30 transition-all active:scale-[0.99]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl">{folder.icon}</span>
                <div>
                  <p className="text-sm font-semibold">{folder.label}</p>
                  <p className="text-xs text-muted-foreground">{countForFolder(folder.key)} item{countForFolder(folder.key) !== 1 ? "s" : ""}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </Card>
        </button>
      ))}
    </div>
  );
}

// ─── FLAT RATES ITEM LIST ─────────────────────────────────────────────────────
function FlatRatesItemList({ folder }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", flat_price: 0, flat_cost: 0, notes: "" });
  const { confirmDelete } = usePreferences();
  const [unsavedCount, markDirty] = useDirtyKeys();
  const priceGuard = useUnsavedChangesGuard(unsavedCount > 0);

  const { data: rates = [] } = useQuery({ queryKey: ["labor-rates"], queryFn: () => db.LaborRate.list("name") });
  const knownKeys = [...FLAT_RATE_FOLDERS.filter(f => f.key !== "other").map(f => f.key), "maintenance", "discounts"];
  const items = folder.key === "other"
    ? rates.filter(r => r.type === "flat_rate" && !knownKeys.includes(r.category))
    : rates.filter(r => r.type === "flat_rate" && r.category === folder.key);

  const createMutation = useMutation({
    mutationFn: (data) => db.LaborRate.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["labor-rates"] }); setOpen(false); setForm({ name: "", flat_price: 0, flat_cost: 0, notes: "" }); toast.success("Flat rate added"); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => db.LaborRate.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["labor-rates"] }); toast.success("Removed"); },
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-xl gap-1.5"><Plus className="w-4 h-4" /> Add</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>New {folder.label} Rate</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-xs">Name *</Label><Input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="mt-1" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Flat Price</Label><Input type="number" step="0.01" value={form.flat_price} onFocus={e => e.target.select()} onChange={e => setForm(f => ({...f, flat_price: parseFloat(e.target.value) || 0}))} className="mt-1" /></div>
                <div><Label className="text-xs">Internal Cost</Label><Input type="number" step="0.01" value={form.flat_cost} onFocus={e => e.target.select()} onChange={e => setForm(f => ({...f, flat_cost: parseFloat(e.target.value) || 0}))} className="mt-1" /></div>
              </div>
              <div><Label className="text-xs">Notes</Label><Input value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} className="mt-1" /></div>
              <Button onClick={() => { if (!form.name) { toast.error("Name required"); return; } createMutation.mutate({ ...form, type: "flat_rate", category: folder.key }); }} className="w-full rounded-xl" disabled={createMutation.isPending}>Add Rate</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {items.length === 0 ? <EmptyState icon={Zap} title={`No ${folder.label} rates yet`} description="Tap + to add one" /> : (
        <div className="space-y-2">
          {items.map(r => (
            <Card key={r.id} className="p-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{r.name}</p>
                  {r.notes && <p className="text-xs text-muted-foreground italic">{r.notes}</p>}
                  {r.flat_cost > 0 && <p className="text-xs text-muted-foreground">Cost {formatCurrency(r.flat_cost)}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold">{formatCurrency(r.flat_price)}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { if (!confirmDelete || window.confirm(`Delete "${r.name}"? This cannot be undone.`)) deleteMutation.mutate(r.id); }}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
              {folder.key !== "discounts" && <PriceEditor kind="flat" item={r} onDirtyChange={(d) => markDirty(`price:${r.id}`, d)} />}
            </Card>
          ))}
        </div>
      )}
      <UnsavedChangesDialog guard={priceGuard} count={unsavedCount} />
    </div>
  );
}

// ─── MAINTENANCE LIST ─────────────────────────────────────────────────────────
function MaintenanceList() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", flat_price: 0, flat_cost: 0, notes: "" });
  const { confirmDelete } = usePreferences();
  const [unsavedCount, markDirty] = useDirtyKeys();
  const priceGuard = useUnsavedChangesGuard(unsavedCount > 0);

  const { data: rates = [] } = useQuery({ queryKey: ["labor-rates"], queryFn: () => db.LaborRate.list("name") });
  const items = rates.filter(r => r.type === "flat_rate" && r.category === "maintenance");

  const createMutation = useMutation({
    mutationFn: (data) => db.LaborRate.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["labor-rates"] }); setOpen(false); setForm({ name: "", flat_price: 0, flat_cost: 0, notes: "" }); toast.success("Added"); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => db.LaborRate.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["labor-rates"] }); toast.success("Removed"); },
  });

  const SEED_ITEMS = [
    { name: "One-Time Tune-Up (Air-Cooled)", flat_price: 300, flat_cost: 27, notes: "Air filter, spark plugs, oil filter, oil (1.8 qt), inspection, test run" },
    { name: "One-Time Oil Change (Air-Cooled)", flat_price: 200, flat_cost: 10, notes: "Oil filter + oil (1.8 qt) only — no spark plugs or air filter" },
    { name: "One-Time Tune-Up (Liquid-Cooled)", flat_price: 350, flat_cost: 35, notes: "Full liquid-cooled maintenance service — parts cost estimate" },
    { name: "One-Time Oil Change (Liquid-Cooled)", flat_price: 300, flat_cost: 15, notes: "Oil service only — liquid-cooled units" },
  ];

  useEffect(() => {
    if (rates.length === 0) return;
    const existingNames = rates.filter(r => r.category === "maintenance" && r.type === "flat_rate").map(r => r.name);
    const toSeed = SEED_ITEMS.filter(s => !existingNames.includes(s.name));
    if (toSeed.length === 0) return;
    Promise.all(toSeed.map(s => db.LaborRate.create({ ...s, type: "flat_rate", category: "maintenance" })))
      .then(() => queryClient.invalidateQueries({ queryKey: ["labor-rates"] }));
  }, [rates.length]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-xl gap-1.5"><Plus className="w-4 h-4" /> Add Package</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>New Maintenance Package</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-xs">Name *</Label><Input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="mt-1" placeholder="e.g. Full Annual Maintenance (Liquid-Cooled)" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Price</Label><Input type="number" step="0.01" value={form.flat_price} onFocus={e => e.target.select()} onChange={e => setForm(f => ({...f, flat_price: parseFloat(e.target.value) || 0}))} className="mt-1" /></div>
                <div><Label className="text-xs">Internal Cost</Label><Input type="number" step="0.01" value={form.flat_cost} onFocus={e => e.target.select()} onChange={e => setForm(f => ({...f, flat_cost: parseFloat(e.target.value) || 0}))} className="mt-1" /></div>
              </div>
              <div><Label className="text-xs">Notes</Label><Input value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} className="mt-1" /></div>
              <Button onClick={() => { if (!form.name) { toast.error("Name required"); return; } createMutation.mutate({ ...form, type: "flat_rate", category: "maintenance" }); }} className="w-full rounded-xl" disabled={createMutation.isPending}>Add Package</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {items.length === 0 ? (
        <Card className="p-6 text-center">
          <Wrench className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium text-muted-foreground">No maintenance packages yet</p>
          <p className="text-xs text-muted-foreground mt-1">Items will seed automatically on first load</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map(r => {
            const margin = r.flat_price > 0 ? Math.round(((r.flat_price - (r.flat_cost || 0)) / r.flat_price) * 100) : 0;
            return (
              <Card key={r.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{r.name}</p>
                    {r.notes && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{r.notes}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      {r.flat_cost > 0 && <span className="text-[10px] text-muted-foreground">Cost {formatCurrency(r.flat_cost)}</span>}
                      <span className="text-[10px] font-semibold text-green-600">{margin}% margin</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold text-green-600">{formatCurrency(r.flat_price)}</span>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { if (!confirmDelete || window.confirm(`Delete "${r.name}"? This cannot be undone.`)) deleteMutation.mutate(r.id); }}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
                <PriceEditor kind="flat" item={r} onDirtyChange={(d) => markDirty(`price:${r.id}`, d)} />
              </Card>
            );
          })}
        </div>
      )}
      <UnsavedChangesDialog guard={priceGuard} count={unsavedCount} />
    </div>
  );
}

// ─── MAIN CATALOG ─────────────────────────────────────────────────────────────
function escapeIlikeTerm(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_").replace(/,/g, "");
}

export default function Catalog() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const section = searchParams.get("section");
  const subKey = searchParams.get("sub");
  const subFolder = section === "flat_rates" && subKey
    ? FLAT_RATE_FOLDERS.find(f => f.key === subKey) ?? { key: subKey, label: subKey.replace(/_/g, " "), icon: "📦" }
    : null;
  const partsCategory = section === "parts" && subKey
    ? CATALOG_PART_BROWSE_ROWS.find(c => c.key === subKey) ?? { key: subKey, label: subKey.replace(/_/g, " "), icon: "📦" }
    : null;
  const [search, setSearch] = useState("");
  const [partsBrowseSearch, setPartsBrowseSearch] = useState("");
  // Price editors in the search result lists.
  const [unsavedCount, markDirty] = useDirtyKeys();
  const priceGuard = useUnsavedChangesGuard(unsavedCount > 0);
  const [debouncedPartsBrowse, setDebouncedPartsBrowse] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedPartsBrowse(partsBrowseSearch.trim()), 400);
    return () => clearTimeout(t);
  }, [partsBrowseSearch]);

  const { data: rates = [] } = useQuery({ queryKey: ["labor-rates"], queryFn: () => db.LaborRate.list("name") });
  const { data: parts = [] } = useQuery({ queryKey: ["parts-catalog"], queryFn: () => db.Part.list("name").then(rows => rows.map(normalizePart)) });
  const { data: docTemplates = [] } = useQuery({ queryKey: ["doc-templates"], queryFn: () => db.DocumentTemplate.list("-created_date") });

  const partsBrowseTrim = partsBrowseSearch.trim();
  const partsSearchEnabled =
    section === "parts" && !subKey && debouncedPartsBrowse.length > 0;

  const {
    data: partsSearchResults = [],
    isFetching: partsSearchFetching,
    error: partsSearchError,
  } = useQuery({
    queryKey: ["catalog-parts-search", debouncedPartsBrowse],
    queryFn: async () => {
      const raw = debouncedPartsBrowse.slice(0, 120);
      const esc = escapeIlikeTerm(raw);
      const p = `%${esc}%`;
      const { data, error } = await supabase
        .from("parts")
        .select("*")
        .or(`name.ilike.${p},part_number.ilike.${p}`)
        .order("name")
        .limit(500);
      if (error) throw error;
      return (data ?? []).map(normalizePart);
    },
    enabled: partsSearchEnabled,
  });

  const partsSearchPending =
    partsBrowseTrim.length > 0 &&
    (partsBrowseTrim !== debouncedPartsBrowse || (partsSearchEnabled && partsSearchFetching));

  // Seed Battery 26R if missing
  useEffect(() => {
    if (rates.length > 0) {
      const hasBattery = rates.some(r => r.name?.toLowerCase().includes("26r") || r.name?.toLowerCase().includes("battery 26r"));
      if (!hasBattery) {
        db.LaborRate.create({
          name: "Battery 26R",
          type: "flat_rate",
          category: "batteries",
          flat_price: 220,
          flat_cost: 0,
          notes: "Group 26R replacement battery",
        }).then(() => queryClient.invalidateQueries({ queryKey: ["labor-rates"] }));
      }
    }
  }, [rates.length]);

  const getTitle = () => {
    if (subFolder) return subFolder.label;
    if (partsCategory) return partsCategory.label;
    if (section) return TOP_FOLDERS.find(f => f.key === section)?.label || "Catalog";
    return "Catalog";
  };

  const getSubtitle = () => {
    if (subFolder) return "Flat Rates › " + subFolder.label;
    if (partsCategory) return "Catalog › Parts › " + partsCategory.label;
    if (section === "flat_rates") return "Catalog › Flat Rates";
    if (section) return "Catalog › " + TOP_FOLDERS.find(f => f.key === section)?.label;
    return "Tap a folder to browse";
  };

  return (
    <div>
      <PageHeader
        title={getTitle()}
        subtitle={getSubtitle()}
        back={section ? true : undefined}
      />
      <div className="px-4 pt-3 pb-24 space-y-3 max-w-lg mx-auto">

        {/* Top-level folder list */}
        {!section && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search parts and rates..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 rounded-xl"
              />
            </div>

            {search.trim() ? (
              <div className="space-y-2">
                {(() => {
                  const q = search.toLowerCase();
                  const matchingParts = parts.filter(p =>
                    p.name?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q)
                  );
                  const matchingRates = rates.filter(r =>
                    r.name?.toLowerCase().includes(q) || r.category?.toLowerCase().includes(q)
                  );
                  if (matchingParts.length === 0 && matchingRates.length === 0) {
                    return (
                      <Card className="p-8 text-center">
                        <Package className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">No results for "{search}"</p>
                      </Card>
                    );
                  }
                  return (
                    <>
                      {matchingParts.length > 0 && (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Parts ({matchingParts.length})</p>
                          <div className="space-y-1.5">
                            {matchingParts.map(part => (
                              <Card key={part.id} className="p-3">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-medium flex items-center gap-1.5 flex-wrap">{part.name}{stockStatus(part.in_stock) === "recount" && <span data-testid="recount-badge" className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Recount</span>}</p>
                                    <p className="text-xs text-muted-foreground capitalize">{part.category?.replace(/_/g, " ")} · Stock: {part.in_stock ?? 0}</p>
                                  </div>
                                  <p className="text-sm font-bold">{formatCurrency(part.default_price || 0)}</p>
                                </div>
                                <PriceEditor kind="part" item={part} onDirtyChange={(d) => markDirty(`price:${part.id}`, d)} />
                              </Card>
                            ))}
                          </div>
                        </div>
                      )}
                      {matchingRates.length > 0 && (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 mt-3">Labor & Flat Rates ({matchingRates.length})</p>
                          <div className="space-y-1.5">
                            {matchingRates.map(rate => (
                              <Card key={rate.id} className="p-3">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-medium">{rate.name}</p>
                                    <p className="text-xs text-muted-foreground capitalize">{rate.type?.replace(/_/g, " ")} · {rate.category?.replace(/_/g, " ")}</p>
                                  </div>
                                  <p className="text-sm font-bold">{formatCurrency(rate.flat_price || rate.rate || 0)}</p>
                                </div>
                                {rate.category !== "discounts" && <PriceEditor kind={rate.type === "hourly" ? "hourly" : "flat"} item={rate} onDirtyChange={(d) => markDirty(`price:${rate.id}`, d)} />}
                              </Card>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="space-y-2">
                {TOP_FOLDERS.map(f => {
                  const Icon = f.icon;
                  return (
                    <button key={f.key} onClick={() => navigate('/catalog?section=' + f.key)} className="w-full text-left">
                      <Card className="p-4 hover:border-primary/30 hover:bg-muted/20 transition-all active:scale-[0.99]">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3.5">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${f.color}`}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold">{f.label}</p>
                              <p className="text-xs text-muted-foreground">{f.description}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </Card>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {section === "parts" && !subKey && (
          <div className="space-y-3">
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Search parts by name or part number..."
                  value={partsBrowseSearch}
                  onChange={(e) => setPartsBrowseSearch(e.target.value)}
                  className="pl-9 pr-10 h-10 rounded-xl border-border bg-background"
                  aria-label="Search parts catalog"
                />
                {partsBrowseSearch ? (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => {
                      setPartsBrowseSearch("");
                      setDebouncedPartsBrowse("");
                    }}
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : null}
              </div>
            </div>

            {!partsBrowseTrim ? (
              <PartsCategoryList parts={parts} onSelectCategory={(cat) => navigate('/catalog?section=parts&sub=' + cat.key)} />
            ) : partsSearchPending ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm">Searching…</p>
              </div>
            ) : partsSearchError ? (
              <Card className="p-6 text-center border-destructive/30">
                <p className="text-sm text-destructive">Search failed. Try again.</p>
              </Card>
            ) : partsSearchResults.length === 0 ? (
              <Card className="p-8 text-center rounded-xl border-border">
                <Package className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {`No parts found for "${partsBrowseTrim}"`}
                </p>
              </Card>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {partsSearchResults.length} result{partsSearchResults.length !== 1 ? "s" : ""}
                </p>
                {partsSearchResults.map((part) => {
                  // Show the real sale price (default_price). order_price is a
                  // stale import field that never changed when prices were edited.
                  const salePrice = Number(part.default_price) || 0;
                  return (
                    <Card key={part.id} className="p-3.5 rounded-xl border-border">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-snug">{part.name}</p>
                          {part.part_number ? (
                            <p className="text-xs text-muted-foreground mt-0.5">#{part.part_number}</p>
                          ) : null}
                          <div className="mt-2">
                            <StatusBadge status={part.category || "other"} />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-primary">{formatCurrency(salePrice)}</p>
                          <p className="text-xs text-muted-foreground">cost {formatCurrency(part.cost)}</p>
                        </div>
                      </div>
                      <PriceEditor kind="part" item={part} onDirtyChange={(d) => markDirty(`price:${part.id}`, d)} />
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {section === "parts" && partsCategory && <PartsItemList key={partsCategory.key} category={partsCategory} parts={parts} />}
        {section === "labor_rates" && <LaborRatesList />}
        {section === "flat_rates" && !subFolder && <FlatRatesFolderList onSelectFolder={(f) => navigate('/catalog?section=flat_rates&sub=' + f.key)} />}
        {section === "flat_rates" && subFolder && <FlatRatesItemList folder={subFolder} />}
        {section === "maintenance" && <MaintenanceList />}
        {section === "discounts" && <FlatRatesItemList folder={{ key: "discounts", label: "Discounts", icon: "🏷️" }} />}
        {section === "documents" && (
          <div className="space-y-3">
            <button
              onClick={() => navigate("/catalog/documents/new")}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.99] transition-all"
            >
              <Plus className="w-4 h-4" />
              New Template
            </button>
            {docTemplates.length === 0 ? (
              <Card className="p-8 text-center">
                <FileText className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium mb-1">No templates yet</p>
                <p className="text-xs text-muted-foreground">Create one to get started</p>
              </Card>
            ) : (
              <div className="space-y-1.5">
                {docTemplates.map(t => (
                  <button key={t.id} onClick={() => navigate(`/catalog/documents/${t.id}`)} className="w-full text-left">
                    <Card className="p-3.5 hover:border-primary/30 hover:bg-muted/20 transition-all active:scale-[0.99]">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold">{t.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {t.category?.replace(/_/g, " ")} · {t.field_definitions?.length ?? 0} field{t.field_definitions?.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </div>
                    </Card>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

      <UnsavedChangesDialog guard={priceGuard} count={unsavedCount} />
      </div>
    </div>
  );
}