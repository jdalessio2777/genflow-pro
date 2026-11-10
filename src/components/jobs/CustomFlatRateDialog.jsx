import { useEffect, useState } from "react";
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
import { CUSTOM_FLAT_CATEGORY, customFlatRateRow, customLineName, findCustomDuplicates } from "@/lib/utils/catalogItems";

const blank = { name: "", price: "", description: "" };

/**
 * "+ Custom flat rate" on a job: type a name, price and optional
 * description; it goes straight onto this job (member discount applied like
 * any catalog flat rate). Then: "Save this flat rate to the catalog?"
 *   Save          → a Flat Rate in the catalog's "Custom" folder
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
  const { add, busy: adding } = useAddJobLabor(jobId);

  useEffect(() => {
    if (open) { setForm(blank); setStep("form"); setAdded(null); setDups([]); setBusy(false); }
  }, [open]);

  const price = parsePriceDraft(form.price);
  const isMember = memberDiscountRate < 1.0;

  const addToJob = async () => {
    if (!form.name.trim()) { toast.error("Enter a name"); return; }
    if (price === null) { toast.error("Enter a price like 250 or 250.50"); return; }
    const entry = { name: form.name.trim(), price, description: form.description.trim() };
    const rate = { type: "flat_rate", category: CUSTOM_FLAT_CATEGORY, name: customLineName(entry), flat_price: price, flat_cost: 0 };
    const row = await add(buildLaborLine({ rate, jobId, memberDiscountRate }), entry.name);
    if (!row) return; // add failed: the save-error toast has Retry; keep the form
    setAdded(entry);
    setStep("ask");
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["labor-rates"] });

  const createInCatalog = async () => {
    await db.LaborRate.create(customFlatRateRow(added));
    refresh();
    toast.success(`"${added.name}" saved to Catalog › Flat Rates › Custom`);
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
    const existing = findCustomDuplicates(await db.LaborRate.filter({ category: CUSTOM_FLAT_CATEGORY }), added.name);
    if (existing.length > 0) { setDups(existing); setStep("duplicate"); return; }
    await createInCatalog();
  });

  const updateExisting = (row) => run(async () => {
    await db.LaborRate.update(row.id, { flat_price: added.price, is_hidden: false, ...(added.description ? { notes: added.description } : {}) });
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
            <DialogHeader><DialogTitle>Save this flat rate to the catalog?</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">"{added.name}" ({formatCurrency(added.price)}) is on this job. Save it under Flat Rates › Custom to use it again?</p>
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
                A custom flat rate named "{dups[0].name}" is already saved at {formatCurrency(dups[0].flat_price)}{dups[0].is_hidden ? " (hidden)" : ""}.
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
