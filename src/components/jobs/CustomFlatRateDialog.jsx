import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils/format";
import { sanitizePriceInput, parsePriceDraft } from "@/lib/utils/catalogPrice";
import { buildLaborLine, memberPrice } from "@/lib/utils/laborPricing";
import { useAddJobLabor } from "@/lib/useAddJobLabor";
import { CUSTOM_FLAT_CATEGORY, customFlatRateRow, customLineName, findCustomDuplicates, customPartRow, findCustomPartDuplicates } from "@/lib/utils/catalogItems";
import { CUSTOM_PART_CATEGORY } from "@/lib/utils/partsManaged";
import { createOnce, newRequestId, showSaveError, dismissSaveError, useSaveGuard } from "@/lib/saveSafety";
import { haptics } from "@/lib/haptics";

const blank = { name: "", price: "", description: "", kind: "labor" }; // kind: labor | part (Run 14, B)

/**
 * "+ Custom flat rate" on a job: type a name, price and optional
 * description, and choose Labor (default) or Part; it goes straight onto this
 * job (member discount applied like any catalog item).
 *   Labor → a job_labor line (Labor on the invoice).
 *   Part  → a job_parts line with no catalog link and no stock (Parts on the
 *           invoice, taxed like any part).
 * Then: "Save to the catalog?"
 *   Save          → Labor: a Flat Rate in Flat Rates › Custom
 *                   Part:  a part in Parts › Custom (no stock tracking, never in
 *                          low-stock alerts)
 *                   (same name already there → update its price, or keep both)
 *   Just this job → only on this job's invoice
 */
