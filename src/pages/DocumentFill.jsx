import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { supabase } from "@/lib/supabaseClient";
import { integrationsCore } from "@/lib/coreIntegrations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Loader2, Camera, Printer } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import { toast } from "sonner";
import { debounce } from "lodash";
import { useAuth } from "@/lib/AuthContext";

// ── Style constants ────────────────────────────────────────────────────────────

const S = {
  label: {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#888",
    marginBottom: 4,
  },
  input: {
    background: "#fff",
    borderColor: "#ddd",
    color: "#111",
  },
  inputPreFilled: {
    background: "#f0f8ff",
    borderColor: "#b8d4e8",
    color: "#111",
  },
  sectionHeader: {
    borderLeft: "3px solid #CC2200",
    paddingLeft: 10,
    marginTop: 24,
    marginBottom: 8,
    paddingBottom: 6,
    borderBottom: "1px solid #e5e7eb",
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "#CC2200",
  },
  checkRow: (checked) => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 14px",
    cursor: "pointer",
    borderBottom: "1px solid #f0f0f0",
    backgroundColor: checked ? "#f0fdf4" : "#fff",
    transition: "background 0.1s",
  }),
};

const getUnit = (fieldId) => {
  if (fieldId.includes("voltage")) return "V";
  if (fieldId.includes("fuel_pressure")) return "IWC";
  return null;
};

// ── DocumentFill ──────────────────────────────────────────────────────────────

