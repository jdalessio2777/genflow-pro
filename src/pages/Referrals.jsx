import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Gift, Trash2 } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { toast } from "sonner";

const STATUS_FILTERS = ["all", "pending", "confirmed", "applied"];

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

export default function Referrals() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");

  const { data: referrals = [], isLoading } = useQuery({
    queryKey: ["shield-referrals"],
    queryFn: () => db.ShieldReferral.list("-created_at"),
  });

  const confirmMutation = useMutation({
    mutationFn: (id) =>
      db.ShieldReferral.update(id, {
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shield-referrals"] });
      toast.success("Referral confirmed");
    },
    onError: () => toast.error("Failed to confirm referral"),
  });

  const applyMutation = useMutation({
    mutationFn: (id) =>
      db.ShieldReferral.update(id, {
        status: "applied",
        reward_applied: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shield-referrals"] });
      toast.success("Reward marked as applied");
    },
    onError: () => toast.error("Failed to update referral"),
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
      <PageHeader title="Referrals" subtitle={`${stats.total} total`} />

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
            {filtered.map(r => (
              <Card key={r.id} className="p-3.5 space-y-2.5">
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
                        onClick={() => confirmMutation.mutate(r.id)}
                        disabled={confirmMutation.isPending}
                      >
                        ✓ Confirm
                      </Button>
                    )}
                    {r.status === "confirmed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-xs rounded-xl border-amber-200 text-amber-700 hover:bg-amber-50"
                        onClick={() => applyMutation.mutate(r.id)}
                        disabled={applyMutation.isPending}
                      >
                        Mark Applied
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 rounded-xl"
                      onClick={() => {
                        if (window.confirm("Delete this referral? This cannot be undone.")) {
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
