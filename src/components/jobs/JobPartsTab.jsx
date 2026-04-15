import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Package, ChevronRight, ChevronLeft, Pencil, Check, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { toast } from "sonner";

const PART_CATEGORIES = [
  { key: "air_filters", label: "Air Filters", icon: "🌬️" },
  { key: "oil_filters", label: "Oil Filters", icon: "🛢️" },
  { key: "oils_fluids", label: "Oil", icon: "💧" },
  { key: "spark_plugs", label: "Spark Plugs", icon: "⚡" },
  { key: "batteries", label: "Batteries", icon: "🔋" },
  { key: "belt", label: "Belts", icon: "🔄" },
  { key: "gasket", label: "Gaskets", icon: "🔩" },
  { key: "electrical", label: "Electrical", icon: "⚡" },
  { key: "coolant", label: "Coolant", icon: "🧊" },
  { key: "hardware", label: "Hardware", icon: "🔧" },
  { key: "other", label: "Other", icon: "📦" },
];

const LEGACY_CATEGORY_MAP = {
  air_filter: "air_filters",
  oil_filter: "oil_filters",
  oil: "oils_fluids",
  spark_plug: "spark_plugs",
  battery: "batteries",
};
const normalizeCatalogPart = (p) =>
  LEGACY_CATEGORY_MAP[p.category] ? { ...p, category: LEGACY_CATEGORY_MAP[p.category] } : p;

