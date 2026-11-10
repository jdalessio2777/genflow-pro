import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, EyeOff, Eye, Check, AlertCircle, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { sanitizePriceInput } from "@/lib/utils/catalogPrice";
import {
  ITEM_TYPES, typeByKey, fieldsFor, categoryOptionsFor, formFromRow, blankForm,
  validateForm, createPayload, updatePatch, changesTable, isFormDirty,
} from "@/lib/utils/catalogItems";

const selectClass = "mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-base";

export function refreshCatalog(queryClient) {
  queryClient.invalidateQueries({ queryKey: ["parts-catalog"] });
  queryClient.invalidateQueries({ queryKey: ["catalog-parts-search"] });
  queryClient.invalidateQueries({ queryKey: ["labor-rates"] });
}

const apiFor = (table) => (table === "parts" ? db.Part : db.LaborRate);

// Hide / unhide one catalog item (no hard delete: old invoices keep their lines).
export async function setItemHidden(queryClient, table, item, hidden) {
  await apiFor(table).update(item.id, { is_hidden: hidden });
  refreshCatalog(queryClient);
}

/**
 * Add or edit any catalog item: part, hourly labor, flat rate, maintenance
 * package, service agreement or discount.
 *
 * Add:  <CatalogItemDialog open onOpenChange presetType="flat_rate" presetCategory="starters" />
 * Edit: <CatalogItemDialog open onOpenChange item={row} table="parts" | "labor_rates" />
 *
 * Typing only edits a draft; Save is the one commit point (Unsaved → Saving →
 * Saved, like the stock and price editors). Closing with unsaved changes asks
 * first. Saving never touches existing job, quote or invoice lines.
 */
