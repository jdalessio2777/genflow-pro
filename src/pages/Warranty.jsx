import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ShieldCheck, Loader2, Trash2, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";
import PageHeader from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCurrency } from "@/lib/utils/format";
import { haptics } from "@/lib/haptics";
import { toast } from "sonner";
import { warrantyClaimsQuery } from "@/lib/finance/useFinanceData";
import { computeFinance, rangeFor, todayET, PAID_VIA, paidViaLabel } from "@/lib/finance/core";

// Warranty (Run 9, D1): money Generac or a distributor paid back for warranty
// work (warranty_claims). Deliberately simple — no job link, no status: one
// row per reimbursement received. It counts as revenue ("Warranty") in Finance
// Overview / Insights and the weekly report, via the shared finance module.

const EMPTY = { customer_name: "", claim_number: "", description: "", amount_paid: "", date_paid: "", paid_via: "check", notes: "" };
const toForm = (c) => ({ customer_name: c.customer_name || "", claim_number: c.claim_number || "", description: c.description || "", amount_paid: c.amount_paid != null ? String(Number(c.amount_paid)) : "", date_paid: c.date_paid || "", paid_via: c.paid_via || "check", notes: c.notes || "" });
const shortDate = (k) => (k ? new Date(`${k}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

export function parseAmount(v) {
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (!/^\d*\.?\d{0,2}$/.test(s) || s === "" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export default function Warranty() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: claims = [], isLoading, error } = useQuery(warrantyClaimsQuery());
  const [editing, setEditing] = useState(null); // null | "new" | claim
  const [form, setForm] = useState(EMPTY);
  const [askDelete, setAskDelete] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const sorted = [...claims].sort((a, b) => String(b.date_paid || "").localeCompare(String(a.date_paid || "")) || String(b.created_at || "").localeCompare(String(a.created_at || "")));
  const month = computeFinance({ warrantyClaims: claims }, rangeFor("month"));
  const year = computeFinance({ warrantyClaims: claims }, rangeFor("ytd"));

  const openNew = () => { setForm({ ...EMPTY, date_paid: todayET() }); setEditing("new"); };
  const openEdit = (c) => { setForm(toForm(c)); setEditing(c); };
  const close = () => { if (!saveMutation.isPending) setEditing(null); };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const amount = parseAmount(form.amount_paid);
      const row = {
        customer_name: form.customer_name.trim() || null,
        claim_number: form.claim_number.trim() || null,
        description: form.description.trim() || null,
        amount_paid: amount,
        date_paid: form.date_paid,
        paid_via: form.paid_via,
        notes: form.notes.trim() || null,
      };
      if (editing === "new") return db.WarrantyClaim.create({ ...row, created_by: user?.email || null });
      return db.WarrantyClaim.update(editing.id, row);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warranty-claims"] });
      haptics.light();
      toast.success(editing === "new" ? "Warranty claim added" : "Warranty claim saved");
      setEditing(null);
    },
    onError: (e) => { haptics.error(); toast.error(`Warranty claim NOT saved: ${e.message}`); },
  });
  const deleteMutation = useMutation({
    mutationFn: () => db.WarrantyClaim.delete(editing.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warranty-claims"] });
      toast.success("Warranty claim deleted");
      setAskDelete(false); setEditing(null);
    },
    onError: (e) => toast.error(`Warranty claim NOT deleted: ${e.message}`),
  });

  const submit = () => {
    if (parseAmount(form.amount_paid) == null) { haptics.error(); toast.error("Enter the amount paid (e.g. 412.50)"); return; }
    if (!form.date_paid) { haptics.error(); toast.error("Pick the date it was paid"); return; }
    if (!form.customer_name.trim() && !form.claim_number.trim()) { haptics.error(); toast.error("Add the customer or the claim / control #"); return; }
    saveMutation.mutate();
  };

  const busy = saveMutation.isPending || deleteMutation.isPending;

  return (
    <div>
      <PageHeader title="Warranty" subtitle="Reimbursements from Generac & distributors" back
        actions={<Button size="sm" className="rounded-xl gap-1.5" onClick={openNew} data-testid="warranty-add"><Plus className="w-4 h-4" /> Add</Button>} />

      <div className="p-4 space-y-3 max-w-lg mx-auto">
        <div className="grid grid-cols-2 gap-2" data-testid="warranty-totals">
          <Card className="p-3.5 border-violet-200 bg-violet-50 dark:border-violet-700 dark:bg-violet-900/20">
            <p className="text-xs font-semibold text-violet-900 dark:text-violet-200">Paid this month</p>
            <p className="text-xl font-bold text-violet-700 dark:text-violet-300" data-testid="warranty-month">{formatCurrency(month.warranty)}</p>
            <p className="text-[11px] text-violet-700/80 dark:text-violet-300/80">{month.warrantyClaims} claim{month.warrantyClaims !== 1 ? "s" : ""}</p>
          </Card>
          <Card className="p-3.5">
            <p className="text-xs font-semibold text-muted-foreground">Paid this year</p>
            <p className="text-xl font-bold text-foreground" data-testid="warranty-year">{formatCurrency(year.warranty)}</p>
            <p className="text-[11px] text-muted-foreground">{year.warrantyClaims} claim{year.warrantyClaims !== 1 ? "s" : ""}</p>
          </Card>
        </div>

        {error ? (
          <Card className="p-4 text-sm text-red-700 dark:text-red-300">Warranty claims couldn't be loaded: {error.message}</Card>
        ) : isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : sorted.length === 0 ? (
          <Card className="p-6 text-center">
            <ShieldCheck className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-semibold">No warranty claims yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add each reimbursement when Generac or the distributor pays.</p>
          </Card>
        ) : (
          <div className="space-y-2" data-testid="warranty-list">
            {sorted.map(c => (
              <button key={c.id} type="button" onClick={() => openEdit(c)} className="w-full text-left" data-testid="warranty-row">
                <Card className="p-3.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{c.customer_name || "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">{[c.claim_number && `#${c.claim_number}`, c.description].filter(Boolean).join(" · ") || "No description"}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{shortDate(c.date_paid)} · {paidViaLabel(c.paid_via)}</p>
                  </div>
                  <span className="text-sm font-bold shrink-0 tabular-nums">{formatCurrency(c.amount_paid)}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </Card>
              </button>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent data-testid="warranty-sheet">
          <DialogHeader className="text-left">
            <DialogTitle>{editing === "new" ? "Add warranty claim" : "Warranty claim"}</DialogTitle>
            <DialogDescription className="text-xs">Money paid back for warranty work — counted as revenue.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs" htmlFor="wc-customer">Customer name</Label>
              <Input id="wc-customer" value={form.customer_name} onChange={e => set("customer_name", e.target.value)} placeholder="e.g. Don Grennon" className="mt-1" autoComplete="off" />
            </div>
            <div>
              <Label className="text-xs" htmlFor="wc-claim">Claim / control #</Label>
              <Input id="wc-claim" value={form.claim_number} onChange={e => set("claim_number", e.target.value)} placeholder="Generac control #" className="mt-1" autoComplete="off" autoCapitalize="characters" />
            </div>
            <div>
              <Label className="text-xs" htmlFor="wc-desc">Description</Label>
              <Input id="wc-desc" value={form.description} onChange={e => set("description", e.target.value)} placeholder="e.g. Fuel plenum SIB17-01" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-2 form-row">
              <div>
                <Label className="text-xs" htmlFor="wc-amount">Amount paid ($)</Label>
                <Input id="wc-amount" type="text" inputMode="decimal" enterKeyHint="done" value={form.amount_paid} onChange={e => set("amount_paid", e.target.value)} placeholder="0.00" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs" htmlFor="wc-date">Date paid</Label>
                <Input id="wc-date" type="date" value={form.date_paid} onChange={e => set("date_paid", e.target.value)} className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs" htmlFor="wc-via">Paid via</Label>
              <Select value={form.paid_via} onValueChange={v => set("paid_via", v)}>
                <SelectTrigger id="wc-via" className="mt-1" data-testid="wc-via"><SelectValue /></SelectTrigger>
                <SelectContent>{PAID_VIA.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs" htmlFor="wc-notes">Notes</Label>
              <Textarea id="wc-notes" rows={3} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Optional" className="mt-1 rounded-xl" />
            </div>
            <Button className="w-full rounded-xl h-11" disabled={busy} onClick={submit} data-testid="warranty-save">
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null} {editing === "new" ? "Add Claim" : "Save Changes"}
            </Button>
            {editing && editing !== "new" && (
              <Button variant="ghost" className="w-full rounded-xl h-11 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10" disabled={busy} onClick={() => setAskDelete(true)} data-testid="warranty-delete">
                <Trash2 className="w-4 h-4" /> Delete Claim
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={askDelete} onOpenChange={(o) => { if (!deleteMutation.isPending) setAskDelete(o); }}>
        <AlertDialogContent className="max-w-sm rounded-2xl" data-testid="warranty-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this warranty claim?</AlertDialogTitle>
            <AlertDialogDescription>
              {editing && editing !== "new" ? <>{editing.customer_name || editing.claim_number || "This claim"} · {formatCurrency(editing.amount_paid)} will be removed from Warranty and from Finance. This can't be undone.</> : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11 rounded-xl" disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="h-11 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteMutation.isPending}
              onClick={(e) => { e.preventDefault(); deleteMutation.mutate(); }}>
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Delete Claim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
