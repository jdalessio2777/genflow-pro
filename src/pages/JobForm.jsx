import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { goBack } from "@/hooks/useBack";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { integrationsCore } from "@/lib/coreIntegrations";
import { confirmationEmailHTML } from "@/lib/emailTemplates";
import { usePreferences } from "@/hooks/usePreferences";
import { toDatetimeLocalValue } from "@/lib/formatTime";
import { useAuth } from "@/lib/AuthContext";
import { getUserDisplayName, getUserColor } from "@/lib/userColors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import PageHeader from "@/components/layout/PageHeader";
import { Save, Loader2, Send, BellOff } from "lucide-react";
import { toast } from "sonner";
import { haptics } from "@/lib/haptics";
import { notifyTeam, buildTable, buildRow, buildEventBadge } from "@/lib/notifyTeam";
import { createCalendarEvent, updateCalendarEvent } from "@/lib/googleCalendar";
import { newRequestId, createOnce, showSaveError, dismissSaveError } from "@/lib/saveSafety";

const JOB_TYPES = [
  { value: "maintenance",         label: "Maintenance" },
  { value: "diagnostic_repair",   label: "Diagnostic/Repair" },
  { value: "emergency",           label: "Emergency" },
  { value: "battery_replacement", label: "Battery Replacement" },
  { value: "warranty",            label: "Warranty" },
  { value: "quote",               label: "Quote" },
  { value: "other",               label: "Other" },
];

