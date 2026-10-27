import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LongTextField from "@/components/ui/LongTextField";
import { markDraftsSaved } from "@/lib/textDrafts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, BellOff, Clock } from "lucide-react";
import EstimatedLengthPicker from "@/components/jobs/EstimatedLengthPicker";
import { useAuth } from "@/lib/AuthContext";
import { usePreferences } from "@/hooks/usePreferences";
import { getUserDisplayName, getUserColor } from "@/lib/userColors";
import { formatCurrency } from "@/lib/utils/format";
import { DEFAULT_ESTIMATE_MINUTES, jobWithEstimate } from "@/lib/jobDuration";
import { withEstimate } from "@/lib/jobEstimateColumn";
import { afterJobScheduled } from "@/lib/jobCreate";
import { isPlaceholderJobTitle, quoteTitle } from "@/lib/quoteToJob";
import { SERVICE_TYPES, serviceTypePrefill } from "@/lib/jobTypes";
import { newRequestId, showSaveError, dismissSaveError, useSaveGuard } from "@/lib/saveSafety";
import { haptics } from "@/lib/haptics";
import { toast } from "sonner";

const TECHS = ["Jeremy", "Alex", "Derek", "Sean"];

// "YYYY-MM-DD" + "HH:MM" (device time, the business is ET) -> ISO, or null.
export function appointmentIso(date, time) {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * "Schedule this job" (B1). Opens right after a quote is approved, and from
 * the job screen of an approved job that isn't scheduled yet. The job row
 * already exists (created at Approve, with the quote's lines); this sheet
 * gives it its title (starts as the quote's title, Run 9 A4), a short
 * customer-facing description (starts blank, A2), service type, date,
 * arrival time, tech and estimated time on site, so opening it twice or
 * tapping twice never makes a second job.
 *
 * onDone("scheduled" | "later", job) — the caller closes the sheet / moves on.
 * from: "quote" (Create & … labels) or "job" (Schedule & … labels).
 */
export default function ScheduleJobSheet({ open, onOpenChange, job, customer: customerProp, from = "quote", onDone }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { use24h } = usePreferences();
  const guard = useSaveGuard();
  const invoiceId = useRef(newRequestId());

  const me = getUserDisplayName(user).split(" ")[0];
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [tech, setTech] = useState("");
  const [estimate, setEstimate] = useState(DEFAULT_ESTIMATE_MINUTES);
  const [description, setDescription] = useState("");
  const [title, setTitle] = useState("");
  const titleTouched = useRef(false);
  const [serviceType, setServiceType] = useState("");
  const typeTouched = useRef(false);
  const filledFor = useRef(null);
  const [filledId, setFilledId] = useState(null); // the description box restores drafts only after the prefill

  // Prefill once per job each time the sheet opens.
  useEffect(() => {
    if (!open || !job?.id) { if (!open) { filledFor.current = null; setFilledId(null); } return; }
    if (filledFor.current === job.id) return;
    filledFor.current = job.id;
    setDate("");
    setTime("09:00");
    setTech(job.assigned_to_name || (TECHS.includes(me) ? me : ""));
    setEstimate(Number(job.estimated_minutes) > 0 ? Number(job.estimated_minutes) : DEFAULT_ESTIMATE_MINUTES);
    setDescription(job.customer_description || "");
    titleTouched.current = false;
    setTitle(isPlaceholderJobTitle(job.title) ? "" : (job.title || ""));
    setFilledId(job.id);
    typeTouched.current = false;
    setServiceType(serviceTypePrefill(job.job_type, []));
  }, [open, job, me]);

  const jobId = job?.id;
  const { data: customerRow } = useQuery({
    queryKey: ["schedule-sheet-customer", job?.customer_id],
    queryFn: async () => (await db.Customer.filter({ id: job.customer_id }))[0] ?? null,
    enabled: open && !customerProp && !!job?.customer_id,
  });
  const customer = customerProp || customerRow;
  const { data: parts = [] } = useQuery({
    queryKey: ["job-parts", jobId],
    queryFn: () => db.JobPart.filter({ job_id: jobId }),
    enabled: open && !!jobId,
  });
  const { data: labor = [] } = useQuery({
    queryKey: ["job-labor", jobId],
    queryFn: () => db.JobLabor.filter({ job_id: jobId }),
    enabled: open && !!jobId,
  });
  // In the order they were quoted (created_at 1 ms apart since Run 9).
  const lines = [
    ...labor.map(l => ({ id: l.id, name: l.description, amount: Number(l.total_price) || 0, kind: "Labor", at: l.created_at })),
    ...parts.map(p => ({ id: p.id, name: p.name, amount: Number(p.total_price) || 0, kind: `Part · ×${p.quantity || 1}`, at: p.created_at })),
  ].sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
  // Lines load after the sheet opens: prefill the type from them once they
  // arrive, unless the tech already picked one (Run 7: never "Quote").
  const lineKey = lines.map(l => l.name).join("\n");
  useEffect(() => {
    if (!open || typeTouched.current) return;
    setServiceType(serviceTypePrefill(job?.job_type, lineKey.split("\n")));
  }, [open, job?.job_type, lineKey]);
  // A job approved before Run 9 still carries the "Quote Follow-up — …"
  // placeholder: offer the quote's title (its main line) instead.
  useEffect(() => {
    if (!open || titleTouched.current || !isPlaceholderJobTitle(job?.title)) return;
    setTitle(quoteTitle([
      ...labor.map(l => ({ description: l.description, created_at: l.created_at })),
      ...parts.map(p => ({ description: p.name, created_at: p.created_at })),
    ]));
  }, [open, job?.title, lineKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (sendConfirmation) => guard.run(async function scheduleIt() {
    const scheduled_date = appointmentIso(date, time);
    if (!title.trim()) { haptics.error(); toast.error("Give the job a title"); return; }
    if (!serviceType) { haptics.error(); toast.error("Pick the service type"); return; }
    if (!scheduled_date) { haptics.error(); toast.error("Pick a date and arrival time"); return; }
    if (sendConfirmation && !customer?.email) {
      haptics.error();
      toast.error(`No email on file for ${customer?.name || "this customer"} — use "${from === "job" ? "Schedule" : "Create"} & Skip Notification"`);
      return;
    }
    let saved;
    try {
      const payload = await withEstimate({
        scheduled_date,
        title: title.trim(),
        job_type: serviceType,
        assigned_to_name: tech || null,
        customer_description: description.trim() || null,
      }, estimate);
      saved = await db.Job.update(job.id, payload);
    } catch (e) {
      haptics.error();
      showSaveError("Job NOT scheduled", e, () => save(sendConfirmation), { id: "schedule-job-error" });
      return;
    }
    dismissSaveError("", { id: "schedule-job-error" });
    markDraftsSaved(`job:${job.id}:customer_description`);
    await afterJobScheduled({
      job: jobWithEstimate(saved, estimate),
      customer: customer || { name: saved.customer_name },
      sendConfirmation,
      use24h,
      triggeredBy: getUserDisplayName(user),
      invoiceId: invoiceId.current,
      isNew: true,
    });
    queryClient.invalidateQueries({ queryKey: ["jobs"] });
    queryClient.invalidateQueries({ queryKey: ["job", job.id] });
    haptics.light();
    toast.success("Job scheduled");
    onDone?.("scheduled", saved);
  });

  const verb = from === "job" ? "Schedule" : "Create";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!guard.busy) onOpenChange(v); }}>
      {/* A bottom sheet (Run 9, A3): its top is always below the status bar
          and above the keyboard, so it scrolls freely to the very top. One
          column that can't grow past the sheet (minmax(0,1fr)): an auto grid
          column took the width of its widest content (B1 sheet, F6). */}
      <DialogContent variant="sheet" className="gap-3 grid-cols-[minmax(0,1fr)]" data-testid="schedule-job-sheet">
        <DialogHeader className="text-left">
          <DialogTitle>Schedule this job</DialogTitle>
          <DialogDescription className="text-xs">{job?.customer_name}</DialogDescription>
        </DialogHeader>

        <div>
          <Label className="text-xs" htmlFor="sched-title">Job Title</Label>
          <Input id="sched-title" data-testid="schedule-sheet-title" value={title} enterKeyHint="done"
            onChange={e => { titleTouched.current = true; setTitle(e.target.value); }}
            placeholder="e.g. Main line breaker replacement" className="rounded-xl mt-1" />
        </div>

        {lines.length > 0 && (
          <div className="rounded-xl border border-border px-3 py-2 space-y-1" data-testid="schedule-sheet-lines">
            {lines.map(l => (
              <div key={l.id} className="flex items-start justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <p className="font-medium truncate">{l.name}</p>
                  <p className="text-[10px] text-muted-foreground">{l.kind}</p>
                </div>
                <span className="font-semibold shrink-0">{formatCurrency(l.amount)}</span>
              </div>
            ))}
          </div>
        )}

        <div>
          <Label className="text-xs" htmlFor="sched-type">Service Type</Label>
          <Select value={serviceType} onValueChange={(v) => { typeTouched.current = true; setServiceType(v); }}>
            <SelectTrigger id="sched-type" className="rounded-xl mt-1" data-testid="schedule-sheet-type">
              <SelectValue placeholder="Pick the service type" />
            </SelectTrigger>
            <SelectContent>
              {SERVICE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 form-row">
          <div className="min-w-0">
            <Label className="text-xs" htmlFor="sched-date">Date</Label>
            <Input id="sched-date" type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded-xl mt-1 min-w-0" />
          </div>
          <div className="min-w-0">
            <Label className="text-xs" htmlFor="sched-time">Arrival time</Label>
            <Input id="sched-time" type="time" value={time} onChange={e => setTime(e.target.value)} className="rounded-xl mt-1 min-w-0" />
          </div>
        </div>

        <div>
          <Label className="text-xs">Tech</Label>
          <div className="grid grid-cols-4 gap-2 mt-1">
            {TECHS.map(name => {
              const color = getUserColor(name);
              return (
                <button key={name} type="button" aria-pressed={tech === name} onClick={() => setTech(name)}
                  className={`h-10 rounded-xl border text-sm font-medium transition-colors ${tech === name ? `${color.border} ${color.bg} ${color.text}` : "border-border text-muted-foreground"}`}>
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        <EstimatedLengthPicker key={`${job?.id}-${open}`} value={estimate} onChange={setEstimate} />

        <div>
          <Label className="text-xs" htmlFor="sched-desc">Job Description (customer-facing)</Label>
          <div className="mt-1">
            <LongTextField
              id="sched-desc"
              value={description}
              onChange={setDescription}
              savedValue={job?.customer_description || ""}
              draftKey={job?.id ? `job:${job.id}:customer_description` : null}
              ready={open && !!job?.id && filledId === job.id}
              guard={false}
              title="Job Description"
              rows={5}
              placeholder="A short description of the job, in plain language"
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Starts blank (the Scope of Work stays on the quote) · included in the confirmation email</p>
        </div>

        <p className="text-xs text-muted-foreground" data-testid="schedule-sheet-recipient">
          {customer?.email ? <>Confirmation goes to <span className="font-medium text-foreground">{customer.email}</span></> : "No email on file — confirmation can't be sent"}
        </p>

        <div className="space-y-2 pt-1">
          <Button type="button" className="w-full rounded-xl gap-2 h-11" disabled={guard.busy || !customer?.email} onClick={() => save(true)}>
            {guard.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {verb} & Send Confirmation
          </Button>
          <Button type="button" variant="outline" className="w-full rounded-xl gap-2 h-11" disabled={guard.busy} onClick={() => save(false)}>
            {guard.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellOff className="w-4 h-4" />} {verb} & Skip Notification
          </Button>
          <Button type="button" variant="ghost" className="w-full rounded-xl gap-2 h-10 text-muted-foreground" disabled={guard.busy}
            onClick={() => onDone?.("later", job)}>
            <Clock className="w-4 h-4" /> Schedule later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
