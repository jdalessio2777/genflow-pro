import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { supabase } from "@/lib/supabaseClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Gift, Trash2, Plus } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import AnimatedListItem from "@/components/ui/AnimatedListItem";
import { usePreferences } from "@/hooks/usePreferences";
import { toast } from "sonner";

const STATUS_FILTERS = ["all", "pending", "confirmed", "applied"];

const PLAN_OPTIONS = [
  { value: "guardian", label: "Guardian Plan (Annual — $325/yr)" },
  { value: "sentinel", label: "Sentinel Plan (Semi-Annual — $575/yr)" },
];

function StatusPill({ status }) {
  const styles = {
    pending:   "bg-muted/60 text-muted-foreground border border-border",
    confirmed: "bg-green-100 text-green-700 border border-green-200",
    applied:   "bg-amber-100 text-amber-700 border border-amber-200",
  };
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${styles[status] ?? styles.pending}`}>
      {status}
    </span>
  );
}

function PlanBadge({ type }) {
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
      type === "sentinel"
        ? "bg-red-100 text-red-700 border border-red-200"
        : "bg-blue-100 text-blue-700 border border-blue-200"
    }`}>
      {type === "sentinel" ? "Sentinel" : "Guardian"}
    </span>
  );
}

function ProgressBar({ value, max, colorClass }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-muted-foreground font-medium whitespace-nowrap">
        {Math.min(value, max)}/{max}
      </span>
    </div>
  );
}

const EMPTY_FORM = {
  referrerSearch: "",
  referrerCustomerId: null,
  referrerName: "",
  referrerPhone: "",
  referrerEmail: "",
  referredName: "",
  referredPhone: "",
  referredEmail: "",
  planType: "guardian",
};