export default function JobForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const isEdit = !!id;
  const urlParams = new URLSearchParams(window.location.search);
  const preCustomer = urlParams.get("customer");
  const { user, googleToken } = useAuth();
  const { use24h } = usePreferences();

  const [form, setForm] = useState({
    customer_id: preCustomer || "",
    customer_name: "",
    title: "",
    job_type: "maintenance",
    status: "scheduled",
    scheduled_date: "",
    estimated_duration: "",
    notes: "",
    customer_description: "",
    generator_notes: "",
    quote_notes: "",
    requires_document: false,
    assigned_to: "",
    assigned_to_name: "",
  });

  useEffect(() => {
    if (!isEdit && user) {
      const name = getUserDisplayName(user);
      setForm(prev => ({ ...prev, assigned_to: user.email, assigned_to_name: name }));
    }
  }, [user, isEdit]);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => db.Customer.list("name"),
  });

  // Fill the form ONCE from the saved job. A refetch (signal coming back,
  // any invalidate) must never overwrite what the tech has typed (A-04).
  const { data: savedJobRow, isLoading: loadingJob } = useQuery({
    queryKey: ["job", id],
    queryFn: async () => (await db.Job.filter({ id }))[0] ?? null,
    enabled: isEdit,
  });
  const formLoaded = useRef(false);
  const [formFilled, setFormFilled] = useState(!isEdit);
  useEffect(() => {
    if (!isEdit || formLoaded.current || !savedJobRow) return;
    formLoaded.current = true;
    setForm(prev => ({ ...prev, ...savedJobRow }));
    setFormFilled(true);
  }, [isEdit, savedJobRow]);

  // Fixed ids for this New Job screen: a Retry after a lost response finds the
  // job/invoice it already created instead of making duplicates (A-03/F-05).
  const createIds = useRef({ job: newRequestId(), invoice: newRequestId() });
  const inFlight = useRef(false);

  useEffect(() => {
    if (preCustomer && customers.length > 0) {
      const c = customers.find(c => c.id === preCustomer);
      if (c) setForm(prev => ({ ...prev, customer_name: c.name }));
    }
  }, [preCustomer, customers]);

  const JOB_FIELDS = new Set([
    'customer_id', 'customer_name', 'title', 'job_type', 'status',
    'scheduled_date', 'notes', 'customer_description', 'generator_notes', 'quote_notes',
    'requires_document', 'assigned_to_name', 'calendar_event_id', 'last_synced_at',
  ]);
  const nullableFields = ['scheduled_date', 'last_synced_at'];
  const cleanPayload = (data) =>
    Object.fromEntries(
      Object.entries(data)
        .filter(([k]) => JOB_FIELDS.has(k))
        .map(([k, v]) => {
          if (k === 'customer_description') return [k, (v ?? '').trim() || null];
          return [k, nullableFields.includes(k) && v === '' ? null : v];
        })
    );

  // The customer comes from the database by id when the list hasn't loaded
  // yet (slow signal), so a job is never saved with a blank name (KF-1).
  const resolveCustomer = async (customerId) => {
    const listed = customers.find(c => c.id === customerId);
    if (listed) return listed;
    const rows = await db.Customer.filter({ id: customerId });
    if (!rows[0]) throw new Error("Customer not found");
    return rows[0];
  };

  const mutation = useMutation({
    mutationFn: async ({ data }) => {
      const jobCustomer = await resolveCustomer(data.customer_id);
      const payload = cleanPayload({ ...data, customer_name: jobCustomer.name });
      const savedJob = isEdit
        ? await db.Job.update(id, payload)
        : await createOnce(db.Job, createIds.current.job, payload);
      return { savedJob, jobCustomer };
    },
    onSuccess: async ({ savedJob, jobCustomer }, { sendConfirmation }) => {
      dismissSaveError("Job NOT saved");
      if (!isEdit) {
        try {
          await createOnce(db.Invoice, createIds.current.invoice, {
            job_id: savedJob.id,
            customer_id: savedJob.customer_id,
            customer_name: savedJob.customer_name,
            invoice_number: `INV-${Date.now().toString(36).toUpperCase()}`,
            parts_total: 0, labor_total: 0, total: 0,
            line_items: [], notes: "", status: "draft",
          });
        } catch (e) {
          // The job is saved; Collect Payment creates the invoice later if needed.
          toast.warning(`Job saved, but its draft invoice wasn't created yet: ${e.message}`);
        }
        notifyTeam({
          subject: `New Job — ${form.title} · ${jobCustomer.name}`,
          body: `
            <p style="font-size:14px;color:#1a1a1a;margin:0 0 4px 0;">${buildEventBadge("New Job Created", "blue")}</p>
            ${buildTable([
              buildRow("Customer", jobCustomer.name),
              buildRow("Job", form.title),
              buildRow("Type", form.job_type),
              buildRow("Assigned To", form.assigned_to_name || "Unassigned"),
              buildRow("Scheduled", form.scheduled_date ? new Date(form.scheduled_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""),
            ])}
          `,
          triggeredBy: getUserDisplayName(user),
        });

        // The only other confirmation-send path is JobDetail's "Resend
        // Confirmation Email" banner (fix #4) — nothing else fires this email.
        if (sendConfirmation) {
          if (!jobCustomer?.email) {
            toast.error(`No email on file for ${jobCustomer?.name || "this customer"} — confirmation not sent`);
            await db.Job.update(savedJob.id, { confirmation_send_failed: true }).catch(() => {});
          } else {
            try {
              const techFirstName = (savedJob.assigned_to_name || "").split(" ")[0] || "our technician";
              await integrationsCore.SendEmailWithRetry({
                to: jobCustomer.email,
                subject: `Appointment Confirmed — GenShield Generator Service`,
                html: confirmationEmailHTML({ customer: jobCustomer, job: savedJob, techFirstName, use24h }),
              });
              await db.Job.update(savedJob.id, { confirmation_sent_at: new Date().toISOString(), confirmation_send_failed: false });
              toast.success(`Confirmation sent to ${jobCustomer.name}`);
            } catch (e) {
              toast.error(`Failed to send confirmation email: ${e.message}`);
              await db.Job.update(savedJob.id, { confirmation_send_failed: true }).catch(() => {});
            }
          }
        }
      }

      // Calendar sync — non-fatal, runs after job is saved
      if (savedJob.scheduled_date && googleToken) {
        const customer = jobCustomer;
        try {
          const calendarPromise = savedJob.calendar_event_id
            ? updateCalendarEvent(savedJob.calendar_event_id, savedJob, customer, googleToken)
            : createCalendarEvent(savedJob, customer, googleToken);
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Calendar sync timed out')), 5000)
          );
          const eventId = await Promise.race([calendarPromise, timeoutPromise]);
          await db.Job.update(savedJob.id, {
            calendar_event_id: eventId,
            last_synced_at: new Date().toISOString(),
          });
          toast.success("Synced to Google Calendar", { duration: 2000 });
        } catch (e) {
          if (e?.message?.startsWith('401')) {
            toast.warning("Please sign out and sign back in to refresh your Google connection");
          } else {
            toast.warning("Job saved — Google Calendar sync failed");
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["job", savedJob.id] });
      if (!isEdit) haptics.light();
      toast.success(isEdit ? "Job updated" : "Job created");
      // Create: replace the form with the new job; edit: pop back to the job.
      // The finished form never reappears on back (F-06).
      if (isEdit) goBack(navigate, location, `/jobs/${id}`);
      else navigate(`/jobs/${savedJob.id}`, { replace: true });
    },
    onError: (error, variables) => {
      haptics.error();
      // Persistent, with Retry; the form keeps everything that was typed.
      showSaveError("Job NOT saved", error, () => submit(variables));
    },
  });

  // One save at a time — a ref, so even two taps in the same tick can't both start.
  const submit = (variables) => {
    if (inFlight.current) return;
    inFlight.current = true;
    mutation.mutate(variables, { onSettled: () => { inFlight.current = false; } });
  };

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleCustomerChange = (customerId) => {
    // The picker reports "" while its list is still loading; never let that
    // wipe the job's customer (found in batch-1 verification on slow signal).
    if (!customerId) return;
    const c = customers.find(c => c.id === customerId);
    setForm(prev => ({ ...prev, customer_id: customerId, customer_name: c?.name || "" }));
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!form.customer_id) { haptics.error(); toast.error("Select a customer"); return; }
    if (!form.title.trim()) { haptics.error(); toast.error("Title is required"); return; }
    submit({ data: form, sendConfirmation: false });
  };

  const handleCreate = (sendConfirmation) => {
    if (!form.customer_id) { haptics.error(); toast.error("Select a customer"); return; }
    if (!form.title.trim()) { haptics.error(); toast.error("Title is required"); return; }
    if (sendConfirmation && !form.scheduled_date) {
      haptics.error();
      toast.error('Set a scheduled date/time first, or use "Create & Skip Notification"');
      return;
    }
    submit({ data: form, sendConfirmation });
  };

  if (loadingJob || !formFilled) return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div>
      <PageHeader title={isEdit ? "Edit Job" : "New Job"} back />

      <form onSubmit={isEdit ? handleSave : (e) => e.preventDefault()} className="p-4 space-y-4">
        <Card className="p-4 space-y-4">
          <div>
            <Label className="text-xs">Customer *</Label>
            <Select value={form.customer_id} onValueChange={handleCustomerChange}>
              <SelectTrigger className="rounded-xl mt-1"><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>
                {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Title *</Label>
            <Input value={form.title} onChange={e => update("title", e.target.value)} className="rounded-xl mt-1" placeholder="e.g. Annual maintenance" />
          </div>
          <div>
            <Label className="text-xs">Job Type</Label>
            <Select value={form.job_type} onValueChange={v => update("job_type", v)}>
              <SelectTrigger className="rounded-xl mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {JOB_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Assigned To</Label>
            <div className="grid grid-cols-4 gap-2 mt-1">
              {["Jeremy", "Alex", "Derek", "Sean"].map(name => {
                const color = getUserColor(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => update("assigned_to_name", name)}
                    className={`p-2.5 rounded-xl border text-sm font-medium transition-colors ${
                      form.assigned_to_name === name
                        ? `${color.border} ${color.bg} ${color.text}`
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
          {isEdit && (
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={v => update("status", v)}>
                <SelectTrigger className="rounded-xl mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["scheduled", "in_progress", "completed", "invoiced", "canceled"].map(s =>
                    <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">Scheduled Date/Time</Label>
            <Input
              type="datetime-local"
              value={toDatetimeLocalValue(form.scheduled_date)}
              onChange={e => update("scheduled_date", e.target.value ? new Date(e.target.value).toISOString() : "")}
              className="rounded-xl mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Estimated Duration</Label>
            <Select value={form.estimated_duration || ""} onValueChange={v => update("estimated_duration", v)}>
              <SelectTrigger className="rounded-xl mt-1">
                <SelectValue placeholder="How long will this take?" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0.5">30 minutes</SelectItem>
                <SelectItem value="1">1 hour</SelectItem>
                <SelectItem value="1.5">1.5 hours</SelectItem>
                <SelectItem value="2">2 hours</SelectItem>
                <SelectItem value="3">3 hours</SelectItem>
                <SelectItem value="4">4 hours</SelectItem>
                <SelectItem value="6">6 hours</SelectItem>
                <SelectItem value="8">Full day (8 hours)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Job Description (customer-facing)</Label>
            <Textarea
              value={form.customer_description || ""}
              onChange={e => update("customer_description", e.target.value)}
              className="rounded-xl mt-1"
              rows={3}
              placeholder="What we'll be doing, in plain language for the customer (e.g. oil & filter change, battery load test)"
            />
            <p className="text-xs text-muted-foreground mt-1">Optional — included in the appointment confirmation email</p>
          </div>
          <div>
            <Label className="text-xs">Internal Notes (not shown to customer)</Label>
            <Textarea value={form.notes} onChange={e => update("notes", e.target.value)} className="rounded-xl mt-1" rows={3} />
          </div>
          <div>
            <Label className="text-xs flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
              Generator Notes (tech only)
            </Label>
            <Textarea
              value={form.generator_notes || ""}
              onChange={e => update("generator_notes", e.target.value)}
              className="rounded-xl mt-1 border-blue-200 bg-blue-50/30"
              rows={2}
              placeholder="e.g. Overcrank fault cleared · Battery at 11.8V · Oil dark · Coolant level low"
            />
            <p className="text-xs text-muted-foreground mt-1">Internal only — not shown to customer</p>
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Require completed document before finishing</Label>
            <Switch checked={form.requires_document} onCheckedChange={v => update("requires_document", v)} />
          </div>
        </Card>

        {isEdit ? (
          <Button type="submit" className="w-full rounded-xl gap-2 h-12" disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </Button>
        ) : (
          <div className="space-y-2">
            <Button type="button" className="w-full rounded-xl gap-2 h-12" disabled={mutation.isPending} onClick={() => handleCreate(true)}>
              {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Create & Send Confirmation
            </Button>
            <Button type="button" variant="outline" className="w-full rounded-xl gap-2 h-12" disabled={mutation.isPending} onClick={() => handleCreate(false)}>
              {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellOff className="w-4 h-4" />}
              Create & Skip Notification
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}