export default function DocumentFill() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: doc, isLoading } = useQuery({
    queryKey: ["job-doc", id],
    queryFn: async () => { const r = await db.JobDocument.filter({ id }); return r[0]; },
  });

  const { data: job } = useQuery({
    queryKey: ["doc-job", doc?.job_id],
    queryFn: async () => { const r = await db.Job.filter({ id: doc.job_id }); return r[0]; },
    enabled: !!doc?.job_id,
  });

  const { data: customer } = useQuery({
    queryKey: ["doc-customer", job?.customer_id],
    queryFn: async () => { const r = await db.Customer.filter({ id: job.customer_id }); return r[0]; },
    enabled: !!job?.customer_id,
  });

  // Look up exercise_datetime from the most recent completed doc for this customer
  const { data: prevExerciseTime } = useQuery({
    queryKey: ["prev-exercise", job?.customer_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("job_documents")
        .select("field_values, completed_date")
        .eq("customer_id", job.customer_id)
        .eq("status", "completed")
        .order("completed_date", { ascending: false })
        .limit(20);
      const found = (data || []).find(d => d.field_values?.exercise_datetime);
      return found?.field_values?.exercise_datetime ?? null;
    },
    enabled: !!job?.customer_id,
  });

  // ── State ──────────────────────────────────────────────────────────────────

  const [values, setValues] = useState({});
  const initialized = useRef(false);
  const preFilledFields = useRef(new Set());

  // Load saved field values once on mount
  useEffect(() => {
    if (doc && !initialized.current) {
      setValues(doc.field_values || {});
      initialized.current = true;
    }
  }, [doc]);

  // Auto-fill from customer/job — non-destructive (never overwrites existing values)
  useEffect(() => {
    if (!initialized.current || !doc || !job || !customer) return;

    const fillMap = {
      // New template field IDs
      customer_name:          customer.name,
      customer_address:       customer.address,
      customer_phone:         customer.phone,
      customer_email:         customer.email,
      generator_brand:        customer.generator_brand,
      generator_kw:           customer.generator_kw != null ? String(customer.generator_kw) : undefined,
      generator_model:        customer.generator_model,
      generator_serial:       customer.generator_serial,
      generator_install_date: customer.generator_install_date,
      date_of_service:        new Date().toISOString().split("T")[0],
      // Legacy field IDs (old templates)
      service_address:        customer.address,
      gen_model:              customer.generator_model,
      gen_serial:             customer.generator_serial,
      gen_install_date:       customer.generator_install_date,
      service_date:           job.scheduled_date
        ? job.scheduled_date.split("T")[0]
        : new Date().toISOString().split("T")[0],
    };

    setValues(prev => {
      const next = { ...prev };
      let changed = false;
      for (const [fieldId, val] of Object.entries(fillMap)) {
        if (!next[fieldId] && val) {
          next[fieldId] = val;
          preFilledFields.current.add(fieldId);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [job, customer, doc]);

  // Auto-fill exercise_datetime from previous completed doc
  useEffect(() => {
    if (!initialized.current || !prevExerciseTime) return;
    setValues(prev => {
      if (prev.exercise_datetime) return prev;
      preFilledFields.current.add("exercise_datetime");
      return { ...prev, exercise_datetime: prevExerciseTime };
    });
  }, [prevExerciseTime]);

  // Auto-fill tech name
  useEffect(() => {
    if (!user?.full_name) return;
    setValues(prev => {
      if (prev.tech_name) return prev;
      preFilledFields.current.add("tech_name");
      return { ...prev, tech_name: user.full_name };
    });
  }, [user]);

  // ── Mutations & save ───────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: (data) => db.JobDocument.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["job-doc", id] }),
  });

  const debouncedSave = useCallback(
    debounce((vals) => { saveMutation.mutate({ field_values: vals }); }, 1500),
    [id]
  );

  const updateValue = (fieldId, value) => {
    preFilledFields.current.delete(fieldId);
    setValues(prev => {
      const next = { ...prev, [fieldId]: value };
      debouncedSave(next);
      return next;
    });
  };

  // Reverse sync: write generator fields back to the customer record if currently empty
  const syncToCustomer = (savedValues) => {
    if (!customer) return;
    const SYNC_MAP = {
      generator_brand:        "generator_brand",
      generator_kw:           "generator_kw",
      generator_model:        "generator_model",
      generator_serial:       "generator_serial",
      generator_install_date: "generator_install_date",
    };
    const updates = {};
    for (const [fieldId, col] of Object.entries(SYNC_MAP)) {
      const formVal = savedValues[fieldId];
      if (formVal && !customer[col]) updates[col] = formVal;
    }
    if (Object.keys(updates).length > 0) {
      db.Customer.update(customer.id, updates)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["doc-customer", customer.id] });
          toast.success("Customer record updated");
        })
        .catch(e => console.warn("[DocumentFill] Customer sync failed:", e.message));
    }
  };

  const handlePhotoUpload = async (fieldId, file) => {
    const { file_url } = await integrationsCore.UploadFile({ file });
    updateValue(fieldId, file_url);
    toast.success("Photo uploaded");
  };

  const handleSave = () => {
    debouncedSave.cancel();
    saveMutation.mutate({ field_values: values });
    syncToCustomer(values);
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
    syncToCustomer(values);
    toast.success("Document completed");
    if (doc?.job_id) navigate(`/jobs/${doc.job_id}`);
    else navigate(-1);
  };

  // ── Early returns ──────────────────────────────────────────────────────────

  if (isLoading) return (
    <div className="flex items-center justify-center h-40">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  );
  if (!doc) return <div className="p-4 text-center">Document not found</div>;

  const fields = doc.field_definitions || [];
  const isPreFilled = (fieldId) => preFilledFields.current.has(fieldId);

  // ── Render helpers ─────────────────────────────────────────────────────────

  const inputStyle = (fieldId) => ({
    ...S.input,
    ...(isPreFilled(fieldId) ? S.inputPreFilled : {}),
  });

  const renderInputField = (field) => {
    const unit = getUnit(field.id);

    if (field.type === "textarea") {
      return (
        <div key={field.id} style={{ marginBottom: 12 }}>
          <label style={S.label}>
            {field.label}{field.required && <span style={{ color: "#CC2200", marginLeft: 2 }}>*</span>}
          </label>
          <Textarea
            value={values[field.id] || ""}
            onChange={e => updateValue(field.id, e.target.value)}
            className="text-sm min-h-[100px] resize-none rounded-xl"
            style={inputStyle(field.id)}
            placeholder={field.placeholder || ""}
          />
        </div>
      );
    }

    if (field.type === "photo") {
      return (
        <div key={field.id} style={{ marginBottom: 12 }}>
          <label style={S.label}>
            {field.label}{field.required && <span style={{ color: "#CC2200", marginLeft: 2 }}>*</span>}
          </label>
          {values[field.id] ? (
            <div className="space-y-1">
              <img src={values[field.id]} alt="Upload" className="w-full max-h-32 object-cover rounded-xl" />
              <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => updateValue(field.id, "")}>Remove</Button>
            </div>
          ) : (
            <label
              className="flex items-center justify-center gap-2 h-16 border-2 border-dashed rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              style={{ borderColor: "#ddd" }}
            >
              <Camera className="w-5 h-5 text-gray-400" />
              <span className="text-sm text-gray-400">Tap to capture</span>
              <input type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { if (e.target.files[0]) handlePhotoUpload(field.id, e.target.files[0]); }} />
            </label>
          )}
        </div>
      );
    }

    if (field.type === "dropdown") {
      return (
        <div key={field.id} style={{ marginBottom: 12 }}>
          <label style={S.label}>
            {field.label}{field.required && <span style={{ color: "#CC2200", marginLeft: 2 }}>*</span>}
          </label>
          <Select value={values[field.id] || ""} onValueChange={v => updateValue(field.id, v)}>
            <SelectTrigger className="rounded-xl h-10 text-sm" style={inputStyle(field.id)}>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      );
    }

    // text, date, time, number
    return (
      <div key={field.id} style={{ marginBottom: 12 }}>
        <label style={S.label}>
          {field.label}{field.required && <span style={{ color: "#CC2200", marginLeft: 2 }}>*</span>}
        </label>
        <div style={unit ? { display: "flex", alignItems: "center", gap: 6 } : {}}>
          <Input
            type={field.type === "text" ? "text" : field.type}
            value={values[field.id] || ""}
            onChange={e => updateValue(field.id, e.target.value)}
            placeholder={field.placeholder}
            className="rounded-xl h-10 text-base flex-1"
            style={inputStyle(field.id)}
          />
          {unit && <span style={{ fontSize: 11, color: "#888", fontWeight: 500, flexShrink: 0 }}>{unit}</span>}
        </div>
      </div>
    );
  };

  const renderCheckboxRow = (field) => {
    const checked = !!values[field.id];
    return (
      <div key={field.id} style={S.checkRow(checked)} onClick={() => updateValue(field.id, !checked)}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          {checked
            ? <CheckCircle2 style={{ width: 20, height: 20, color: "#16a34a", flexShrink: 0 }} />
            : <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid #ccc", flexShrink: 0 }} />
          }
          <span style={{ fontSize: 14, color: checked ? "#15803d" : "#111", fontWeight: checked ? 500 : 400 }}>
            {field.label}
          </span>
          {field.required && !checked && <span style={{ color: "#CC2200", fontSize: 11 }}>*</span>}
        </div>
        {checked && <span style={{ fontSize: 12, fontWeight: 600, color: "#16a34a", flexShrink: 0, marginLeft: 8 }}>✓</span>}
      </div>
    );
  };

  // Group part_number_X / part_desc_X pairs into side-by-side columns
  const renderInputFields = (inputFields) => {
    const output = [];
    const usedIds = new Set();

    for (const field of inputFields) {
      if (usedIds.has(field.id)) continue;

      const numMatch = field.id.match(/^part_number_(\d+)$/);
      if (numMatch) {
        const descId = `part_desc_${numMatch[1]}`;
        const descField = inputFields.find(f => f.id === descId);
        if (descField) {
          usedIds.add(field.id);
          usedIds.add(descId);
          output.push(
            <div key={field.id} style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8, marginBottom: 12 }}>
              <div>
                <label style={S.label}>{field.label}</label>
                <Input type="text" value={values[field.id] || ""}
                  onChange={e => updateValue(field.id, e.target.value)}
                  placeholder="Part #" className="rounded-xl h-10 text-sm" style={S.input} />
              </div>
              <div>
                <label style={S.label}>{descField.label}</label>
                <Input type="text" value={values[descId] || ""}
                  onChange={e => updateValue(descId, e.target.value)}
                  placeholder="Description" className="rounded-xl h-10 text-sm" style={S.input} />
              </div>
            </div>
          );
          continue;
        }
      }

      output.push(renderInputField(field));
    }
    return output;
  };

  // ── Section builder ────────────────────────────────────────────────────────

  // date_of_service is shown in the branding header, not in the body
  const dateFieldValue = values["date_of_service"] || values["service_date"];
  const bodyFields = fields.filter(f => f.id !== "date_of_service" && f.id !== "service_date");

  const renderSections = () => {
    const output = [];
    let i = 0;

    while (i < bodyFields.length) {
      const field = bodyFields[i];

      if (field.type === "section_header") {
        const sectionId = field.id;
        const sectionLabel = field.label;
        const isCompletion = sectionId === "section_completion";

        const sectionFields = [];
        i++;
        while (i < bodyFields.length && bodyFields[i].type !== "section_header") {
          sectionFields.push(bodyFields[i]);
          i++;
        }

        const checkboxFields = sectionFields.filter(f => f.type === "checkbox");
        const inputFields = sectionFields.filter(f => f.type !== "checkbox");

        output.push(
          <div key={sectionId}>
            <div style={{ ...S.sectionHeader, ...(isCompletion ? { borderColor: "#16a34a" } : {}) }}>
              <p style={{ ...S.sectionLabel, ...(isCompletion ? { color: "#16a34a" } : {}) }}>
                {isCompletion ? "Final Steps Before Leaving" : sectionLabel}
              </p>
            </div>
            {checkboxFields.length > 0 && (
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", marginBottom: 8 }}>
                {checkboxFields.map(f => renderCheckboxRow(f))}
              </div>
            )}
            {renderInputFields(inputFields)}
          </div>
        );
      } else {
        output.push(renderInputField(field));
        i++;
      }
    }
    return output;
  };

  // Progress bar (checkboxes only)
  const checkboxFields = fields.filter(f => f.type === "checkbox");
  const checkedCount = checkboxFields.filter(f => values[f.id]).length;
  const pct = checkboxFields.length > 0 ? (checkedCount / checkboxFields.length) * 100 : 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f5f5f5" }} className="pb-32">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .pb-32 { padding-bottom: 0 !important; }
        }
      `}</style>

      <div className="no-print">
        <PageHeader
          title={doc.template_name}
          back={doc.job_id ? `/jobs/${doc.job_id}` : -1}
          actions={<StatusBadge status={doc.status} />}
        />
      </div>

      {/* GenShield branding header */}
      <div style={{ backgroundColor: "#0D1014", borderBottom: "3px solid #CC2200", padding: "14px 16px 12px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: 20, fontWeight: 700, letterSpacing: "0.05em", lineHeight: 1 }}>
                <span style={{ color: "#C8CDD5" }}>Gen</span><span style={{ color: "#E03010" }}>Shield</span>
              </div>
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "#68788C", marginTop: 2, marginBottom: 6 }}>
                Standby Generator Service &amp; Repair
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{doc.template_name}</div>
            </div>
            {/* Date of service — top-right of header (Step 6) */}
            {dateFieldValue && (
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 9, color: "#68788C", textTransform: "uppercase", letterSpacing: "0.12em" }}>Date of Service</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#C8CDD5", marginTop: 2 }}>{dateFieldValue}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {checkboxFields.length > 0 && (
        <div className="px-4 pt-3 pb-1 no-print">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">Progress</span>
            <span className="text-xs font-semibold text-primary">{checkedCount}/{checkboxFields.length}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {/* Form body */}
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "12px 16px 0" }}>
        {saveMutation.isPending && (
          <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 py-1 no-print">
            <Loader2 className="w-3 h-3 animate-spin" /> Saving...
          </div>
        )}
        <div style={{ backgroundColor: "#fff", borderRadius: 8, padding: "16px 16px 8px", border: "1px solid #e5e7eb" }}>
          {renderSections()}
        </div>
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur border-t border-border safe-bottom z-50 no-print">
        {doc.status !== "completed" ? (
          <div className="flex gap-2 max-w-lg mx-auto">
            <Button type="button" variant="ghost" className="flex-1 rounded-xl h-12"
              onClick={handleSave} disabled={saveMutation.isPending}>
              Save & Continue Later
            </Button>
            <Button type="button" className="flex-1 rounded-xl h-12 bg-green-600 hover:bg-green-700"
              onClick={handleComplete} disabled={saveMutation.isPending}>
              <CheckCircle2 className="w-4 h-4 mr-1" /> Submit & Complete
            </Button>
          </div>
        ) : (
          <div className="flex gap-2 max-w-lg mx-auto">
            <Button type="button" variant="outline" className="flex-1 rounded-xl h-12"
              onClick={() => doc.job_id ? navigate(`/jobs/${doc.job_id}`) : navigate(-1)}>
              Back to Job
            </Button>
            <Button type="button" variant="outline" className="rounded-xl h-12 px-4"
              onClick={() => window.print()}>
              <Printer className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
