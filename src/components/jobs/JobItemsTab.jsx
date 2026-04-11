import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronLeft, Clock, Zap, Wrench, Trash2, Plus } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
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
  { key: "other", label: "Other", icon: "📦" },
];

export default function JobItemsTab({ jobId, labor, memberDiscountRate = 1.0, initialFolder = null }) {
  const isMember = memberDiscountRate < 1.0;
  const queryClient = useQueryClient();
  const [folder, setFolder] = useState(initialFolder);
  const [subFolder, setSubFolder] = useState(null);

  const { data: rates = [] } = useQuery({
    queryKey: ["labor-rates"],
    queryFn: () => db.LaborRate.list("name"),
  });

  const createMutation = useMutation({
    mutationFn: (data) => db.JobLabor.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-labor", jobId] });
      toast.success("Added to job");
      setSubFolder(null);
      setFolder(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.JobLabor.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["job-labor", jobId] }),
  });

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
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold">{formatCurrency(l.total_price)}</span>
                    <Button variant="ghost" size="icon" className="h-8 w-8"
                      onClick={() => { if (window.confirm(`Remove "${l.description}" from this job?`)) deleteMutation.mutate(l.id); }}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
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