function AddReferralModal({ open, onClose, onSuccess }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [customerResults, setCustomerResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleReferrerSearch = async (value) => {
    set("referrerSearch", value);
    set("referrerCustomerId", null);
    set("referrerName", value);
    set("referrerPhone", "");
    set("referrerEmail", "");

    if (value.length < 2) {
      setCustomerResults([]);
      return;
    }
    setSearching(true);
    try {
      const { data } = await supabase
        .from("customers")
        .select("id, name, phone, email")
        .ilike("name", `%${value}%`)
        .limit(6);
      setCustomerResults(data ?? []);
    } catch {
      setCustomerResults([]);
    } finally {
      setSearching(false);
    }
  };

  const selectCustomer = (c) => {
    setForm(prev => ({
      ...prev,
      referrerSearch: c.name,
      referrerCustomerId: c.id,
      referrerName: c.name,
      referrerPhone: c.phone ?? "",
      referrerEmail: c.email ?? "",
    }));
    setCustomerResults([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.referrerName.trim()) return toast.error("Referrer name is required");
    if (!form.referredName.trim()) return toast.error("Referred name is required");
    if (!form.referredPhone.trim()) return toast.error("Referred phone is required");

    setSubmitting(true);
    try {
      await db.ShieldReferral.create({
        referrer_name: form.referrerName.trim(),
        referrer_phone: form.referrerPhone.trim() || null,
        referrer_email: form.referrerEmail.trim() || null,
        referred_name: form.referredName.trim(),
        referred_phone: form.referredPhone.trim(),
        referred_email: form.referredEmail.trim() || null,
        plan_type: form.planType,
        source: "phone_call",
        status: "pending",
      });

      if (form.referrerCustomerId) {
        await db.Customer.update(form.referrerCustomerId, { pending_reward: true });
      }

      toast.success("Referral added");
      onSuccess();
    } catch (err) {
      toast.error("Failed to add referral");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setForm(EMPTY_FORM);
    setCustomerResults([]);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Referral</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">

          {/* Referrer */}
          <div className="space-y-2.5">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Referrer</p>
            <div className="relative">
              <Label className="text-xs mb-1 block">Name</Label>
              <Input
                value={form.referrerSearch}
                onChange={e => handleReferrerSearch(e.target.value)}
                placeholder="Search existing customers…"
                autoComplete="off"
              />
              {customerResults.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-md overflow-hidden">
                  {customerResults.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                      onClick={() => selectCustomer(c)}
                    >
                      <span className="font-medium">{c.name}</span>
                      {c.phone && <span className="text-muted-foreground ml-2 text-xs">{c.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
              {searching && (
                <p className="text-xs text-muted-foreground mt-1">Searching…</p>
              )}
              {form.referrerCustomerId && (
                <p className="text-xs text-green-600 mt-1">✓ Matched existing customer</p>
              )}
            </div>
            <div>
              <Label className="text-xs mb-1 block">Phone</Label>
              <Input
                value={form.referrerPhone}
                onChange={e => set("referrerPhone", e.target.value)}
                placeholder="(973) 555-0000"
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Email</Label>
              <Input
                value={form.referrerEmail}
                onChange={e => set("referrerEmail", e.target.value)}
                placeholder="optional"
                type="email"
              />
            </div>
          </div>

          <div className="border-t border-border" />

          {/* Referred */}
          <div className="space-y-2.5">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Referred Person</p>
            <div>
              <Label className="text-xs mb-1 block">Name <span className="text-destructive">*</span></Label>
              <Input
                value={form.referredName}
                onChange={e => set("referredName", e.target.value)}
                placeholder="Full name"
                required
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Phone <span className="text-destructive">*</span></Label>
              <Input
                value={form.referredPhone}
                onChange={e => set("referredPhone", e.target.value)}
                placeholder="(973) 555-0000"
                required
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Email</Label>
              <Input
                value={form.referredEmail}
                onChange={e => set("referredEmail", e.target.value)}
                placeholder="optional"
                type="email"
              />
            </div>
          </div>

          {/* Plan */}
          <div>
            <Label className="text-xs mb-1 block">Plan Type</Label>
            <select
              value={form.planType}
              onChange={e => set("planType", e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {PLAN_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={submitting}>
              {submitting ? "Saving…" : "Add Referral"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Referrals() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const { confirmDelete } = usePreferences();

  const { data: referrals = [], isLoading } = useQuery({
    queryKey: ["shield-referrals"],
    queryFn: () => db.ShieldReferral.list("-created_at"),
  });

  const confirmMutation = useMutation({
    mutationFn: async (referral) => {
      await db.ShieldReferral.update(referral.id, {
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
      });

      const email = referral.referrer_email?.trim().toLowerCase();
      const phone = referral.referrer_phone?.trim();

      try {
        let matches = [];
        if (email) {
          const { data } = await supabase
            .from("customers")
            .select("id")
            .ilike("email", email)
            .limit(1);
          matches = data ?? [];
        }
        if (matches.length === 0 && phone) {
          const { data } = await supabase
            .from("customers")
            .select("id")
            .eq("phone", phone)
            .limit(1);
          matches = data ?? [];
        }
        if (matches.length > 0) {
          await db.Customer.update(matches[0].id, { pending_reward: true });
        } else {
          console.warn("[Referrals] No customer match for referral", referral.id, { email, phone });
        }
      } catch (err) {
        console.warn("[Referrals] Customer lookup failed for referral", referral.id, err);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shield-referrals"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Referral confirmed");
    },
    onError: () => toast.error("Failed to confirm referral"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.ShieldReferral.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shield-referrals"] });
      toast.success("Referral deleted");
    },
    onError: () => toast.error("Failed to delete referral"),
  });

  const stats = {
    total:     referrals.length,
    pending:   referrals.filter(r => r.status === "pending").length,
    confirmed: referrals.filter(r => r.status === "confirmed").length,
    applied:   referrals.filter(r => r.status === "applied").length,
  };

  const filtered =
    filter === "all" ? referrals : referrals.filter(r => r.status === filter);

  const balances = Object.values(
    referrals.reduce((acc, r) => {
      const key = r.referrer_phone || r.referrer_email || r.referrer_name;
      if (!acc[key]) {
        acc[key] = {
          name: r.referrer_name,
          phone: r.referrer_phone,
          email: r.referrer_email,
          referrals: [],
        };
      }
      acc[key].referrals.push(r);
      return acc;
    }, {})
  );

  return (
    <div>
      <PageHeader
        title="Referrals"
        subtitle={`${stats.total} total`}
        actions={
          <Button size="sm" className="h-8 px-3 text-xs gap-1.5" onClick={() => setModalOpen(true)}>
            <Plus className="w-3.5 h-3.5" />
            Add Referral
          </Button>
        }
      />

      <AddReferralModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => {
          setModalOpen(false);
          queryClient.invalidateQueries({ queryKey: ["shield-referrals"] });
        }}
      />

      <div className="px-4 pt-3 pb-4 space-y-4 max-w-lg mx-auto">

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Total",     value: stats.total,     color: "text-foreground" },
            { label: "Pending",   value: stats.pending,   color: "text-red-600" },
            { label: "Confirmed", value: stats.confirmed, color: "text-green-600" },
            { label: "Applied",   value: stats.applied,   color: "text-amber-600" },
          ].map(s => (
            <Card key={s.label} className="p-2.5 text-center">
              <p className={`text-xl font-bold leading-none ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-muted-foreground font-medium mt-1">{s.label}</p>
            </Card>
          ))}
        </div>

        {/* Filter buttons */}
        <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
          {STATUS_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-colors border ${
                filter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Referrals list */}
        {isLoading ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Loading...</Card>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Gift}
            title="No referrals"
            description="Referrals submitted via the Shield Rewards page appear here"
          />
        ) : (
          <div className="space-y-2">
            {filtered.map((r, idx) => (
              <AnimatedListItem key={r.id} index={idx}>
              <Card className="p-3.5 space-y-2.5">
                {/* Referrer */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{r.referrer_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.referrer_phone}
                      {r.referrer_email ? ` · ${r.referrer_email}` : ""}
                    </p>
                  </div>
                  <StatusPill status={r.status} />
                </div>

                {/* Referred person */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="text-muted-foreground/40">→</span>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-foreground">{r.referred_name}</span>
                    {(r.referred_phone || r.referred_email) && (
                      <span className="ml-1">
                        {r.referred_phone || ""}
                        {r.referred_email ? ` · ${r.referred_email}` : ""}
                      </span>
                    )}
                  </div>
                  <PlanBadge type={r.plan_type} />
                </div>

                {/* Date + actions */}
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <span className="text-[11px] text-muted-foreground">
                    {r.created_at
                      ? new Date(r.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {r.status === "pending" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-xs rounded-xl border-green-200 text-green-700 hover:bg-green-50"
                        onClick={() => confirmMutation.mutate(r)}
                        disabled={confirmMutation.isPending}
                      >
                        ✓ Confirm
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 rounded-xl"
                      onClick={() => {
                        if (!confirmDelete || window.confirm("Delete this referral? This cannot be undone.")) {
                          deleteMutation.mutate(r.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </Card>
              </AnimatedListItem>
            ))}
          </div>
        )}

        {/* Reward Balances */}
        {balances.length > 0 && (
          <div className="pt-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2.5">
              Reward Balances
            </p>
            <div className="space-y-2">
              {balances.map(c => {
                const confirmed = c.referrals.filter(
                  r => r.status === "confirmed" || r.status === "applied"
                ).length;
                const hasActiveReward = c.referrals.some(
                  r => r.status === "confirmed" && !r.reward_applied
                );
                const key = c.phone || c.email || c.name;
                return (
                  <Card key={key} className="p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.phone || ""}
                          {c.email ? (c.phone ? ` · ${c.email}` : c.email) : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-lg font-bold leading-none">{confirmed}</span>
                        <span className="text-xs text-muted-foreground">confirmed</span>
                      </div>
                    </div>

                    {hasActiveReward && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-red-50 border border-red-100">
                        <Gift className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        <span className="text-xs font-semibold text-red-700">
                          10% Off Next Service
                        </span>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground w-20 shrink-0">
                          🛡️ Guardian
                        </span>
                        <ProgressBar value={confirmed} max={5} colorClass="bg-primary" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground w-20 shrink-0">
                          ⚔️ Sentinel
                        </span>
                        <ProgressBar value={confirmed} max={7} colorClass="bg-amber-500" />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