export default function CustomFlatRateDialog({ open, onOpenChange, jobId, memberDiscountRate = 1.0 }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(blank);
  const [step, setStep] = useState("form"); // form | ask | duplicate
  const [added, setAdded] = useState(null); // { name, price, description }
  const [dups, setDups] = useState([]);
  const [busy, setBusy] = useState(false);
  const { add, busy: addingLabor } = useAddJobLabor(jobId);
  // Part lines: one add at a time, fixed id so a Retry can't add it twice.
  const partGuard = useSaveGuard();
  const pendingPart = useRef(null);
  const adding = addingLabor || partGuard.busy;
  const addPartLine = (line, label) => partGuard.run(async function attempt() {
    const key = JSON.stringify(line);
    if (!pendingPart.current || pendingPart.current.key !== key) pendingPart.current = { key, id: newRequestId() };
    try {
      const row = await createOnce(db.JobPart, pendingPart.current.id, line);
      pendingPart.current = null;
      dismissSaveError("", { id: "add-custom-part-error" });
      queryClient.invalidateQueries({ queryKey: ["job-parts", jobId] });
      toast.success(`${label} added`);
      return row;
    } catch (e) {
      haptics.error();
      showSaveError(`"${label}" NOT added`, e, () => partGuard.run(attempt), { id: "add-custom-part-error" });
      return null;
    }
  });

  useEffect(() => {
    if (open) { setForm(blank); setStep("form"); setAdded(null); setDups([]); setBusy(false); }
  }, [open]);

  const price = parsePriceDraft(form.price);
  const isMember = memberDiscountRate < 1.0;

  const addToJob = async () => {
    if (!form.name.trim()) { toast.error("Enter a name"); return; }
    if (price === null) { toast.error("Enter a price like 250 or 250.50"); return; }
    const entry = { name: form.name.trim(), price, description: form.description.trim(), kind: form.kind };
    let row;
    if (form.kind === "part") {
      const unit = memberPrice(price, memberDiscountRate);
      row = await addPartLine({
        job_id: jobId, name: customLineName(entry), part_number: null, description: null,
        cost: 0, price: unit, quantity: 1, part_id: null, charge_for_part: true,
        total_cost: 0, total_price: unit,
      }, entry.name);
    } else {
      const rate = { type: "flat_rate", category: CUSTOM_FLAT_CATEGORY, name: customLineName(entry), flat_price: price, flat_cost: 0 };
      row = await add(buildLaborLine({ rate, jobId, memberDiscountRate }), entry.name);
    }
    if (!row) return; // add failed: the save-error toast has Retry; keep the form
    setAdded(entry);
    setStep("ask");
  };

  const isPart = added?.kind === "part";
  const where = isPart ? "Parts › Custom" : "Flat Rates › Custom";
  const refresh = () => queryClient.invalidateQueries({ queryKey: [isPart ? "parts-catalog" : "labor-rates"] });

  const createInCatalog = async () => {
    if (isPart) await db.Part.create(customPartRow(added));
    else await db.LaborRate.create(customFlatRateRow(added));
    refresh();
    toast.success(`"${added.name}" saved to Catalog › ${where}`);
    onOpenChange(false);
  };

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); } catch (e) {
      console.error("Custom flat rate catalog save failed", e);
      toast.error("Not saved to the catalog. Check signal and try again. (It IS on this job.)");
    } finally { setBusy(false); }
  };

  const onSave = () => run(async () => {
    const existing = isPart
      ? findCustomPartDuplicates(await db.Part.filter({ category: CUSTOM_PART_CATEGORY }), added.name)
      : findCustomDuplicates(await db.LaborRate.filter({ category: CUSTOM_FLAT_CATEGORY }), added.name);
    if (existing.length > 0) { setDups(existing); setStep("duplicate"); return; }
    await createInCatalog();
  });

  const updateExisting = (row) => run(async () => {
    if (isPart) await db.Part.update(row.id, { default_price: added.price, is_hidden: false, ...(added.description ? { description: added.description } : {}) });
    else await db.LaborRate.update(row.id, { flat_price: added.price, is_hidden: false, ...(added.description ? { notes: added.description } : {}) });
    refresh();
    toast.success(`"${row.name}" price updated to ${formatCurrency(added.price)} for future jobs`);
    onOpenChange(false);
  });

  // Once the line is on the job, closing = "Just this job".
  const close = (next) => { if (!next && (busy || adding)) return; onOpenChange(next); };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-sm" data-testid="custom-flat-rate-dialog">
        {step === "form" && (
          <>
            <DialogHeader><DialogTitle>Custom flat rate</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs" htmlFor="cfr-name">Name *</Label>
                <Input id="cfr-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1 h-11 rounded-xl text-base" placeholder="e.g. Replace fuel regulator" />
              </div>
              <div>
                <Label className="text-xs">Goes on the invoice as</Label>
                <div className="grid grid-cols-2 gap-2 mt-1" role="radiogroup" aria-label="Goes on the invoice as">
                  {[["labor", "Labor"], ["part", "Part"]].map(([k, label]) => (
                    <button key={k} type="button" role="radio" aria-checked={form.kind === k} data-testid={`cfr-kind-${k}`}
                      onClick={() => setForm(f => ({ ...f, kind: k }))}
                      className={`h-11 rounded-xl border text-sm font-semibold transition-colors ${form.kind === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs" htmlFor="cfr-price">Price *</Label>
                <div className="relative mt-1 w-40">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input id="cfr-price" type="text" inputMode="decimal" autoComplete="off" value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: sanitizePriceInput(e.target.value) }))}
                    className="h-11 rounded-xl pl-6 text-base tabular-nums" placeholder="0.00" />
                </div>
                {isMember && price !== null && price > 0 && (
                  <p className="text-xs text-emerald-700 mt-1">Member price on this job: {formatCurrency(memberPrice(price, memberDiscountRate))}</p>
                )}
              </div>
              <div>
                <Label className="text-xs" htmlFor="cfr-desc">Description (optional)</Label>
                <Textarea id="cfr-desc" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="mt-1 rounded-xl text-base min-h-[64px]" />
              </div>
              <Button className="w-full h-11 rounded-xl font-semibold" onClick={addToJob} disabled={adding} data-testid="cfr-add">
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add to job"}
              </Button>
            </div>
          </>
        )}

        {step === "ask" && added && (
          <>
            <DialogHeader><DialogTitle>{isPart ? "Save this part to the catalog?" : "Save this flat rate to the catalog?"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">"{added.name}" ({formatCurrency(added.price)}) is on this job{isPart ? " as a part" : ""}. Save it under {where} to use it again?{isPart ? " Custom parts have no stock tracking." : ""}</p>
              <Button className="w-full h-11 rounded-xl font-semibold" onClick={onSave} disabled={busy} data-testid="cfr-save">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
              </Button>
              <Button variant="outline" className="w-full h-11 rounded-xl" onClick={() => onOpenChange(false)} disabled={busy} data-testid="cfr-just-job">Just this job</Button>
            </div>
          </>
        )}

        {step === "duplicate" && added && (
          <>
            <DialogHeader><DialogTitle>Already in the catalog</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                A custom {isPart ? "part" : "flat rate"} named "{dups[0].name}" is already saved at {formatCurrency(isPart ? dups[0].default_price : dups[0].flat_price)}{dups[0].is_hidden ? " (hidden)" : ""}.
              </p>
              <Button className="w-full h-11 rounded-xl font-semibold" onClick={() => updateExisting(dups[0])} disabled={busy} data-testid="cfr-update-price">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : `Update its price to ${formatCurrency(added.price)}`}
              </Button>
              <Button variant="outline" className="w-full h-11 rounded-xl" onClick={() => run(createInCatalog)} disabled={busy} data-testid="cfr-keep-both">Keep both</Button>
              <Button variant="ghost" className="w-full h-11 rounded-xl" onClick={() => onOpenChange(false)} disabled={busy}>Don&apos;t save (just this job)</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
