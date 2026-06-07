import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, GripVertical, Save, Loader2 } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { toast } from "sonner";

const FIELD_TYPES = [
  { value: "text", label: "Short Text" },
  { value: "textarea", label: "Long Text" },
  { value: "checkbox", label: "Checkbox" },
  { value: "dropdown", label: "Dropdown" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "time", label: "Time" },
  { value: "photo", label: "Photo Upload" },
  { value: "signature", label: "Signature" },
];

const CATEGORIES = ["maintenance", "installation", "diagnostic", "inspection", "safety", "other"];

export default function DocumentTemplateForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = !!id;

  const [form, setForm] = useState({
    name: "", description: "", category: "maintenance",
    fields: [], job_types: [], is_active: true,
  });

  const { isLoading } = useQuery({
    queryKey: ["doc-template", id],
    queryFn: async () => {
      const r = await db.DocumentTemplate.filter({ id });
      if (r.length > 0) setForm(prev => ({ ...prev, ...r[0] }));
      return r[0];
    },
    enabled: isEdit,
  });

  const mutation = useMutation({
    mutationFn: (data) => isEdit
      ? db.DocumentTemplate.update(id, data)
      : db.DocumentTemplate.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["doc-templates"] });
      toast.success(isEdit ? "Template updated" : "Template created");
      navigate("/catalog");
    },
  });

  const addField = () => {
    setForm(prev => ({
      ...prev,
      fields: [...prev.fields, {
        id: `field_${Date.now()}`,
        label: "",
        type: "text",
        required: false,
        options: [],
      }],
    }));
  };

  const updateField = (index, key, value) => {
    const updated = [...form.fields];
    updated[index] = { ...updated[index], [key]: value };
    setForm(prev => ({ ...prev, fields: updated }));
  };

  const removeField = (index) => {
    setForm(prev => ({ ...prev, fields: prev.fields.filter((_, i) => i !== index) }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (form.fields.length === 0) { toast.error("Add at least one field"); return; }
    mutation.mutate(form);
  };

  if (isLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div>
      <PageHeader title={isEdit ? "Edit Template" : "New Template"} back="/documents" />

      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <Card className="p-4 space-y-3">
          <div><Label className="text-xs">Template Name *</Label><Input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="rounded-xl mt-1" placeholder="e.g. Maintenance Checklist" /></div>
          <div><Label className="text-xs">Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} className="rounded-xl mt-1" rows={2} /></div>
          <div><Label className="text-xs">Category</Label>
            <Select value={form.category} onValueChange={v => setForm(f => ({...f, category: v}))}>
              <SelectTrigger className="rounded-xl mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </Card>

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Fields ({form.fields.length})</h3>
          <Button type="button" size="sm" variant="outline" className="rounded-xl gap-1 text-xs" onClick={addField}>
            <Plus className="w-3 h-3" /> Add Field
          </Button>
        </div>

        <div className="space-y-3">
          {form.fields.map((field, i) => (
            <Card key={field.id} className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                <Input
                  value={field.label}
                  onChange={e => updateField(i, "label", e.target.value)}
                  placeholder="Field label"
                  className="flex-1 text-sm"
                />
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeField(i)}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Select value={field.type} onValueChange={v => updateField(i, "type", v)}>
                  <SelectTrigger className="flex-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{FIELD_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <Label className="text-xs">Req</Label>
                  <Switch checked={field.required} onCheckedChange={v => updateField(i, "required", v)} />
                </div>
              </div>
              {field.type === "dropdown" && (
                <Input
                  value={field.options?.join(", ") || ""}
                  onChange={e => updateField(i, "options", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
                  placeholder="Options (comma separated)"
                  className="text-xs"
                />
              )}
            </Card>
          ))}
        </div>

        {form.fields.length === 0 && (
          <Card className="p-6 text-center">
            <p className="text-sm text-muted-foreground">No fields yet. Add fields to build your template.</p>
          </Card>
        )}

        <Button type="submit" className="w-full rounded-xl gap-2 h-12" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isEdit ? "Save Template" : "Create Template"}
        </Button>
      </form>
    </div>
  );
}