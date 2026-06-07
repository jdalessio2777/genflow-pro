import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
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
import { Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { notifyTeam, buildTable, buildRow, buildEventBadge } from "@/lib/notifyTeam";
import { createCalendarEvent, updateCalendarEvent } from "@/lib/googleCalendar";

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
  const queryClient = useQueryClient();
  const isEdit = !!id;
  const urlParams = new URLSearchParams(window.location.search);
  const preCustomer = urlParams.get("customer");
  const { user, googleToken } = useAuth();

  const [form, setForm] = useState({
    customer_id: preCustomer || "",
    customer_name: "",
    title: "",
    job_type: "maintenance",
    status: "quote",
    scheduled_date: "",
    estimated_duration: "",
    notes: "",
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

  const { isLoading: loadingJob } = useQuery({
    queryKey: ["job", id],
    queryFn: async () => {
      const res = await db.Job.filter({ id });
      if (res.length > 0) setForm(prev => ({ ...prev, ...res[0] }));
      return res[0];
    },
    enabled: isEdit,
  });

  useEffect(() => {
    if (preCustomer && customers.length > 0) {
      const c = customers.find(c => c.id === preCustomer);
      if (c) setForm(prev => ({ ...prev, customer_name: c.name }));
    }
  }, [preCustomer, customers]);

  const JOB_FIELDS = new Set([
    'customer_id', 'customer_name', 'title', 'job_type', 'status',
    'scheduled_date', 'notes', 'generator_notes', 'quote_notes',
    'requires_document', 'assigned_to_name', 'calendar_event_id', 'last_synced_at',
  ]);
  const cleanPayload = (data) =>
    Object.fromEntries(Object.entries(data).filter(([k]) => JOB_FIELDS.has(k)));

  const mutation = useMutation({
    mutationFn: (data) => isEdit
      ? db.Job.update(id, cleanPayload(data))
      : db.Job.create(cleanPayload(data)),
    onSuccess: async (savedJob) => {
      if (!isEdit) {
        try {
          await db.Invoice.create({
            job_id: savedJob.id,
            customer_id: savedJob.customer_id,
            customer_name: savedJob.customer_name,
            invoice_number: `INV-${Date.now().toString(36).toUpperCase()}`,
            parts_total: 0, labor_total: 0, total: 0,
            line_items: [], notes: "", status: "draft",
          });
        } catch (e) { /* silently fail */ }
        notifyTeam({
          subject: `New Job — ${form.title} · ${form.customer_name}`,
          body: `
            <p style="font-size:14px;color:#1a1a1a;margin:0 0 4px 0;">${buildEventBadge("New Job Created", "blue")}</p>
            ${buildTable([
              buildRow("Customer", form.customer_name),
              buildRow("Job", form.title),
              buildRow("Type", form.job_type),
              buildRow("Assigned To", form.assigned_to_name || "Unassigned"),
              buildRow("Scheduled", form.scheduled_date ? new Date(form.scheduled_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""),
            ])}
          `,
          triggeredBy: getUserDisplayName(user),
        });
      }

      // Calendar sync — non-fatal, runs after job is saved
      if (savedJob.scheduled_date && googleToken) {
        const customer = customers.find(c => c.id === savedJob.customer_id);
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
      toast.success(isEdit ? "Job updated" : "Job created");
      navigate(isEdit ? `/jobs/${id}` : `/jobs/${savedJob.id}`);
    },
    onError: (error) => {
      toast.error('Failed to save job: ' + (error.message || 'Unknown error'));
    },
  });

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleCustomerChange = (customerId) => {
    const c = customers.find(c => c.id === customerId);
    setForm(prev => ({ ...prev, customer_id: customerId, customer_name: c?.name || "" }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.customer_id) { toast.error("Select a customer"); return; }
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    mutation.mutate(form);
  };

  if (loadingJob) return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div>
      <PageHeader title={isEdit ? "Edit Job" : "New Job"} back={isEdit ? `/jobs/${id}` : "/jobs"} />

      <form onSubmit={handleSubmit} className="p-4 space-y-4">
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
                  {["quote", "quote_sent", "scheduled", "in_progress", "completed", "invoiced", "canceled"].map(s =>
                    <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">Scheduled Date/Time</Label>
            <Input type="datetime-local" value={form.scheduled_date?.slice(0, 16) || ""} onChange={e => update("scheduled_date", e.target.value)} className="rounded-xl mt-1" />
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
          {(!isEdit || form.status === "quote" || form.status === "quote_sent") && (
            <div>
              <Label className="text-xs">Quote Description</Label>
              <Textarea value={form.quote_notes || ""} onChange={e => update("quote_notes", e.target.value)} className="rounded-xl mt-1" rows={2} placeholder="Describe the work being quoted..." />
            </div>
          )}
          <div>
            <Label className="text-xs">Notes</Label>
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

        <Button type="submit" className="w-full rounded-xl gap-2 h-12" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isEdit ? "Save Changes" : "Create Job"}
        </Button>
      </form>
    </div>
  );
}