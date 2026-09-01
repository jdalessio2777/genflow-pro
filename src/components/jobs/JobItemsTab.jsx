import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { supabase } from "@/lib/supabaseClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronRight, ChevronLeft, Clock, Zap, Wrench, Trash2, Plus, Pencil, Check, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { computeJobFinancials } from "@/lib/utils/jobFinancials";
import { usePreferences } from "@/hooks/usePreferences";
import { toast } from "sonner";

const ITEM_FOLDERS = [
  { key: "labor", label: "Labor Rates", icon: Clock, color: "bg-amber-100 text-amber-700", description: "Hourly billing rates" },
  { key: "flat_rates", label: "Flat Rates", icon: Zap, color: "bg-purple-100 text-purple-700", description: "Fixed-price jobs by category" },
  { key: "maintenance", label: "Maintenance", icon: Wrench, color: "bg-green-100 text-green-700", description: "Maintenance packages" },
];

const FLAT_RATE_FOLDERS = [
  { key: "oil_pressure_switches", label: "Oil Pressure Switches", icon: "🔧" },
  { key: "starters", label: "Starters", icon: "⚡" },
  { key: "controllers", label: "Controllers", icon: "🖥️" },
  { key: "load_shed", label: "Load Shed", icon: "🔌" },
  { key: "smm_boards", label: "SMM Boards", icon: "📟" },
  { key: "batteries", label: "Batteries", icon: "🔋" },
  { key: "maintenance", label: "Maintenance", icon: "🔧" },
  { key: "discounts", label: "Discounts", icon: "🏷️" },
  { key: "other", label: "Other", icon: "📦" },
];