export default function CatalogItemDialog({ open, onOpenChange, item = null, table = null, presetType = "part", presetCategory = "" }) {
  const queryClient = useQueryClient();
  const editing = !!item;
  const initial = () => (editing ? formFromRow(item, table) : blankForm(presetType, presetCategory));
  const [form, setForm] = useState(initial);
  const [status, setStatus] = useState("idle"); // idle | saving | saved | error
  const [message, setMessage] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Fresh form each time the dialog opens (or opens on another item).
  useEffect(() => {
    if (!open) return;
    setForm(initial());
    setStatus("idle");
    setMessage("");
    setConfirmDiscard(false);
  }, [open, item?.id]);

  const t = typeByKey(form.typeKey);
  const fields = fieldsFor(t.key);
  const catOptions = categoryOptionsFor(t.key);
  const dirty = isFormDirty(item, table, form);
  const moving = editing && changesTable(table, form);
  const saving = status === "saving";

  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); if (!saving) setStatus("idle"); setConfirmDiscard(false); };

  const onTypeChange = (key) => {
    const nt = typeByKey(key);
    const opts = categoryOptionsFor(key);
    // Keep the category when it still fits the new type, else pick a sensible one.
    let category = nt.category ?? form.category;
    if (opts && !opts.some(([k]) => k === category)) category = key === "flat_rate" ? "custom" : key === "labor" ? "labor" : "other";
    set({ typeKey: key, category });
  };

  const requestClose = (next) => {
    if (next) return onOpenChange(true);
    if (dirty && !saving && status !== "saved" && !confirmDiscard) { setConfirmDiscard(true); return; }
    onOpenChange(false);
  };

  const save = async () => {
    const err = validateForm(form);
    if (err) { setStatus("error"); setMessage(err); return; }
    if (saving) return;
    setStatus("saving");
    try {
      if (!editing) {
        await apiFor(t.table).create(createPayload(form));
        refreshCatalog(queryClient);
        toast.success(`${t.label} added: ${form.name.trim()}`);
        onOpenChange(false);
        return;
      }
      if (moving) {
        // Part <-> rate lives in another table: add the new item, hide the old.
        await apiFor(t.table).create(createPayload(form));
        await apiFor(table).update(item.id, { is_hidden: true });
        refreshCatalog(queryClient);
        toast.success(`Saved as ${t.label}. The old item is hidden.`);
        onOpenChange(false);
        return;
      }
      const patch = updatePatch(item, form);
      if (Object.keys(patch).length > 0) await apiFor(table).update(item.id, patch);
      refreshCatalog(queryClient);
      setStatus("saved");
      setMessage("Saved. New jobs and quotes use it now; past ones keep their prices.");
      toast.success(`Saved: ${form.name.trim()}`);
      onOpenChange(false);
    } catch (e) {
      console.error("Catalog item save failed", e);
      setStatus("error");
      setMessage("Not saved. Check signal and tap Save to retry.");
    }
  };

  const toggleHidden = async () => {
    if (!editing) { set({ is_hidden: !form.is_hidden }); return; }
    setStatus("saving");
    try {
      await setItemHidden(queryClient, table, item, !item.is_hidden);
      toast.success(item.is_hidden ? `"${item.name}" is back in the catalog` : `"${item.name}" hidden from the catalog`);
      onOpenChange(false);
    } catch (e) {
      console.error("Hide failed", e);
      setStatus("error");
      setMessage("Not saved. Check signal and try again.");
    }
  };

  const money = (key, label) => (
    <div className="min-w-0 flex-1">
      <Label className="text-xs">{label}</Label>
      <div className="relative mt-1">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
        <Input
          type="text" inputMode="decimal" autoComplete="off" aria-label={label}
          value={form[key]}
          onFocus={(e) => e.target.select()}
          onChange={(e) => set({ [key]: sanitizePriceInput(e.target.value) })}
          className={cn("h-11 rounded-xl pl-6 text-base tabular-nums", editing && dirty && String(formFromRow(item, table)[key]) !== form[key] && "border-amber-500 bg-amber-50 dark:bg-amber-900/30")}
        />
      </div>
    </div>
  );

  let statusEl = null;
  if (saving) statusEl = <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Saving…</span>;
  else if (status === "error") statusEl = <span role="alert" className="text-xs font-semibold text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3 shrink-0" />{message}</span>;
  else if (status === "saved") statusEl = <span role="status" className="text-xs font-semibold text-green-600 flex items-center gap-1"><Check className="w-3 h-3" />{message}</span>;
  else if (editing && dirty) statusEl = <span className="text-xs font-semibold text-amber-600 dark:text-amber-400" data-testid="item-unsaved">Unsaved changes</span>;

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent className="max-w-sm" data-testid="catalog-item-dialog">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit item" : "Add item"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs" htmlFor="ci-type">Type</Label>
            <select id="ci-type" className={selectClass} value={form.typeKey} onChange={(e) => onTypeChange(e.target.value)} disabled={saving}>
              {ITEM_TYPES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            {moving && <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">Saving makes a new {t.label.toLowerCase()} and hides the old item, so past invoices stay intact.</p>}
          </div>
          <div>
            <Label className="text-xs" htmlFor="ci-name">Name *</Label>
            <Input id="ci-name" value={form.name} onChange={(e) => set({ name: e.target.value })} className="mt-1 h-11 rounded-xl text-base" disabled={saving} />
          </div>
          {fields.partNumber && (
            <div>
              <Label className="text-xs" htmlFor="ci-pn">Part number</Label>
              <Input id="ci-pn" value={form.part_number} onChange={(e) => set({ part_number: e.target.value })} className="mt-1 h-11 rounded-xl text-base" disabled={saving} />
            </div>
          )}
          {(fields.price || fields.cost) && (
            <div className="flex gap-2">
              {fields.price && money("price", fields.priceLabel)}
              {fields.cost && money("cost", fields.costLabel)}
            </div>
          )}
          {fields.stock && (
            <div>
              <Label className="text-xs" htmlFor="ci-stock">In stock</Label>
              <Input id="ci-stock" type="text" inputMode="numeric" value={form.in_stock}
                onFocus={(e) => e.target.select()}
                onChange={(e) => set({ in_stock: e.target.value.replace(/[^\d-]/g, "").slice(0, 5) })}
                className="mt-1 h-11 rounded-xl text-base w-28" disabled={saving} />
            </div>
          )}
          {fields.category && (
            <div>
              <Label className="text-xs" htmlFor="ci-cat">Category</Label>
              <select id="ci-cat" className={selectClass} value={form.category} onChange={(e) => set({ category: e.target.value })} disabled={saving}>
                {!catOptions.some(([k]) => k === form.category) && form.category && <option value={form.category}>{form.category.replace(/_/g, " ")}</option>}
                {catOptions.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          )}
          <div>
            <Label className="text-xs" htmlFor="ci-desc">{t.key === "discount" ? "Description (include the %, e.g. 10% off)" : "Description"}</Label>
            <Textarea id="ci-desc" value={form.description} onChange={(e) => set({ description: e.target.value })} className="mt-1 rounded-xl text-base min-h-[64px]" disabled={saving} />
          </div>

          {statusEl && <div aria-live="polite">{statusEl}</div>}

          {confirmDiscard && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/30 p-3 space-y-2" role="alert">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Discard unsaved changes?</p>
              <div className="flex gap-2">
                <Button variant="outline" className="h-11 flex-1 rounded-xl" onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
                <Button variant="destructive" className="h-11 flex-1 rounded-xl" onClick={() => onOpenChange(false)}>Discard</Button>
              </div>
            </div>
          )}

          <Button onClick={save} className="w-full h-11 rounded-xl font-semibold" disabled={saving || (editing && !dirty)} data-testid="catalog-item-save">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? "Save" : `Add ${t.label.toLowerCase()}`}
          </Button>
          {editing && (
            <Button variant="outline" onClick={toggleHidden} disabled={saving || dirty} className="w-full h-11 rounded-xl gap-1.5" data-testid="catalog-item-hide">
              {item.is_hidden ? <><Eye className="w-4 h-4" /> Unhide (show in catalog)</> : <><EyeOff className="w-4 h-4" /> Hide from catalog</>}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Pencil button that opens the editor for one item.
export function ItemEditButton({ item, table, className = "" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon" className={cn("h-11 w-11 shrink-0", className)} aria-label={`Edit ${item.name}`} data-testid="catalog-item-edit" onClick={() => setOpen(true)}>
        <Pencil className="w-4 h-4" />
      </Button>
      {open && <CatalogItemDialog open={open} onOpenChange={setOpen} item={item} table={table} />}
    </>
  );
}

// "+ Add" button that opens the Add dialog preset to a type/folder.
export function AddItemButton({ label = "Add item", presetType = "part", presetCategory = "", className = "" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" className={cn("rounded-xl gap-1.5 h-10", className)} data-testid="catalog-add-item" onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4" /> {label}
      </Button>
      {open && <CatalogItemDialog open={open} onOpenChange={setOpen} presetType={presetType} presetCategory={presetCategory} />}
    </>
  );
}
