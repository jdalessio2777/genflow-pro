import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Package, Trash2 } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { formatCurrency } from "@/lib/utils/format";
import { toast } from "sonner";

const CATEGORIES = ["filter", "oil", "spark_plug", "battery", "belt", "gasket", "electrical", "coolant", "hardware", "other"];

export default function Parts() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", part_number: "", cost: 0, default_price: 0, category: "other", in_stock: 0 });

  const { data: parts = [], isLoading } = useQuery({
    queryKey: ["parts-catalog"],
    queryFn: () => base44.entities.Part.list("name"),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Part.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parts-catalog"] });
      setOpen(false);
      setForm({ name: "", part_number: "", cost: 0, default_price: 0, category: "other", in_stock: 0 });
      toast.success("Part added to catalog");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Part.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parts-catalog"] });
      toast.success("Part removed");
    },
  });

  const filtered = parts.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.part_number?.toLowerCase().includes(search.toLowerCase())
  );

  const margin = (p) => p.default_price > 0 ? ((p.default_price - p.cost) / p.default_price * 100).toFixed(0) : 0;

  return (
    <div>
      <PageHeader
        title="Parts Catalog"
        subtitle={`${parts.length} parts`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-xl gap-1.5"><Plus className="w-4 h-4" /> Add</Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>New Part</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label className="text-xs">Name *</Label><Input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="mt-1" /></div>
                <div><Label className="text-xs">Part Number</Label><Input value={form.part_number} onChange={e => setForm(f => ({...f, part_number: e.target.value}))} className="mt-1" /></div>
                <div><Label className="text-xs">Category</Label>
                  <Select value={form.category} onValueChange={v => setForm(f => ({...f, category: v}))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c.replace("_", " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Cost</Label><Input type="number" step="0.01" value={form.cost} onChange={e => setForm(f => ({...f, cost: parseFloat(e.target.value) || 0}))} className="mt-1" /></div>
                  <div><Label className="text-xs">Default Price</Label><Input type="number" step="0.01" value={form.default_price} onChange={e => setForm(f => ({...f, default_price: parseFloat(e.target.value) || 0}))} className="mt-1" /></div>
                </div>
                <div><Label className="text-xs">In Stock</Label><Input type="number" value={form.in_stock} onChange={e => setForm(f => ({...f, in_stock: parseInt(e.target.value) || 0}))} className="mt-1" /></div>
                <Button onClick={() => { if (!form.name) { toast.error("Name required"); return; } createMutation.mutate(form); }} className="w-full rounded-xl" disabled={createMutation.isPending}>Add Part</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search parts..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 rounded-xl" />
        </div>

        {filtered.length === 0 && !isLoading ? (
          <EmptyState icon={Package} title="No parts yet" description="Add parts to your catalog for quick job billing" />
        ) : (
          <div className="space-y-2">
            {filtered.map(part => (
              <Card key={part.id} className="p-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{part.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {part.part_number && `#${part.part_number} · `}
                      {part.category?.replace("_", " ")} · {margin(part)}% margin
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatCurrency(part.default_price)}</p>
                      <p className="text-xs text-muted-foreground">cost {formatCurrency(part.cost)}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteMutation.mutate(part.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}