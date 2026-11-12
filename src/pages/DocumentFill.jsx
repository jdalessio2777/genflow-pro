import { useState, useEffect, useRef, useCallback } from "react";
import { StoredImage } from "@/lib/storageUrls";
import { useParams } from "react-router-dom";
import { useBack } from "@/hooks/useBack";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { supabase } from "@/lib/supabaseClient";
import { usePhotoUpload } from "@/hooks/usePhotoUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LongTextField from "@/components/ui/LongTextField";
import { shouldShowCheckAll } from "@/lib/checklistCheckAll";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Loader2, Camera, ImagePlus, Printer } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import { toast } from "sonner";
import { debounce } from "lodash";
import { useAuth } from "@/lib/AuthContext";
import DateField from "@/components/ui/DateField";
import { formatDate } from "@/lib/utils/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  generatorFor, generatorsOf, generatorSummary, generatorFieldValue, generatorChanges, generatorPatch,
  GENERATOR_FIELD_IDS, MAIN_GENERATOR_ID,
} from "@/lib/generatorInfo";

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

function CheckAllButton({ allChecked, onClick, label, testId, wide = false }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`no-print shrink-0 inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-xl border text-sm font-semibold active:opacity-60 ${
        allChecked ? "border-border bg-card text-muted-foreground" : "border-green-600 bg-green-50 text-green-700"
      } ${wide ? "w-full mt-3" : ""}`}
    >
      <CheckCircle2 className="w-4 h-4" /> {label}
    </button>
  );
}

// ── DocumentFill ──────────────────────────────────────────────────────────────