export default function JobItemsTab({ jobId, labor, parts = [], memberDiscountRate = 1.0, initialFolder = null, presetSubFolderKey = null, customerId = null }) {
  const isMember = memberDiscountRate < 1.0;
  const queryClient = useQueryClient();
  const [folder, setFolder] = useState(initialFolder);
  const { confirmDelete } = usePreferences();
  const [subFolder, setSubFolder] = useState(() =>
    presetSubFolderKey
      ? FLAT_RATE_FOLDERS.find(f => f.key === presetSubFolderKey) ?? { key: presetSubFolderKey, label: presetSubFolderKey.replace(/_/g, " "), icon: "📦" }
      : null
  );
  const [editingPriceId, setEditingPriceId] = useState(null);
  const [editingPriceValue, setEditingPriceValue] = useState("");

  const { data: rates = [] } = useQuery({
    queryKey: ["labor-rates"],
    queryFn: () => db.LaborRate.list("name"),
  });

  const triggerRewardApply = async (custId) => {
    try {
      const rows = await db.Customer.filter({ id: custId });
      const cust = rows[0];
      if (!cust) return;

      const email = cust.email?.trim().toLowerCase();
      const phone = cust.phone?.trim();
      if (!email && !phone) return;

      let referralId = null;
      if (email) {
        const { data } = await supabase
          .from("shield_referrals")
          .select("id")
          .ilike("referrer_email", email)
          .eq("status", "confirmed")
          .eq("reward_applied", false)
          .order("confirmed_at", { ascending: false })
          .limit(1);
        if (data?.length) referralId = data[0].id;
      }
      if (!referralId && phone) {
        const { data } = await supabase
          .from("shield_referrals")
          .select("id")
          .eq("referrer_phone", phone)
          .eq("status", "confirmed")
          .eq("reward_applied", false)
          .order("confirmed_at", { ascending: false })
          .limit(1);
        if (data?.length) referralId = data[0].id;
      }
      if (!referralId) return;

      await Promise.all([
        db.ShieldReferral.update(referralId, { reward_applied: true, status: "applied" }),
        db.Customer.update(custId, { pending_reward: false }),
      ]);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["shield-referrals"] });
      toast.success("Referral reward applied — 10% discount recorded");
    } catch (err) {
      console.warn("[JobItemsTab] Referral reward auto-trigger failed", err);
    }
  };

  const createMutation = useMutation({
    mutationFn: (data) => db.JobLabor.create(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["job-labor", jobId] });
      toast.success("Added to job");
      setSubFolder(null);
      setFolder(null);

      if (variables.description?.split(" (Member")[0] === "Referral Discount" && customerId) {
        triggerRewardApply(customerId);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.JobLabor.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["job-labor", jobId] }),
  });

  const updatePriceMutation = useMutation({
    mutationFn: ({ id, data }) => db.JobLabor.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-labor", jobId] });
      setEditingPriceId(null);
      toast.success("Price updated");
    },
    onError: () => toast.error("Failed to update price"),
  });

  const startEditingPrice = (item) => {
    setEditingPriceId(item.id);
    setEditingPriceValue(String(item.is_flat_rate ? (item.flat_rate_amount ?? 0) : (item.rate ?? 0)));
  };

  const cancelPriceEdit = () => {
    setEditingPriceId(null);
    setEditingPriceValue("");
  };

  const commitPriceEdit = (item) => {
    const newPrice = parseFloat(editingPriceValue);
    // Flat-rate items (e.g. discounts) may be negative to reduce the invoice; hourly rates may not.
    if (isNaN(newPrice) || (newPrice < 0 && !item.is_flat_rate)) { toast.error("Enter a valid price"); return; }
    if (item.is_flat_rate) {
      updatePriceMutation.mutate({ id: item.id, data: { flat_rate_amount: newPrice, total_price: newPrice } });
    } else {
      updatePriceMutation.mutate({ id: item.id, data: { rate: newPrice, total_price: newPrice * (item.hours || 0) } });
    }
  };

  const addRate = (rate) => {
    if (rate.type === "hourly") {
      const discountedRate = Math.round(rate.rate * memberDiscountRate * 100) / 100;
      createMutation.mutate({
        job_id: jobId,
        description: rate.name + (isMember ? ` (Member ${Math.round((1-memberDiscountRate)*100)}% off)` : ""),
        hours: 1,
        rate: discountedRate,
        cost_rate: rate.cost_rate || 0,
        is_flat_rate: false,
        total_price: discountedRate,
        total_cost: (rate.cost_rate || 0) * 1,
      });
    } else if (rate.category === "discounts") {
      // Discount catalog items are stored at $0 — their notes carry the
      // percentage ("adjust amount to X% of job total"). Compute the actual
      // negative amount off the job's current subtotal at add-time instead of
      // requiring a manual price entry before it shows up anywhere.
      const pct = parseFloat((rate.notes || "").match(/(\d+(?:\.\d+)?)\s*%/)?.[1]) || 0;
      const { subtotal } = computeJobFinancials(parts, labor);
      const amount = pct > 0 ? -Math.round((subtotal * pct / 100) * 100) / 100 : 0;
      createMutation.mutate({
        job_id: jobId,
        description: rate.name,
        is_flat_rate: true,
        flat_rate_amount: amount,
        flat_rate_cost: 0,
        total_price: amount,
        total_cost: 0,
      });
    } else {
      const discountedPrice = Math.round(rate.flat_price * memberDiscountRate * 100) / 100;
      createMutation.mutate({
        job_id: jobId,
        description: rate.name + (isMember ? ` (Member ${Math.round((1-memberDiscountRate)*100)}% off)` : ""),
        is_flat_rate: true,
        flat_rate_amount: discountedPrice,
        flat_rate_cost: rate.flat_cost || 0,
        total_price: discountedPrice,
        total_cost: rate.flat_cost || 0,
      });
    }
  };

  const goBack = () => {
    if (subFolder) { setSubFolder(null); return; }
    setFolder(null);
  };

  const hourlyRates = rates.filter(r => r.type === "hourly");
  const knownKeys = [...FLAT_RATE_FOLDERS.map(f => f.key).filter(k => k !== "other"), "maintenance"];

  const getFlatRatesForFolder = (key) => {
    if (key === "other") return rates.filter(r => r.type === "flat_rate" && !knownKeys.includes(r.category));
    return rates.filter(r => r.type === "flat_rate" && r.category === key);
  };

  const maintenanceRates = rates.filter(r => r.type === "flat_rate" && r.category === "maintenance");
  const totalCost = labor.reduce((s, l) => s + (l.total_cost || 0), 0);
  const totalPrice = labor.reduce((s, l) => s + (l.total_price || 0), 0);

  return (
    <div className="space-y-3">

      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Cost: {formatCurrency(totalCost)} · Charge: {formatCurrency(totalPrice)}
        </p>
        {folder && (
          <button onClick={goBack} className="flex items-center gap-1 text-xs text-primary font-medium">
            <ChevronLeft className="w-3.5 h-3.5" /> Back
          </button>
        )}
      </div>

      {/* Breadcrumb */}
      {folder && (
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <span className="text-primary cursor-pointer font-medium" onClick={() => { setFolder(null); setSubFolder(null); }}>Items</span>
          <ChevronRight className="w-3 h-3" />
          <span className={subFolder ? "text-primary cursor-pointer font-medium" : "font-medium"} onClick={() => subFolder && setSubFolder(null)}>
            {ITEM_FOLDERS.find(f => f.key === folder)?.label}
          </span>
          {subFolder && (
            <>
              <ChevronRight className="w-3 h-3" />
              <span className="font-medium">{subFolder.label}</span>
            </>
          )}
        </div>
      )}

      {/* Top-level folder list */}
      {!folder && (
        <div className="space-y-2">
          {ITEM_FOLDERS.map(f => {
            const Icon = f.icon;
            return (
              <button key={f.key} onClick={() => setFolder(f.key)} className="w-full text-left">
                <Card className="p-3.5 hover:border-primary/30 hover:bg-muted/20 transition-all active:scale-[0.99]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${f.color}`}>
                        <Icon className="w-4 h-4" />
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

      {/* Labor Rates folder */}
      {folder === "labor" && !subFolder && (
        <div className="space-y-2">
          {hourlyRates.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-sm text-muted-foreground">No labor rates in catalog yet</p>
            </Card>
          ) : hourlyRates.map(r => (
            <button key={r.id} onClick={() => addRate(r)} className="w-full text-left">
              <Card className="p-3 hover:border-primary/30 hover:bg-primary/5 transition-all active:scale-[0.99]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{r.name}</p>
                    <p className="text-xs text-muted-foreground">1 hr default · tap to add</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isMember ? (
                      <div className="text-right">
                        <span className="text-sm font-bold text-emerald-600">{formatCurrency(Math.round(r.rate * memberDiscountRate * 100) / 100)}/hr</span>
                        <p className="text-[10px] text-muted-foreground line-through">{formatCurrency(r.rate)}</p>
                      </div>
                    ) : (
                      <span className="text-sm font-bold text-primary">{formatCurrency(r.rate)}/hr</span>
                    )}
                    <Plus className="w-4 h-4 text-primary" />
                  </div>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      {/* Flat Rates — sub-folder list */}
      {folder === "flat_rates" && !subFolder && (
        <div className="space-y-2">
          {FLAT_RATE_FOLDERS.map(f => {
            const count = getFlatRatesForFolder(f.key).length;
            return (
              <button key={f.key} onClick={() => setSubFolder(f)} className="w-full text-left">
                <Card className="p-3.5 hover:border-primary/30 hover:bg-muted/20 transition-all active:scale-[0.99]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{f.icon}</span>
                      <div>
                        <p className="text-sm font-semibold">{f.label}</p>
                        <p className="text-xs text-muted-foreground">{count} item{count !== 1 ? "s" : ""}</p>
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

      {/* Flat Rates — items inside sub-folder */}
      {folder === "flat_rates" && subFolder && (
        <div className="space-y-2">
          {getFlatRatesForFolder(subFolder.key).length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-sm text-muted-foreground">No {subFolder.label} rates in catalog</p>
            </Card>
          ) : getFlatRatesForFolder(subFolder.key).map(r => (
            <button key={r.id} onClick={() => addRate(r)} className="w-full text-left">
              <Card className="p-3 hover:border-primary/30 hover:bg-primary/5 transition-all active:scale-[0.99]">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1 mr-2">
                    <p className="text-sm font-semibold">{r.name}</p>
                    {r.notes && <p className="text-xs text-muted-foreground">{r.notes}</p>}
                    <p className="text-xs text-muted-foreground">Flat rate · tap to add</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isMember ? (
                      <div className="text-right">
                        <span className="text-sm font-bold text-emerald-600">{formatCurrency(Math.round(r.flat_price * memberDiscountRate * 100) / 100)}</span>
                        <p className="text-[10px] text-muted-foreground line-through">{formatCurrency(r.flat_price)}</p>
                      </div>
                    ) : (
                      <span className="text-sm font-bold text-primary">{formatCurrency(r.flat_price)}</span>
                    )}
                     <Plus className="w-4 h-4 text-primary" />
                    </div>
                    </div>
                    </Card>
                    </button>
                    ))}
                    </div>
                    )}

                    {/* Maintenance folder */}
                    {folder === "maintenance" && (
        <div className="space-y-2">
          {maintenanceRates.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-sm text-muted-foreground">No maintenance packages in catalog yet</p>
            </Card>
          ) : maintenanceRates.map(r => (
            <button key={r.id} onClick={() => addRate(r)} className="w-full text-left">
              <Card className="p-3 hover:border-primary/30 hover:bg-primary/5 transition-all active:scale-[0.99] border-green-200">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="text-sm font-semibold">{r.name}</p>
                    {r.notes && <p className="text-xs text-muted-foreground mt-0.5">{r.notes}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">Tap to add to job</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isMember ? (
                      <div className="text-right">
                        <span className="text-sm font-bold text-emerald-600">{formatCurrency(Math.round(r.flat_price * memberDiscountRate * 100) / 100)}</span>
                        <p className="text-[10px] text-muted-foreground line-through">{formatCurrency(r.flat_price)}</p>
                      </div>
                    ) : (
                      <span className="text-sm font-bold text-green-600">{formatCurrency(r.flat_price)}</span>
                    )}
                    <Plus className="w-4 h-4 text-green-600" />
                  </div>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      {/* Added items list — always visible at bottom */}
      {labor.length > 0 && (
        <div className="pt-2 border-t border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Added to Job</p>
          <div className="space-y-2">
            {labor.map(l => (
              <Card key={l.id} className="p-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {l.is_flat_rate ? <Zap className="w-3 h-3 text-amber-500 shrink-0" /> : <Clock className="w-3 h-3 text-blue-500 shrink-0" />}
                      <p className="text-sm font-medium truncate">{l.description}</p>
                    </div>
                    <p className="text-xs text-muted-foreground ml-4.5">
                      {l.is_flat_rate ? "Flat rate" : `${l.hours}h @ ${formatCurrency(l.rate)}/hr`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {editingPriceId === l.id ? (
                      <>
                        <Input
                          type="number"
                          step="0.01"
                          value={editingPriceValue}
                          onChange={e => setEditingPriceValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") commitPriceEdit(l);
                            if (e.key === "Escape") cancelPriceEdit();
                          }}
                          className="w-20 h-7 text-sm text-right px-2 rounded-lg"
                          autoFocus
                        />
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:bg-green-50"
                          onClick={() => commitPriceEdit(l)} disabled={updatePriceMutation.isPending}>
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={cancelPriceEdit}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="text-sm font-semibold">{formatCurrency(l.total_price)}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => startEditingPrice(l)}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8"
                          onClick={() => { if (!confirmDelete || window.confirm(`Remove "${l.description}" from this job?`)) deleteMutation.mutate(l.id); }}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}