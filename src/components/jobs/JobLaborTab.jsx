import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Clock, Zap, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { toast } from "sonner";

export default function JobLaborTab({ jobId, labor }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("catalog"); // "catalog" | "custom"
  const [customType, setCustomType] = useState("hourly");
  const [form, setForm] = useState({ description: "", hours: 1, rate: 95, cost_rate: 45, flat_price: 0, flat_cost: 0 });

  const { data: rates = [] } = useQuery({
    queryKey: ["labor-rates"],
    queryFn: () => base44.entities.LaborRate.list("name"),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.JobLabor.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-labor", jobId] });
      setOpen(false);
      setForm({ description: "", hours: 1, rate: 95, cost_rate: 45, flat_price: 0, flat_cost: 0 });
      setMode("catalog");
      toast.success("Labor added");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.JobLabor.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["job-labor", jobId] }); },
  });

  const addFromRate = (rate) => {
    if (rate.type === "hourly") {
      createMutation.mutate({
        job_id: jobId,
        description: rate.name,
        hours: 1,
        rate: rate.rate,
        cost_rate: rate.cost_rate,
        is_flat_rate: false,
        total_price: rate.rate * 1,
        total_cost: (rate.cost_rate || 0) * 1,
      });
    } else {
      createMutation.mutate({
        job_id: jobId,
        description: rate.name,
        is_flat_rate: true,
        flat_rate_amount: rate.flat_price,
        flat_rate_cost: rate.flat_cost,
        total_price: rate.flat_price,
        total_cost: rate.flat_cost || 0,
      });
    }
  };

  const addCustom = () => {
    if (!form.description) { toast.error("Description required"); return; }
    if (customType === "hourly") {
      createMutation.mutate({
        job_id: jobId,
        description: form.description,
        hours: form.hours,
        rate: form.rate,
        cost_rate: form.cost_rate,
        is_flat_rate: false,
        total_price: form.hours * form.rate,
        total_cost: form.hours * form.cost_rate,
      });
    } else {
      createMutation.mutate({
        job_id: jobId,
        description: form.description,
        is_flat_rate: true,
        flat_rate_amount: form.flat_price,
        flat_rate_cost: form.flat_cost,
        total_price: form.flat_price,
        total_cost: form.flat_cost,
      });
    }
  };

  const totalCost = labor.reduce((s, l) => s + (l.total_cost || 0), 0);
  const totalPrice = labor.reduce((s, l) => s + (l.total_price || 0), 0);

  const hourlyRates = rates.filter(r => r.type === "hourly");
  const flatRates = rates.filter(r => r.type === "flat_rate");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Cost: {formatCurrency(totalCost)} → Charge: {formatCurrency(totalPrice)}</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-xl gap-1 text-xs h-8">
              <Plus className="w-3 h-3" /> Add Labor
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Add Labor</DialogTitle></DialogHeader>

            {/* Mode toggle */}
            <div className="grid grid-cols-2 gap-2">
              {["catalog", "custom"].map(m => (
                <button key={m} type="button" onClick={() => setMode(m)}
                  className={`p-2 rounded-xl border text-sm font-medium transition-colors ${mode === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                  {m === "catalog" ? "From Rates" : "Custom"}
                </button>
              ))}
            </div>

            {mode === "catalog" ? (
              <div className="space-y-3 max-h-72 overflow-y-auto">
                {rates.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No rates set up yet. Add them in Catalog → Labor Rates.</p>
                ) : (
                  <>
                    {hourlyRates.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground font-semibold mb-1.5 flex items-center gap-1"><Clock className="w-3 h-3" /> Hourly</p>
                        <div className="space-y-1.5">
                          {hourlyRates.map(r => (
                            <button key={r.id} type="button" onClick={() => addFromRate(r)}
                              className="w-full flex items-center justify-between p-2.5 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-colors text-left">
                              <div><p className="text-sm font-medium">{r.name}</p><p className="text-xs text-muted-foreground">1 hr default</p></div>
                              <div className="flex items-center gap-2"><span className="text-sm font-semibold">{formatCurrency(r.rate)}/hr</span><ChevronRight className="w-4 h-4 text-muted-foreground" /></div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {flatRates.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground font-semibold mb-1.5 flex items-center gap-1"><Zap className="w-3 h-3" /> Flat Rate</p>
                        <div className="space-y-1.5">
                          {flatRates.map(r => (
                            <button key={r.id} type="button" onClick={() => addFromRate(r)}
                              className="w-full flex items-center justify-between p-2.5 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-colors text-left">
                              <div><p className="text-sm font-medium">{r.name}</p><p className="text-xs text-muted-foreground">Flat rate</p></div>
                              <div className="flex items-center gap-2"><span className="text-sm font-semibold">{formatCurrency(r.flat_price)}</span><ChevronRight className="w-4 h-4 text-muted-foreground" /></div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div><Label className="text-xs">Description</Label><Input value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} className="mt-1" placeholder="e.g. Emergency after-hours labor" /></div>
                <div className="grid grid-cols-2 gap-2">
                  {["hourly", "flat_rate"].map(t => (
                    <button key={t} type="button" onClick={() => setCustomType(t)}
                      className={`p-2 rounded-xl border text-sm font-medium transition-colors ${customType === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                      {t === "hourly" ? "⏱ Hourly" : "⚡ Flat Rate"}
                    </button>
                  ))}
                </div>
                {customType === "hourly" ? (
                  <div className="grid grid-cols-3 gap-2">
                    <div><Label className="text-xs">Hours</Label><Input type="number" step="0.25" value={form.hours} onChange={e => setForm(f => ({...f, hours: parseFloat(e.target.value) || 0}))} className="mt-1" /></div>
                    <div><Label className="text-xs">Rate/hr</Label><Input type="number" step="0.01" value={form.rate} onChange={e => setForm(f => ({...f, rate: parseFloat(e.target.value) || 0}))} className="mt-1" /></div>
                    <div><Label className="text-xs">Cost/hr</Label><Input type="number" step="0.01" value={form.cost_rate} onChange={e => setForm(f => ({...f, cost_rate: parseFloat(e.target.value) || 0}))} className="mt-1" /></div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">Fixed Price</Label><Input type="number" step="0.01" value={form.flat_price} onChange={e => setForm(f => ({...f, flat_price: parseFloat(e.target.value) || 0}))} className="mt-1" /></div>
                    <div><Label className="text-xs">Internal Cost</Label><Input type="number" step="0.01" value={form.flat_cost} onChange={e => setForm(f => ({...f, flat_cost: parseFloat(e.target.value) || 0}))} className="mt-1" /></div>
                  </div>
                )}
                <Button onClick={addCustom} className="w-full rounded-xl" disabled={createMutation.isPending}>Add Labor</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {labor.length === 0 ? (
        <Card className="p-6 text-center">
          <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No labor logged yet</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {labor.map(l => (
            <Card key={l.id} className="p-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {l.is_flat_rate ? <Zap className="w-3 h-3 text-amber-500 shrink-0" /> : <Clock className="w-3 h-3 text-blue-500 shrink-0" />}
                    <p className="text-sm font-medium">{l.description}</p>
                  </div>
                  <p className="text-xs text-muted-foreground ml-4.5">
                    {l.is_flat_rate ? "Flat rate" : `${l.hours}h @ ${formatCurrency(l.rate)}/hr`}
                    {l.total_cost > 0 && ` · cost ${formatCurrency(l.total_cost)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{formatCurrency(l.total_price)}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { if (window.confirm(`Remove "${l.description}" from this job?`)) deleteMutation.mutate(l.id); }}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}