export default function DocumentFill() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: doc, isLoading } = useQuery({
    queryKey: ["job-doc", id],
    queryFn: async () => { const r = await db.JobDocument.filter({ id }); return r[0]; },
  });

  // Save / Complete / Back pop to the screen the checklist was opened from
  // (its job), or replace with the job when opened directly.
  const goBack = useBack(doc?.job_id ? `/jobs/${doc.job_id}` : undefined);

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
  // Correcting a completed checklist: nothing changes until Edit is tapped.
  const [editing, setEditing] = useState(false);
  const [showSent, setShowSent] = useState(false);
  const initialized = useRef(false);
  const [valuesReady, setValuesReady] = useState(false); // notes drafts restore after the saved values are in
  const preFilledFields = useRef(new Set());
  const { uploading: photoUploading, handleFileChange: handlePhotoFileChange } = usePhotoUpload({
    errorMessage: "Photo upload failed",
  });

  // Load saved field values once on mount
  useEffect(() => {
    if (doc && !initialized.current) {
      setValues(doc.field_values || {});
      initialized.current = true;
      setValuesReady(true);
    }
  }, [doc]);

  // Auto-fill from customer/job — non-destructive (never overwrites existing
  // values). A completed checklist is a record of what it showed: never touched.
  const isDone = doc?.status === "completed";
  const jobGenerator = generatorFor(customer, job);
  useEffect(() => {
    if (!initialized.current || !doc || !job || !customer || isDone) return;

    const fillMap = {
      // New template field IDs
      customer_name:          customer.name,
      customer_address:       customer.address,
      customer_phone:         customer.phone,
      customer_email:         customer.email,
      date_of_service:        new Date().toISOString().split("T")[0],
      // Legacy field IDs (old templates)
      service_address:        customer.address,
      service_date:           job.scheduled_date
        ? job.scheduled_date.split("T")[0]
        : new Date().toISOString().split("T")[0],
    };
    // Generator boxes on this checklist, from the record of the generator this
    // visit is for (A4).
    for (const f of doc.field_definitions || []) {
      const key = GENERATOR_FIELD_IDS[f.id];
      if (key) fillMap[f.id] = generatorFieldValue(jobGenerator, key);
    }

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
  }, [job, customer, doc]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill exercise_datetime from previous completed doc
  useEffect(() => {
    if (!initialized.current || !prevExerciseTime || isDone) return;
    setValues(prev => {
      if (prev.exercise_datetime) return prev;
      preFilledFields.current.add("exercise_datetime");
      return { ...prev, exercise_datetime: prevExerciseTime };
    });
  }, [prevExerciseTime]);

  // Auto-fill tech name
  useEffect(() => {
    if (!user?.full_name || isDone) return;
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
    onError: (err) => toast.error("Failed to save document: " + err.message),
  });

  const debouncedSave = useCallback(
    debounce((vals) => { saveMutation.mutate({ field_values: vals }); }, 1500),
    [id]
  );

  const updateValue = (fieldId, value) => {
    preFilledFields.current.delete(fieldId);
    setValues(prev => {
      const next = { ...prev, [fieldId]: value };
      if (doc?.status !== "completed") debouncedSave(next); // a correction saves only on Save Changes
      return next;
    });
  };

  // "Check all" / "Uncheck all" (Run 8, B1: every checklist type, while it
  // is being filled out): one tap sets every checkbox item of the checklist or
  // of one section, saved like any other change.
  const setAllChecks = (fieldIds, checked) => {
    setValues(prev => {
      const next = { ...prev };
      for (const fid of fieldIds) next[fid] = checked;
      debouncedSave(next);
      return next;
    });
  };

  // ── Saving back to the customer's generator record (A4) ──────────────────
  // An empty saved field is filled silently; a different saved value is asked
  // about first, one question at a time, and the checklist is finished after the
  // last answer. Only the generator fields are in the map (generatorChanges), so
  // run hours, voltages and notes stay on this visit's checklist.
  const [question, setQuestion] = useState(null); // { conflicts, index, customer, generator, finish }

  const writeGenerator = async (customerRow, generatorId, updates) => {
    if (!Object.keys(updates).length) return customerRow;
    const saved = await db.Customer.update(customerRow.id, generatorPatch(customerRow, generatorId, updates));
    queryClient.invalidateQueries({ queryKey: ["doc-customer", customerRow.id] });
    queryClient.invalidateQueries({ queryKey: ["customer", customerRow.id] });
    queryClient.invalidateQueries({ queryKey: ["customers"] });
    return saved || customerRow;
  };

  // The checklist's values with the generator boxes run through `finish` once
  // every question has an answer.
  const syncThenFinish = async (savedValues, finish) => {
    if (!customer) { finish(savedValues); return; }
    try {
      // Fresh copy: another tech may have corrected the record since this opened.
      const rows = await db.Customer.filter({ id: customer.id });
      const fresh = rows[0] || customer;
      const generator = generatorFor(fresh, job);
      // Correcting an old checklist: only what was changed now counts. An old value
      // left alone must not look like a correction to today's record.
      const relevant = (doc.field_definitions || []).filter(f => !isDone || savedValues[f.id] !== doc.field_values?.[f.id]);
      const { fills, conflicts } = generatorChanges(relevant, savedValues, generator);
      const updated = await writeGenerator(fresh, generator.id, fills);
      if (Object.keys(fills).length) toast.success("Customer record updated");
      if (conflicts.length) {
        setQuestion({ conflicts, index: 0, customer: updated, generatorId: generator.id, values: savedValues, finish });
        return;
      }
    } catch (e) {
      toast.error(`Checklist saved, but the customer record wasn't updated: ${e.message}`);
    }
    finish(savedValues);
  };

  const answerQuestion = async (update) => {
    const { conflicts, index, generatorId, finish } = question;
    const conflict = conflicts[index];
    let { customer: customerRow, values: current } = question;
    if (update) {
      try {
        customerRow = await writeGenerator(customerRow, generatorId, {
          [conflict.key]: conflict.key === "kw" ? Number(conflict.to) : conflict.to,
        });
        toast.success("Customer record updated");
      } catch (e) {
        toast.error(`Customer record NOT updated: ${e.message}`);
      }
    } else {
      // Keep saved: the saved value is the right one, so the checklist shows it too.
      current = { ...current };
      for (const fid of conflict.fieldIds) current[fid] = conflict.from;
      setValues(current);
    }
    if (index + 1 < conflicts.length) {
      setQuestion({ ...question, index: index + 1, customer: customerRow, values: current });
      return;
    }
    setQuestion(null);
    finish(current);
  };

  // A customer with more than one generator: which one this visit is for. The
  // boxes the tech hasn't touched follow the choice.
  const pickGenerator = async (generatorId) => {
    const nextId = generatorId === MAIN_GENERATOR_ID ? null : generatorId;
    try {
      await db.Job.update(job.id, { generator_id: nextId });
    } catch (e) {
      toast.error(`Generator not changed: ${e.message}`);
      return;
    }
    queryClient.setQueryData(["doc-job", doc.job_id], { ...job, generator_id: nextId });
    queryClient.invalidateQueries({ queryKey: ["job", job.id] });
    const picked = generatorFor(customer, { generator_id: nextId });
    setValues(prev => {
      const next = { ...prev };
      for (const f of doc.field_definitions || []) {
        const key = GENERATOR_FIELD_IDS[f.id];
        if (key && (preFilledFields.current.has(f.id) || !next[f.id])) {
          next[f.id] = generatorFieldValue(picked, key);
          preFilledFields.current.add(f.id);
        }
      }
      debouncedSave(next);
      return next;
    });
  };

  const handleSave = () => {
    debouncedSave.cancel();
    syncThenFinish(values, (finalValues) => {
      saveMutation.mutate({ field_values: finalValues });
      toast.success("Checklist saved");
      goBack();
    });
  };

  // Save a correction. The version the customer was sent stays as it was (the
  // first edit of an older checklist keeps its values as that version), the
  // checklist is marked Edited, and nothing is emailed.
  const handleSaveEdit = () => {
    const fields = doc.field_definitions || [];
    const missing = fields.filter(f => f.required && f.type !== "section_header" && !values[f.id]);
    if (missing.length > 0) {
      toast.error(`Fill required fields: ${missing.map(f => f.label).join(", ")}`);
      return;
    }
    syncThenFinish(values, (finalValues) => {
      saveMutation.mutate({
        field_values: finalValues,
        edited_at: new Date().toISOString(),
        ...(doc.emailed_field_values ? {} : { emailed_field_values: doc.field_values || {} }),
      });
      setEditing(false);
      toast.success("Changes saved. Nothing was emailed.");
    });
  };

  const cancelEdit = () => {
    setValues(doc.field_values || {});
    setEditing(false);
  };

  const handleComplete = () => {
    const fields = doc.field_definitions || [];
    const missing = fields.filter(f => f.required && f.type !== "section_header" && !values[f.id]);
    if (missing.length > 0) {
      toast.error(`Fill required fields: ${missing.map(f => f.label).join(", ")}`);
      return;
    }
    debouncedSave.cancel();
    syncThenFinish(values, (finalValues) => {
      saveMutation.mutate({ field_values: finalValues, status: "completed", completed_date: new Date().toISOString() });
      toast.success("Document completed");
      goBack();
    });
  };

  // ── Early returns ──────────────────────────────────────────────────────────

  if (isLoading) return (
    <div className="flex items-center justify-center h-40">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  );
  if (!doc) return <div className="p-4 text-center">Document not found</div>;

  const fields = doc.field_definitions || [];
  const filling = !isDone;
  const locked = isDone && !editing;
  const allGenerators = generatorsOf(customer);
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
          {/* Autosaves (1.5 s); the local draft covers a crash before that. */}
          <LongTextField
            value={values[field.id] || ""}
            onChange={v => updateValue(field.id, v)}
            savedValue={doc.field_values?.[field.id] || ""}
            draftKey={`doc:${id}:${field.id}`}
            ready={valuesReady}
            guard={false}
            title={field.label}
            rows={5}
            disabled={locked}
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
              <StoredImage src={values[field.id]} alt="Upload" className="w-full max-h-32 object-cover rounded-xl" />
              {!locked && <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => updateValue(field.id, "")}>Remove</Button>}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <label
                className={`flex items-center justify-center gap-1.5 h-14 border-2 border-dashed rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${photoUploading ? "opacity-50 pointer-events-none" : ""}`}
                style={{ borderColor: "#ddd" }}
              >
                {photoUploading
                  ? <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                  : <Camera className="w-4 h-4 text-gray-400" />
                }
                <span className="text-sm text-gray-400">{photoUploading ? "Uploading..." : "Camera"}</span>
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => handlePhotoFileChange(e, {
                    onUploaded: (file_url) => updateValue(field.id, file_url),
                    successMessage: "Photo uploaded",
                  })} />
              </label>
              <label
                className={`flex items-center justify-center gap-1.5 h-14 border-2 border-dashed rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${photoUploading ? "opacity-50 pointer-events-none" : ""}`}
                style={{ borderColor: "#ddd" }}
              >
                <ImagePlus className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-400">Gallery</span>
                <input type="file" accept="image/*" className="hidden"
                  onChange={e => handlePhotoFileChange(e, {
                    onUploaded: (file_url) => updateValue(field.id, file_url),
                    successMessage: "Photo uploaded",
                  })} />
              </label>
            </div>
          )}
        </div>
      );
    }

    if (field.type === "date" || field.type === "time") {
      return (
        <div key={field.id} style={{ marginBottom: 12 }}>
          <label style={S.label}>
            {field.label}{field.required && <span style={{ color: "#CC2200", marginLeft: 2 }}>*</span>}
          </label>
          <DateField
            type={field.type}
            value={values[field.id] || ""}
            onChange={v => updateValue(field.id, v)}
            clearable={!field.required && !locked}
            disabled={locked}
            data-testid={`field-${field.id}`}
            className="rounded-xl h-10 text-base"
            style={inputStyle(field.id)}
          />
        </div>
      );
    }

    if (field.type === "dropdown") {
      // A saved value that isn't one of the options (typed on an older
      // checklist) still shows and stays selected.
      const savedOption = values[field.id] && !field.options?.includes(values[field.id]) ? [values[field.id]] : [];
      return (
        <div key={field.id} style={{ marginBottom: 12 }}>
          <label style={S.label}>
            {field.label}{field.required && <span style={{ color: "#CC2200", marginLeft: 2 }}>*</span>}
          </label>
          <Select value={values[field.id] || ""} onValueChange={v => updateValue(field.id, v)} disabled={locked}>
            <SelectTrigger className="rounded-xl h-10 text-sm" style={inputStyle(field.id)} data-testid={`field-${field.id}`}>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {[...savedOption, ...(field.options || [])].map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
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
            disabled={locked}
            data-testid={`field-${field.id}`}
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
      <div key={field.id} style={S.checkRow(checked)} onClick={() => { if (!locked) updateValue(field.id, !checked); }}>
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
                <Input type="text" disabled={locked} value={values[field.id] || ""}
                  onChange={e => updateValue(field.id, e.target.value)}
                  placeholder="Part #" className="rounded-xl h-10 text-sm" style={S.input} />
              </div>
              <div>
                <label style={S.label}>{descField.label}</label>
                <Input type="text" disabled={locked} value={values[descId] || ""}
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

        const sectionAllChecked = checkboxFields.length > 0 && checkboxFields.every(f => values[f.id]);
        output.push(
          <div key={sectionId}>
            <div style={{ ...S.sectionHeader, ...(isCompletion ? { borderColor: "#16a34a" } : {}), display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <p style={{ ...S.sectionLabel, ...(isCompletion ? { color: "#16a34a" } : {}) }}>
                {isCompletion ? "Final Steps Before Leaving" : sectionLabel}
              </p>
              {filling && checkboxFields.length > 1 && (
                <CheckAllButton
                  testId={`check-all-${sectionId}`}
                  allChecked={sectionAllChecked}
                  onClick={() => setAllChecks(checkboxFields.map(f => f.id), !sectionAllChecked)}
                  label={sectionAllChecked ? "Uncheck section" : "Check section"}
                />
              )}
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
  const allChecked = checkboxFields.length > 0 && checkedCount === checkboxFields.length;
  // Every checklist type, only while it is being filled out (never on the
  // completed copy; the print hides it too, and the PDF/email are built from
  // the saved values, not this screen). Run 4 showed it only when the name
  // matched "Annual Maintenance", as small text at the very top (B1).
  const showCheckAll = shouldShowCheckAll(doc, checkboxFields.length);

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
          back={doc.job_id ? `/jobs/${doc.job_id}` : true}
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
            <span className="flex items-center gap-3">
              <span className="text-xs font-semibold text-primary">{checkedCount}/{checkboxFields.length}</span>
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
          {showCheckAll && (
            <CheckAllButton
              testId="check-all"
              wide
              allChecked={allChecked}
              onClick={() => setAllChecks(checkboxFields.map(f => f.id), !allChecked)}
              label={allChecked ? "Uncheck all" : `Check all ${checkboxFields.length} item${checkboxFields.length === 1 ? "" : "s"}`}
            />
          )}
        </div>
      )}

      {/* Form body */}
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "12px 16px 0" }}>
        {doc.edited_at && (
          <div className="no-print flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 mb-3 text-xs text-amber-900" data-testid="doc-edited-banner">
            <span>Edited {formatDate(doc.edited_at)}</span>
            {doc.emailed_field_values && (
              <button type="button" className="min-h-11 px-1 font-medium underline underline-offset-2" data-testid="doc-show-sent" onClick={() => setShowSent(true)}>
                View original version
              </button>
            )}
          </div>
        )}
        {filling && allGenerators.length > 1 && job && (
          <div className="no-print" style={{ marginBottom: 12 }} data-testid="doc-generator-picker">
            <label style={S.label}>Which generator is this visit for?</label>
            <Select value={jobGenerator.id} onValueChange={pickGenerator}>
              <SelectTrigger className="rounded-xl h-10 text-sm" style={S.input}><SelectValue /></SelectTrigger>
              <SelectContent>
                {allGenerators.map(g => <SelectItem key={g.id} value={g.id}>{[g.label, generatorSummary(g)].filter(Boolean).join(" — ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {saveMutation.isPending && (
          <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 py-1 no-print">
            <Loader2 className="w-3 h-3 animate-spin" /> Saving...
          </div>
        )}
        <div style={{ backgroundColor: "#fff", borderRadius: 8, padding: "16px 16px 8px", border: "1px solid #e5e7eb" }}>
          {renderSections()}
        </div>
      </div>

      {/* Saved generator info differs from what was entered: ask first (A4). */}
      <Dialog open={!!question} onOpenChange={(open) => { if (!open) answerQuestion(false); }}>
        <DialogContent className="max-w-sm" data-testid="generator-update-dialog">
          {question && (() => {
            const c = question.conflicts[question.index];
            return (
              <>
                <DialogHeader className="text-left">
                  <DialogTitle>Update customer record?</DialogTitle>
                  <DialogDescription data-testid="generator-update-question">
                    Update this customer's {c.label} from {c.from} to {c.to}?
                  </DialogDescription>
                </DialogHeader>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1 rounded-xl h-11" data-testid="generator-keep" onClick={() => answerQuestion(false)}>Keep saved</Button>
                  <Button type="button" className="flex-1 rounded-xl h-11" data-testid="generator-update" onClick={() => answerQuestion(true)}>Update</Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* The version from before any correction: read-only. */}
      <Dialog open={showSent} onOpenChange={setShowSent}>
        <DialogContent variant="sheet" data-testid="doc-sent-version">
          <DialogHeader className="text-left">
            <DialogTitle>Original version</DialogTitle>
            <DialogDescription>What this checklist said before it was edited. Corrections never change it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1 text-sm">
            {fields.filter(f => f.type !== "section_header" && f.type !== "photo" && doc.emailed_field_values?.[f.id]).map(f => (
              <p key={f.id}><span className="text-muted-foreground">{f.label}:</span> {f.type === "checkbox" ? "Yes" : String(doc.emailed_field_values[f.id])}</p>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Sticky footer */}
      <div data-fixed-bottom="" className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border safe-bottom z-50 no-print">
        {doc.status !== "completed" ? (
          <div className="flex gap-2 max-w-lg mx-auto">
            {/* min-w-0 + wrapping: on a 320 px iPhone SE the two labels didn't fit
                and "Submit & Complete" was cut off at the edge (Run 8). */}
            <Button type="button" variant="ghost" className="flex-1 min-w-0 rounded-xl h-12 px-2 whitespace-normal leading-tight"
              onClick={handleSave} disabled={saveMutation.isPending}>
              Save for Later
            </Button>
            <Button type="button" className="flex-1 min-w-0 rounded-xl h-12 px-2 whitespace-normal leading-tight bg-green-600 hover:bg-green-700"
              onClick={handleComplete} disabled={saveMutation.isPending}>
              <CheckCircle2 className="w-4 h-4 mr-1 shrink-0" /> Submit & Complete
            </Button>
          </div>
        ) : editing ? (
          <div className="flex gap-2 max-w-lg mx-auto">
            <Button type="button" variant="ghost" className="flex-1 min-w-0 rounded-xl h-12" onClick={cancelEdit} data-testid="doc-edit-cancel">Cancel</Button>
            <Button type="button" className="flex-1 min-w-0 rounded-xl h-12" onClick={handleSaveEdit} disabled={saveMutation.isPending} data-testid="doc-edit-save">Save Changes</Button>
          </div>
        ) : (
          <div className="flex gap-2 max-w-lg mx-auto">
            <Button type="button" variant="outline" className="flex-1 rounded-xl h-12"
              onClick={goBack}>
              Back to Job
            </Button>
            <Button type="button" variant="outline" className="rounded-xl h-12 px-4" onClick={() => setEditing(true)} data-testid="doc-edit">
              Edit
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