export default function JobPartsTab({ jobId, parts, catalogParts: rawCatalogParts, memberDiscountRate = 1.0, searchFilter = "" }) {
  const catalogParts = (rawCatalogParts ?? []).map(normalizeCatalogPart);
  const isMember = memberDiscountRate < 1.0;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [partsFolder, setPartsFolder] = useState(null);
  const [editingPriceId, setEditingPriceId] = useState(null);
  const [editingPriceValue, setEditingPriceValue] = useState("");
  const [overriddenPriceIds, setOverriddenPriceIds] = useState(new Set());
  const [form, setForm] = useState({
    name: "",
    part_number: "",
    description: "",
    cost: 0,
    price: 0,
    quantity: 1,
    charge_for_part: true,
    save_to_catalog: true,
    category: "other",
  });

  const createMutation = useMutation({
    mutationFn: (data) => db.JobPart.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-parts", jobId] });
      setOpen(false);
      setForm({ name: "", cost: 0, price: 0, quantity: 1, charge_for_part: false });
      toast.success("Part added");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.JobPart.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-parts", jobId] });
      toast.success("Part removed");
    },
  });

  const updatePriceMutation = useMutation({
    mutationFn: ({ id, price, quantity }) =>
      db.JobPart.update(id, { price, total_price: price * quantity }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["job-parts", jobId] });
      setOverriddenPriceIds(prev => new Set(prev).add(id));
      setEditingPriceId(null);
      toast.success("Price updated");
    },
    onError: () => toast.error("Failed to update price"),
  });

  const startEditingPrice = (part) => {
    setEditingPriceId(part.id);
    setEditingPriceValue(String(part.price ?? 0));
  };

  const commitPriceEdit = (part) => {
    const newPrice = parseFloat(editingPriceValue);
    if (isNaN(newPrice) || newPrice < 0) { toast.error("Enter a valid price"); return; }
    updatePriceMutation.mutate({ id: part.id, price: newPrice, quantity: part.quantity });
  };

  const cancelPriceEdit = () => {
    setEditingPriceId(null);
    setEditingPriceValue("");
  };

  const saveCatalogMutation = useMutation({
    mutationFn: (data) => db.Part.create(data),
  });

  const handleAdd = async () => {
    if (!form.name.trim()) { toast.error("Part name required"); return; }
    if (form.charge_for_part && (!form.price || form.price <= 0)) {
      toast.error("Enter a price or turn off 'Charge for part'"); return;
    }

    const basePrice = form.charge_for_part ? form.price : 0;
    const effectivePrice = isMember && form.charge_for_part
      ? Math.round(basePrice * memberDiscountRate * 100) / 100
      : basePrice;

    // Save to catalog first if toggled on
    let savedPartId = null;
    if (form.save_to_catalog && form.name.trim()) {
      try {
        const newPart = await saveCatalogMutation.mutateAsync({
          name: form.name.trim(),
          part_number: form.part_number.trim() || null,
          description: form.description.trim() || null,
          cost: form.cost || 0,
          default_price: form.price || 0,
          category: form.category,
          in_stock: 0,
        });
        savedPartId = newPart?.id || null;
        queryClient.invalidateQueries({ queryKey: ["parts-catalog"] });
      } catch {
        // silently fail — still add to job even if catalog save fails
      }
    }

    createMutation.mutate({
      job_id: jobId,
      name: form.name.trim(),
      part_number: form.part_number.trim() || null,
      description: form.description.trim() || null,
      cost: form.cost || 0,
      price: effectivePrice,
      quantity: form.quantity,
      part_id: savedPartId || form.part_id,
      charge_for_part: form.charge_for_part,
      total_cost: (form.cost || 0) * form.quantity,
      total_price: effectivePrice * form.quantity,
    });

    // Auto-deduct from inventory if added from catalog
    if (form.part_id) {
      const catalogPart = catalogParts.find(p => p.id === form.part_id);
      if (catalogPart) {
        const currentStock = catalogPart.in_stock ?? 0;
        const newStock = Math.max(0, currentStock - form.quantity);
        db.Part.update(form.part_id, {
          in_stock: newStock,
          reorder_flagged: newStock === 0 ? true : (catalogPart.reorder_flagged || false),
        });
        queryClient.invalidateQueries({ queryKey: ["parts-catalog"] });
      }
    }
  };

  const totalCost = parts.reduce((s, p) => s + (p.total_cost || 0), 0);
  const totalPrice = parts.reduce((s, p) => s + (p.total_price || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Cost: {formatCurrency(totalCost)} → Charge: {formatCurrency(totalPrice)}</p>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setPartsFolder(null); setForm({ name: "", part_number: "", description: "", cost: 0, price: 0, quantity: 1, charge_for_part: true, save_to_catalog: true, category: "other" }); } }}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-xl gap-1 text-xs h-8">
              <Plus className="w-3 h-3" /> Add Part
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>
                {partsFolder && partsFolder.key !== "custom" && partsFolder.key !== "confirm" ? (
                  <button onClick={() => setPartsFolder(null)} className="flex items-center gap-2 text-base font-bold">
                    <ChevronLeft className="w-4 h-4" /> {partsFolder.label}
                  </button>
                ) : partsFolder?.key === "confirm" ? (
                  <button onClick={() => setPartsFolder(null)} className="flex items-center gap-2 text-base font-bold">
                    <ChevronLeft className="w-4 h-4" /> Confirm Part
                  </button>
                ) : partsFolder?.key === "custom" ? (
                  <button onClick={() => setPartsFolder(null)} className="flex items-center gap-2 text-base font-bold">
                    <ChevronLeft className="w-4 h-4" /> Custom Part
                  </button>
                ) : "Add Part"}
              </DialogTitle>
            </DialogHeader>

            {/* Category folder view */}
            {!partsFolder && (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {PART_CATEGORIES.map(cat => {
                  const knownKeys = PART_CATEGORIES.filter(c => c.key !== "other").map(c => c.key);
                  const catParts = cat.key === "other"
                    ? catalogParts.filter(p => !knownKeys.includes(p.category))
                    : catalogParts.filter(p => p.category === cat.key);
                  if (catParts.length === 0) return null;
                  return (
                    <button key={cat.key} onClick={() => setPartsFolder(cat)} className="w-full text-left">
                      <Card className="p-3 hover:border-primary/30 hover:bg-primary/5 transition-all active:scale-[0.99]">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <span className="text-lg">{cat.icon}</span>
                            <div>
                              <p className="text-sm font-semibold">{cat.label}</p>
                              <p className="text-xs text-muted-foreground">{catParts.length} part{catParts.length !== 1 ? "s" : ""}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </Card>
                    </button>
                  );
                })}
                <button onClick={() => setPartsFolder({ key: "custom", label: "Custom Part" })} className="w-full text-left">
                  <Card className="p-3 hover:border-primary/30 hover:bg-primary/5 transition-all border-dashed">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-lg">✏️</span>
                        <div>
                          <p className="text-sm font-semibold">Custom Part</p>
                          <p className="text-xs text-muted-foreground">Enter manually</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </Card>
                </button>
              </div>
            )}

            {/* Parts list within selected category */}
            {partsFolder && partsFolder.key !== "custom" && partsFolder.key !== "confirm" && (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {(() => {
                  const knownKeys = PART_CATEGORIES.filter(c => c.key !== "other").map(c => c.key);
                  const catParts = partsFolder.key === "other"
                    ? catalogParts.filter(p => !knownKeys.includes(p.category))
                    : catalogParts.filter(p => p.category === partsFolder.key);
                  return catParts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No {partsFolder.label} in catalog</p>
                  ) : catParts.map(p => (
                    <button key={p.id} onClick={() => {
                      setForm(f => ({ ...f, name: p.name, cost: p.cost, price: p.default_price, part_id: p.id, charge_for_part: true }));
                      setPartsFolder({ key: "confirm", label: "confirm", part: p });
                    }} className="w-full text-left">
                      <Card className="p-3 hover:border-primary/30 hover:bg-primary/5 transition-all active:scale-[0.99]">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{p.name}</p>
                            {p.part_number && <p className="text-xs text-muted-foreground">#{p.part_number}</p>}
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            {isMember ? (
                              <div>
                                <p className="text-sm font-bold text-emerald-600">{formatCurrency(Math.round(p.default_price * memberDiscountRate * 100) / 100)}</p>
                                <p className="text-[10px] text-muted-foreground line-through">{formatCurrency(p.default_price)}</p>
                              </div>
                            ) : (
                              <p className="text-sm font-bold text-primary">{formatCurrency(p.default_price)}</p>
                            )}
                            <p className="text-xs text-muted-foreground">{p.in_stock ?? 0} in stock</p>
                          </div>
                        </div>
                      </Card>
                    </button>
                  ));
                })()}
              </div>
            )}

            {/* Custom part entry form */}
            {partsFolder?.key === "custom" && (
              <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-0.5">
                <div>
                  <Label className="text-xs font-semibold">Part Name *</Label>
                  <Input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="mt-1 rounded-xl" placeholder="e.g. Oil Filter 90mm Extended" autoFocus />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Part Number</Label>
                  <Input value={form.part_number} onChange={e => setForm(f => ({...f, part_number: e.target.value}))} className="mt-1 rounded-xl font-mono text-sm" placeholder="e.g. 070185ES" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Description</Label>
                  <Input value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} className="mt-1 rounded-xl" placeholder="e.g. Fits Nexus 17-22kW standby units" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs font-semibold">Your Cost</Label>
                    <Input type="number" step="0.01" min="0" value={form.cost || ""} onChange={e => setForm(f => ({...f, cost: parseFloat(e.target.value) || 0}))} className="mt-1 rounded-xl" placeholder="0.00" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Sell Price</Label>
                    <Input type="number" step="0.01" min="0" value={form.price || ""} onChange={e => setForm(f => ({...f, price: parseFloat(e.target.value) || 0}))} className="mt-1 rounded-xl" placeholder="0.00" disabled={!form.charge_for_part} />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Qty</Label>
                    <Input type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({...f, quantity: parseInt(e.target.value) || 1}))} className="mt-1 rounded-xl" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-semibold">Category</Label>
                  <div className="grid grid-cols-3 gap-1.5 mt-1">
                    {PART_CATEGORIES.map(cat => (
                      <button key={cat.key} type="button" onClick={() => setForm(f => ({...f, category: cat.key}))}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-medium transition-colors ${form.category === cat.key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/40"}`}>
                        <span>{cat.icon}</span>
                        <span className="truncate">{cat.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <button type="button" onClick={() => setForm(f => ({...f, charge_for_part: !f.charge_for_part}))}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors ${form.charge_for_part ? "border-green-500 bg-green-50 text-green-700" : "border-border bg-muted/30 text-muted-foreground"}`}>
                  <span className="text-sm font-medium">Charge customer for this part</span>
                  <div className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${form.charge_for_part ? "bg-green-500" : "bg-muted-foreground/30"}`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${form.charge_for_part ? "translate-x-5" : "translate-x-0"}`} />
                  </div>
                </button>
                {isMember && form.charge_for_part && form.price > 0 && (
                  <p className="text-xs text-emerald-600 font-medium bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    🛡️ Member price: ${(Math.round(form.price * memberDiscountRate * 100) / 100).toFixed(2)} ({Math.round((1-memberDiscountRate)*100)}% off ${form.price.toFixed(2)})
                  </p>
                )}
                <button type="button" onClick={() => setForm(f => ({...f, save_to_catalog: !f.save_to_catalog}))}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors ${form.save_to_catalog ? "border-blue-400 bg-blue-50 text-blue-700" : "border-border bg-muted/30 text-muted-foreground"}`}>
                  <div className="text-left">
                    <p className="text-sm font-medium">Save to parts catalog</p>
                    <p className="text-xs opacity-75">Available for future jobs</p>
                  </div>
                  <div className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 shrink-0 ml-2 ${form.save_to_catalog ? "bg-blue-500" : "bg-muted-foreground/30"}`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${form.save_to_catalog ? "translate-x-5" : "translate-x-0"}`} />
                  </div>
                </button>
                {form.charge_for_part && form.price > 0 && (
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/30 rounded-xl">
                    <p className="text-xs text-muted-foreground">
                      {form.quantity} × ${isMember ? (Math.round(form.price * memberDiscountRate * 100) / 100).toFixed(2) : form.price.toFixed(2)}
                    </p>
                    <p className="text-sm font-bold">
                      Total: ${(form.quantity * (isMember ? Math.round(form.price * memberDiscountRate * 100) / 100 : form.price)).toFixed(2)}
                    </p>
                  </div>
                )}
                <Button onClick={handleAdd} className="w-full rounded-xl h-11 gap-2" disabled={createMutation.isPending || saveCatalogMutation.isPending}>
                  {createMutation.isPending ? "Adding..." : "Add Part to Job"}
                </Button>
              </div>
            )}

            {/* Confirm screen after selecting a catalog part */}
            {partsFolder?.key === "confirm" && (
              <div className="space-y-3">
                <Card className="p-3 bg-muted/30">
                  <p className="text-sm font-semibold">{form.name}</p>
                  <p className="text-xs text-muted-foreground">Selected from catalog</p>
                </Card>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Qty</Label><Input type="number" value={form.quantity} onChange={e => setForm(f => ({...f, quantity: parseInt(e.target.value) || 1}))} className="mt-1" /></div>
                  <div><Label className="text-xs">Price</Label><Input type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({...f, price: parseFloat(e.target.value) || 0}))} className="mt-1" disabled={!form.charge_for_part} /></div>
                </div>
                <button type="button" onClick={() => setForm(f => ({...f, charge_for_part: !f.charge_for_part}))}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors ${form.charge_for_part ? "border-green-500 bg-green-50 text-green-700" : "border-border bg-muted/30 text-muted-foreground"}`}>
                  <span className="text-sm font-medium">Charge for part</span>
                  <div className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${form.charge_for_part ? "bg-green-500" : "bg-muted-foreground/30"}`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${form.charge_for_part ? "translate-x-5" : "translate-x-0"}`} />
                  </div>
                </button>
                {isMember && form.charge_for_part && (
                 <p className="text-xs text-emerald-600 font-medium">🛡️ Member price: {formatCurrency(Math.round(form.price * memberDiscountRate * 100) / 100)} ({Math.round((1-memberDiscountRate)*100)}% off)</p>
                )}
                <Button onClick={handleAdd} className="w-full rounded-xl" disabled={createMutation.isPending}>Add to Job</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {parts.length === 0 ? (
        <Card className="p-6 text-center">
          <Package className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No parts added yet</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {parts.filter(p => !searchFilter || p.name?.toLowerCase().includes(searchFilter.toLowerCase())).map(part => (
            <Card key={part.id} className="p-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{part.name}</p>
                    {part.charge_for_part ? (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Charged</span>
                    ) : (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">No Charge</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {part.quantity}x{part.part_number ? ` · #${part.part_number}` : ""} · cost {formatCurrency(part.cost)}
                  </p>
                  {part.description && (
                    <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{part.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {editingPriceId === part.id ? (
                    <>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editingPriceValue}
                        onChange={e => setEditingPriceValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") commitPriceEdit(part);
                          if (e.key === "Escape") cancelPriceEdit();
                        }}
                        className="w-20 h-7 text-sm text-right px-2 rounded-lg"
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-green-600 hover:bg-green-50"
                        onClick={() => commitPriceEdit(part)}
                        disabled={updatePriceMutation.isPending}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground"
                        onClick={cancelPriceEdit}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="text-right">
                        <span className="text-sm font-semibold">{formatCurrency(part.total_price)}</span>
                        {overriddenPriceIds.has(part.id) && (
                          <p className="text-[10px] text-muted-foreground leading-none mt-0.5">edited</p>
                        )}
                      </div>
                      {part.charge_for_part !== false && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => startEditingPrice(part)}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { if (window.confirm(`Remove "${part.name}" from this job?`)) { deleteMutation.mutate(part.id); } }}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}