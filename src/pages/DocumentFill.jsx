import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { integrationsCore } from "@/lib/coreIntegrations";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Loader2, Camera } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import { toast } from "sonner";
import { debounce } from "lodash";
import { useAuth } from "@/lib/AuthContext";

const getUnit = (fieldId) => {
  if (fieldId.includes("voltage")) return "V";
  if (fieldId.includes("fuel_pressure")) return "IWC";
  return null;
};

export default function DocumentFill() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: doc, isLoading } = useQuery({
    queryKey: ["job-doc", id],
    queryFn: async () => { const r = await db.JobDocument.filter({ id }); return r[0]; },
  });

  const { data: job } = useQuery({
    queryKey: ["doc-job", doc?.job_id],
    queryFn: async () => {
      const r = await db.Job.filter({ id: doc.job_id });
      return r[0];
    },
    enabled: !!doc?.job_id,
  });

  const { data: customer } = useQuery({
    queryKey: ["doc-customer", job?.customer_id],
    queryFn: async () => {
      const r = await db.Customer.filter({ id: job.customer_id });
      return r[0];
    },
    enabled: !!job?.customer_id,
  });

  const [values, setValues] = useState({});
  const initialized = useRef(false);

  // Load existing field values once
  useEffect(() => {
    if (doc && !initialized.current) {
      setValues(doc.field_values || {});
      initialized.current = true;
    }
  }, [doc]);

  // Auto-fill based on field IDs once job + customer are loaded
  useEffect(() => {
    if (!initialized.current || !doc || !job || !customer) return;

    const fieldIdMap = {
      customer_name: customer?.name,
      service_address: customer?.address,
      customer_phone: customer?.phone,
      gen_model: customer?.generator_model,
      gen_serial: customer?.generator_serial,
      gen_install_date: customer?.generator_install_date,
      service_date: job?.scheduled_date
        ? job.scheduled_date.split("T")[0]
        : new Date().toISOString().split("T")[0],
    };

    setValues(prev => {
      const next = { ...prev };
      let changed = false;
      Object.entries(fieldIdMap).forEach(([fieldId, val]) => {
        if (!next[fieldId] && val) {
          next[fieldId] = val;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [job, customer, doc]);

  // Auto-fill technician name
  useEffect(() => {
    if (!user?.full_name) return;
    setValues(prev => {
      if (prev.tech_name) return prev;
      return { ...prev, tech_name: user.full_name };
    });
  }, [user]);

  const saveMutation = useMutation({
    mutationFn: (data) => db.JobDocument.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["job-doc", id] }),
  });

  const debouncedSave = useCallback(
    debounce((vals) => { saveMutation.mutate({ field_values: vals }); }, 1500),
    [id]
  );

  const updateValue = (fieldId, value) => {
    setValues(prev => {
      const next = { ...prev, [fieldId]: value };
      debouncedSave(next);
      return next;
    });
  };

  const handlePhotoUpload = async (fieldId, file) => {
    const { file_url } = await integrationsCore.UploadFile({ file });
    updateValue(fieldId, file_url);
    toast.success("Photo uploaded");
  };

  const handleSave = () => {
    debouncedSave.cancel();
    saveMutation.mutate({ field_values: values });
    toast.success("Checklist saved");
    if (doc?.job_id) navigate(`/jobs/${doc.job_id}`);
    else navigate(-1);
  };

  const handleComplete = () => {
    const fields = doc.field_definitions || [];
    const missing = fields.filter(f => f.required && f.type !== "section_header" && !values[f.id]);
    if (missing.length > 0) {
      toast.error(`Fill required fields: ${missing.map(f => f.label).join(", ")}`);
      return;
    }
    debouncedSave.cancel();
    saveMutation.mutate({ field_values: values, status: "completed", completed_date: new Date().toISOString() });
    toast.success("Document completed");
    if (doc?.job_id) navigate(`/jobs/${doc.job_id}`);
    else navigate(-1);
  };

  if (isLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!doc) return <div className="p-4 text-center">Document not found</div>;

  const fields = doc.field_definitions || [];

  // --- Helpers ---
  const renderInputField = (field) => {
    const unit = getUnit(field.id);
    if (field.type === "textarea") {
      return (
        <Card key={field.id} className="p-4">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
            {field.label}
            {field.required && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          <Textarea
            value={values[field.id] || ""}
            onChange={e => updateValue(field.id, e.target.value)}
            className="rounded-xl text-sm min-h-[100px] resize-none"
            placeholder={field.placeholder || ""}
          />
        </Card>
      );
    }
    if (field.type === "photo") {
      return (
        <Card key={field.id} className="px-4 py-3">
          <div className="flex items-center gap-3">
            <Label className="text-sm text-muted-foreground w-40 shrink-0">
              {field.label}
              {field.required && <span className="text-destructive ml-0.5">*</span>}
            </Label>
            <div className="flex-1">
              {values[field.id] ? (
                <div className="space-y-1">
                  <img src={values[field.id]} alt="Upload" className="w-full max-h-32 object-cover rounded-xl" />
                  <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => updateValue(field.id, "")}>Remove</Button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 h-16 border-2 border-dashed rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
                  <Camera className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Tap to capture</span>
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { if (e.target.files[0]) handlePhotoUpload(field.id, e.target.files[0]); }} />
                </label>
              )}
            </div>
          </div>
        </Card>
      );
    }
    if (field.type === "dropdown") {
      return (
        <Card key={field.id} className="px-4 py-3">
          <div className="flex items-center gap-3">
            <Label className="text-sm text-muted-foreground w-40 shrink-0">
              {field.label}
              {field.required && <span className="text-destructive ml-0.5">*</span>}
            </Label>
            <div className="flex-1">
              <Select value={values[field.id] || ""} onValueChange={v => updateValue(field.id, v)}>
                <SelectTrigger className="rounded-xl h-10 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {field.options?.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>
      );
    }
    // text, date, time, number
    return (
      <Card key={field.id} className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Label className="text-sm text-muted-foreground w-40 shrink-0">
            {field.label}
            {field.required && <span className="text-destructive ml-0.5">*</span>}
          </Label>
          <div className="flex-1">
            {field.type === "number" ? (
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  value={values[field.id] || ""}
                  onChange={e => updateValue(field.id, e.target.value)}
                  placeholder={field.placeholder}
                  className="rounded-xl h-10 text-base flex-1"
                />
                {unit && <span className="text-xs text-muted-foreground font-medium shrink-0">{unit}</span>}
              </div>
            ) : (
              <Input
                type={field.type === "text" ? "text" : field.type}
                value={values[field.id] || ""}
                onChange={e => updateValue(field.id, e.target.value)}
                placeholder={field.placeholder}
                className="rounded-xl h-10 text-base"
              />
            )}
          </div>
        </div>
      </Card>
    );
  };

  const renderCheckboxRow = (field) => {
    const checked = !!values[field.id];
    return (
      <div
        key={field.id}
        onClick={() => updateValue(field.id, !checked)}
        className={`flex items-center justify-between px-4 py-3.5 cursor-pointer transition-colors border-b last:border-b-0 ${
          checked ? "bg-green-50 dark:bg-green-950/30" : "bg-white dark:bg-card hover:bg-muted/40"
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {checked
            ? <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
            : <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/40 shrink-0" />
          }
          <span className={`text-sm ${checked ? "text-green-800 dark:text-green-300 font-medium" : "text-foreground"}`}>
            {field.label}
          </span>
          {field.required && !checked && (
            <span className="text-destructive text-xs">*</span>
          )}
        </div>
        {checked && (
          <span className="text-xs font-semibold text-green-600 shrink-0 ml-2">✓ Done</span>
        )}
      </div>
    );
  };

  // --- Build grouped sections ---
  const renderSections = () => {
    const output = [];
    let i = 0;

    while (i < fields.length) {
      const field = fields[i];

      if (field.type === "section_header") {
        const isCompletion = field.id === "section_completion";
        const sectionLabel = field.label;

        // Collect all fields in this section until next section_header
        const sectionFields = [];
        i++;
        while (i < fields.length && fields[i].type !== "section_header") {
          sectionFields.push(fields[i]);
          i++;
        }

        const checkboxFields = sectionFields.filter(f => f.type === "checkbox");
        const inputFields = sectionFields.filter(f => f.type !== "checkbox");
        const isInfoSection = field.id === "section_header" || field.id === "section_gen";

        if (isCompletion) {
          output.push(
            <div key={field.id} className="mt-4">
              <Card className="overflow-hidden border-2 border-primary/20">
                <div className="bg-primary/5 px-4 py-2.5 border-b border-primary/20">
                  <p className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Final Steps Before Leaving
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {checkboxFields.map(f => renderCheckboxRow(f))}
                </div>
              </Card>
              {inputFields.map(f => renderInputField(f))}
            </div>
          );
        } else if (isInfoSection) {
          output.push(
            <Card key={field.id} className="overflow-hidden mb-2">
              <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-4 py-3 border-b">
                <p className="text-xs font-bold uppercase tracking-widest text-primary">{sectionLabel}</p>
              </div>
              <div className="divide-y divide-border">
                {inputFields.map(f => (
                  <div key={f.id} className="px-4 py-3 flex items-center gap-3">
                    <Label className="text-sm text-muted-foreground w-40 shrink-0">
                      {f.label}
                      {f.required && <span className="text-destructive ml-0.5">*</span>}
                    </Label>
                    <div className="flex-1">
                      <Input
                        type={f.type === "text" ? "text" : f.type}
                        value={values[f.id] || ""}
                        onChange={e => updateValue(f.id, e.target.value)}
                        placeholder={f.placeholder}
                        className="rounded-xl h-10 text-base border-0 bg-transparent focus-visible:ring-0 p-0"
                      />
                    </div>
                  </div>
                ))}
                {checkboxFields.length > 0 && (
                  <div className="divide-y divide-border">
                    {checkboxFields.map(f => renderCheckboxRow(f))}
                  </div>
                )}
              </div>
            </Card>
          );
        } else {
          // Regular section
          output.push(
            <div key={field.id} className="space-y-2">
              <div className="flex items-center gap-3 mt-6 mb-1">
                <div className="h-5 w-1 rounded-full bg-primary shrink-0" />
                <p className="text-xs font-bold uppercase tracking-widest text-primary">{sectionLabel}</p>
              </div>
              {checkboxFields.length > 0 && (
                <Card className="overflow-hidden divide-y divide-border p-0">
                  {checkboxFields.map(f => renderCheckboxRow(f))}
                </Card>
              )}
              {inputFields.map(f => renderInputField(f))}
            </div>
          );
        }
      } else {
        // Orphan field (no section header)
        output.push(renderInputField(field));
        i++;
      }
    }
    return output;
  };

  // Progress bar
  const checkboxFields = fields.filter(f => f.type === "checkbox");
  const checkedCount = checkboxFields.filter(f => values[f.id]).length;
  const pct = checkboxFields.length > 0 ? (checkedCount / checkboxFields.length) * 100 : 0;

  return (
    <div className="pb-32">
      <PageHeader
        title={doc.template_name}
        back={doc.job_id ? `/jobs/${doc.job_id}` : -1}
        actions={<StatusBadge status={doc.status} />}
      />

      {/* Progress bar */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">Progress</span>
          <span className="text-xs font-semibold text-primary">{checkedCount}/{checkboxFields.length} items</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="p-4 space-y-2">
        {saveMutation.isPending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Saving...
          </div>
        )}
        {renderSections()}
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur border-t border-border safe-bottom z-50">
        {doc.status !== "completed" ? (
          <div className="flex gap-2 max-w-lg mx-auto">
            <Button
              type="button"
              variant="ghost"
              className="flex-1 rounded-xl h-12"
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              Save & Continue Later
            </Button>
            <Button
              type="button"
              className="flex-1 rounded-xl h-12 bg-green-600 hover:bg-green-700"
              onClick={handleComplete}
              disabled={saveMutation.isPending}
            >
              <CheckCircle2 className="w-4 h-4" /> Submit & Complete
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-xl h-12 max-w-lg mx-auto block"
            onClick={() => doc.job_id ? navigate(`/jobs/${doc.job_id}`) : navigate(-1)}
          >
            Back to Job
          </Button>
        )}
      </div>
    </div>
  );
}