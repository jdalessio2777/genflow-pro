import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { integrationsCore } from "@/lib/coreIntegrations";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, FileText, Loader2, CheckCircle2, XCircle, Receipt, ChevronRight, ChevronDown, Phone, MapPin, PenLine, Send, DollarSign, Navigation, ArrowLeft, Plus, Trash2, Search, User, Package } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import JobPartsTab from "@/components/jobs/JobPartsTab";
import JobItemsTab from "@/components/jobs/JobItemsTab";
import JobDocsTab from "@/components/jobs/JobDocsTab";
import JobPhotosTab from "@/components/jobs/JobPhotosTab";
import { formatCurrency, formatDateTime, formatDate } from "@/lib/utils/format";
import { toast } from "sonner";
import { useState, useEffect, useCallback, useRef } from "react";
import { debounce } from "lodash";
import { useOfflineMutation } from "@/lib/useOfflineMutation";
import { useOffline } from "@/lib/OfflineContext";
import { useSettings } from "@/lib/useSettings";
import { useAuth } from "@/lib/AuthContext";
import { getUserDisplayName } from "@/lib/userColors";
import { notifyTeam, buildTable, buildRow, buildEventBadge } from "@/lib/notifyTeam";
import { useSwipeBack } from "@/hooks/useSwipeBack";

function SignatureCanvas({ onSave }) {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return {
      x: (touch.clientX - rect.left) * (canvas.width / rect.width),
      y: (touch.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDraw = (e) => { e.preventDefault(); isDrawing.current = true; const canvas = canvasRef.current; const ctx = canvas.getContext("2d"); const pos = getPos(e, canvas); ctx.beginPath(); ctx.moveTo(pos.x, pos.y); };
  const draw = (e) => { e.preventDefault(); if (!isDrawing.current) return; const canvas = canvasRef.current; const ctx = canvas.getContext("2d"); const pos = getPos(e, canvas); ctx.lineTo(pos.x, pos.y); ctx.stroke(); };
  const stopDraw = (e) => { e.preventDefault(); isDrawing.current = false; };
  const clear = () => { const canvas = canvasRef.current; const ctx = canvas.getContext("2d"); ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); };
  const save = () => { onSave(canvasRef.current.toDataURL("image/png")); };

  return (
    <div className="space-y-3">
      <div className="border-2 border-dashed border-border rounded-xl overflow-hidden bg-white">
        <canvas ref={canvasRef} width={560} height={200} className="w-full touch-none"
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 rounded-xl" onClick={clear}>Clear</Button>
        <Button className="flex-1 rounded-xl bg-green-600 hover:bg-green-700" onClick={save}>Save Signature</Button>
      </div>
    </div>
  );
}

function LiveTotalBar({ parts, labor, invoiceNotes, onNotesChange, generatorNotes, onGeneratorNotesChange, isSaving, onCollectPayment }) {
  const partsTotal = parts.reduce((s, p) => s + (p.total_price || 0), 0);
  const laborTotal = labor.reduce((s, l) => s + (l.total_price || 0), 0);
  const total = partsTotal + laborTotal;
  const costTotal = parts.reduce((s, p) => s + (p.total_cost || 0), 0) + labor.reduce((s, l) => s + (l.total_cost || 0), 0);
  const profit = total - costTotal;

  return (
    <Card className="p-4 bg-gradient-to-br from-primary/8 to-primary/4 border-primary/15 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Running Total</p>
        {isSaving && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> saving...</p>}
      </div>
      <div className="flex items-end justify-between">
        <div className="flex gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Parts</p>
            <p className="text-sm font-semibold">{formatCurrency(partsTotal)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Labor</p>
            <p className="text-sm font-semibold">{formatCurrency(laborTotal)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Profit</p>
            <p className={`text-sm font-semibold ${profit >= 0 ? "text-green-600" : "text-destructive"}`}>{formatCurrency(profit)}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-3xl font-bold text-primary tracking-tight">{formatCurrency(total)}</p>
        </div>
      </div>
      <div className="mt-2 pt-2 border-t border-blue-100/40">
        <p className="text-xs text-blue-700 font-medium mb-1 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
          Generator Notes (tech only)
        </p>
        <Textarea
          value={generatorNotes || ""}
          onChange={e => onGeneratorNotesChange?.(e.target.value)}
          className="text-sm rounded-xl resize-none border-blue-200 bg-blue-50/30 min-h-[56px]"
          rows={2}
          placeholder="Fault codes, battery voltage, oil condition..."
        />
      </div>
      {onCollectPayment && (
        <Button className="w-full rounded-xl gap-1.5 h-10 mt-2 bg-green-600 hover:bg-green-700" onClick={onCollectPayment}>
          <DollarSign className="w-4 h-4" /> Collect Payment
        </Button>
      )}
    </Card>
  );
}

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isOnline } = useOffline();
  const { settings } = useSettings();
  const { user, googleToken } = useAuth();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [quoteEmailOpen, setQuoteEmailOpen] = useState(false);
  const [manualEmail, setManualEmail] = useState('');
  const [sendingQuote, setSendingQuote] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [sigOpen, setSigOpen] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef(null);
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [generatorNotes, setGeneratorNotes] = useState("");
  const [scheduleNextOpen, setScheduleNextOpen] = useState(false);
  const [nextDate, setNextDate] = useState("");
  const notesInitialized = useRef(false);
  const [activeJobTab, setActiveJobTab] = useState("overview");
  const [workSubTab, setWorkSubTab] = useState("parts");
  const [flatFolder, setFlatFolder] = useState(null);
  const [workSearch, setWorkSearch] = useState("");
  const [pendingPlan, setPendingPlan] = useState(null);
  const [showAgreementSign, setShowAgreementSign] = useState(false);
  const [customerExpanded, setCustomerExpanded] = useState(false);
  useSwipeBack("/jobs");
  const [optimisticOnSiteTime, setOptimisticOnSiteTime] = useState(null);

  const { data: job, isLoading } = useQuery({
    queryKey: ["job", id],
    queryFn: async () => { const r = await db.Job.filter({ id }); return r[0]; },
  });

  const { data: parts = [] } = useQuery({
    queryKey: ["job-parts", id],
    queryFn: () => db.JobPart.filter({ job_id: id }),
  });

  const { data: labor = [] } = useQuery({
    queryKey: ["job-labor", id],
    queryFn: () => db.JobLabor.filter({ job_id: id }),
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["job-docs", id],
    queryFn: () => db.JobDocument.filter({ job_id: id }),
  });

  const { data: catalogParts = [] } = useQuery({
    queryKey: ["parts-catalog"],
    queryFn: () => db.Part.list("name"),
  });

  const { data: photos = [] } = useQuery({
    queryKey: ["job-photos", id],
    queryFn: () => db.JobPhoto.filter({ job_id: id }),
  });

  const { data: existingInvoices = [] } = useQuery({
    queryKey: ["job-invoice", id],
    queryFn: () => db.Invoice.filter({ job_id: id }),
  });
  const existingInvoice = existingInvoices[0] || null;

  const { data: customer } = useQuery({
    queryKey: ["job-customer", job?.customer_id],
    queryFn: async () => { const r = await db.Customer.filter({ id: job.customer_id }); return r[0]; },
    enabled: !!job?.customer_id,
  });

  const { data: customerHistory = [] } = useQuery({
    queryKey: ["customer-history", job?.customer_id],
    queryFn: () => db.Job.filter({ customer_id: job?.customer_id }, "-created_date"),
    enabled: !!job?.customer_id,
  });
  const previousJobs = customerHistory
    .filter(j => j.id !== id && ["completed", "invoiced"].includes(j.status))
    .slice(0, 10);

  useEffect(() => {
    if (job && !notesInitialized.current) {
      setInvoiceNotes(job.invoice_notes || "");
      setGeneratorNotes(job.generator_notes || "");
      notesInitialized.current = true;
    }
    if (job?.on_site_time) setOptimisticOnSiteTime(null);
  }, [job]);

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const onSiteTime = optimisticOnSiteTime || job?.on_site_time;
    const shouldRun = (job?.status === "on_site" || !!optimisticOnSiteTime) && !!onSiteTime;

    if (!shouldRun) {
      setElapsedSeconds(0);
      return;
    }

    const startMs = new Date(onSiteTime).getTime();
    if (isNaN(startMs)) return;

    const tick = () => setElapsedSeconds(Math.floor((Date.now() - startMs) / 1000));
    tick();
    timerRef.current = setInterval(tick, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [job?.status, job?.on_site_time, optimisticOnSiteTime]);

  const updateJob = useMutation({
    mutationFn: (data) => db.Job.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job", id] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });

  const updateJobOffline = useOfflineMutation({
    entity: 'Job',
    type: 'update',
    queryKeys: ['jobs'],
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job", id] });
    },
  });

  const debouncedSaveNotes = useCallback(
    debounce((notes) => {
      updateJobOffline.mutate({ entityId: id, data: { invoice_notes: notes } });
    }, 1200),
    [id]
  );

  const handleNotesChange = (val) => {
    setInvoiceNotes(val);
    debouncedSaveNotes(val);
  };

  const handleGeneratorNotesChange = useCallback(
    debounce((notes) => {
      updateJobOffline.mutate({ entityId: id, data: { generator_notes: notes } });
    }, 1500),
    [id]
  );

  const handleGeneratorNotesUpdate = (notes) => {
    setGeneratorNotes(notes);
    handleGeneratorNotesChange(notes);
  };

  const formatElapsed = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
    return `${m}:${String(sec).padStart(2,"0")}`;
  };

  const getJobTotals = () => {
    const partsCost = parts.reduce((s, p) => s + (p.total_cost || 0), 0);
    const partsPrice = parts.reduce((s, p) => s + (p.total_price || 0), 0);
    const laborCost = labor.reduce((s, l) => s + (l.total_cost || 0), 0);
    const laborPrice = labor.reduce((s, l) => s + (l.total_price || 0), 0);
    return { partsCost, partsPrice, laborCost, laborPrice };
  };

  const handleStatusChange = async (newStatus, extraFields = {}) => {
    if (isClosed) return;
    if (newStatus === "completed" && job?.requires_document) {
      const hasCompleted = documents.some(d => d.status === "completed");
      if (!hasCompleted) { toast.error("Complete at least one document before finishing this job"); return; }
    }
    const { partsCost, partsPrice, laborCost, laborPrice } = getJobTotals();
    updateJobOffline.mutate({
      entityId: id,
      data: {
        status: newStatus,
        total_parts_cost: partsCost, total_parts_price: partsPrice,
        total_labor_cost: laborCost, total_labor_price: laborPrice,
        total_cost: partsCost + laborCost, total_price: partsPrice + laborPrice,
        profit: (partsPrice + laborPrice) - (partsCost + laborCost),
        ...(newStatus === "completed" ? { completed_date: new Date().toISOString() } : {}),
        ...extraFields,
      },
    });
    if (newStatus === "completed" && ["maintenance", "battery_replacement"].includes(job.job_type)) {
      db.Customer.update(job.customer_id, { last_service_date: new Date().toISOString() });
    }
    if (newStatus === "scheduled" && customer?.email && job.scheduled_date) {
      try {
        const appointmentTime = new Date(job.scheduled_date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
        const appointmentHour = new Date(job.scheduled_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        await integrationsCore.SendEmail({
          to: customer.email,
          from_name: "AJ's Generator Service",
          subject: `Appointment Confirmed — ${job.title}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><div style="background:#1e3a5f;padding:22px 24px;border-radius:8px 8px 0 0;"><h1 style="color:white;margin:0;font-size:18px;">AJ's Generator Service</h1></div><div style="background:#f8f9fa;padding:22px 24px;border-radius:0 0 8px 8px;"><p style="font-size:14px;">Hi ${customer.name},</p><p style="font-size:13px;">Your appointment has been confirmed: <strong>${job.title}</strong> on <strong>${appointmentTime}</strong> at <strong>${appointmentHour}</strong>.</p></div></div>`,
        });
        toast.success(`Confirmation sent to ${customer.name}`);
      } catch { /* silently fail */ }
    }
    if (newStatus === "completed" && customer?.email) {
      try {
        const laborLines = labor.map(l => `<li style="font-size:13px;">${l.description}</li>`).join("");
        const partsLines = parts.filter(p => p.charge_for_part).map(p => `<li style="font-size:13px;">${p.name} (×${p.quantity})</li>`).join("");
        await integrationsCore.SendEmail({
          to: customer.email,
          from_name: "AJ's Generator Service",
          subject: `Service Complete — ${job.title}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><div style="background:#1e3a5f;padding:22px 24px;border-radius:8px 8px 0 0;"><h1 style="color:white;margin:0;font-size:18px;">AJ's Generator Service</h1></div><div style="background:#f8f9fa;padding:22px 24px;border-radius:0 0 8px 8px;"><p>Hi ${customer.name},</p><p>Your generator service has been completed.</p>${laborLines ? `<p><strong>Work Performed:</strong></p><ul>${laborLines}</ul>` : ""}${partsLines ? `<p><strong>Parts Replaced:</strong></p><ul>${partsLines}</ul>` : ""}${invoiceNotes ? `<p><strong>Notes:</strong> ${invoiceNotes}</p>` : ""}<p style="font-size:12px;color:#666;">Thank you for choosing AJ's Generator Service.</p></div></div>`,
        });
        toast.success(`Completion summary sent to ${customer.name}`);
      } catch { /* silently fail */ }
    }
    if (newStatus === "completed" && ["maintenance", "battery_replacement"].includes(job.job_type)) {
      const intervalMonths = customer?.service_interval === "6_months" ? 6 : customer?.service_interval === "24_months" ? 24 : 12;
      const suggested = new Date();
      suggested.setMonth(suggested.getMonth() + intervalMonths);
      setNextDate(suggested.toISOString().slice(0, 16));
      setScheduleNextOpen(true);
    }

    const triggeredBy = getUserDisplayName(user);
    if (newStatus === "scheduled") {
      const scheduledStr = job.scheduled_date ? new Date(job.scheduled_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "TBD";
      notifyTeam({ subject: `Job Scheduled — ${job.title} · ${job.customer_name}`, body: `${buildEventBadge("Scheduled", "blue")}${buildTable([buildRow("Customer", job.customer_name), buildRow("Job", job.title), buildRow("Date", scheduledStr), buildRow("Assigned To", job.assigned_to_name || "Unassigned")])}`, triggeredBy });
    }
    if (newStatus === "dispatched") {
      notifyTeam({ subject: `Tech Dispatched — ${job.title} · ${job.customer_name}`, body: `${buildEventBadge("Dispatched", "amber")}${buildTable([buildRow("Customer", job.customer_name), buildRow("Address", customer?.address), buildRow("Job", job.title), buildRow("Tech", job.assigned_to_name || "Unassigned")])}`, triggeredBy });
    }
    if (newStatus === "on_site") {
      notifyTeam({ subject: `On Site — ${job.title} · ${job.customer_name}`, body: `${buildEventBadge("Arrived On Site", "amber")}${buildTable([buildRow("Customer", job.customer_name), buildRow("Address", customer?.address), buildRow("Job", job.title), buildRow("Tech", job.assigned_to_name || "Unassigned"), buildRow("Arrived", new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))])}`, triggeredBy });
    }
    if (newStatus === "completed") {
      const { partsPrice, laborPrice } = getJobTotals();
      const total = partsPrice + laborPrice;
      notifyTeam({ subject: `Job Completed — ${job.title} · ${job.customer_name}${total > 0 ? ` · $${total.toFixed(2)}` : ""}`, body: `${buildEventBadge("Job Completed", "green")}${buildTable([buildRow("Customer", job.customer_name), buildRow("Job", job.title), buildRow("Type", job.job_type), buildRow("Tech", job.assigned_to_name || "Unassigned"), buildRow("Total", total > 0 ? `$${total.toFixed(2)}` : "TBD")])}`, triggeredBy });
    }
    if (newStatus === "canceled") {
      notifyTeam({ subject: `Job Canceled — ${job.title} · ${job.customer_name}`, body: `${buildEventBadge("Job Canceled", "red")}${buildTable([buildRow("Customer", job.customer_name), buildRow("Job", job.title), buildRow("Reason", cancelReason || "No reason given")])}`, triggeredBy });
    }
    toast.success(`Job marked as ${newStatus.replace("_", " ")}`);
  };

  const handleCancel = () => {
    setCancelOpen(false);
    handleStatusChange("canceled", { cancel_reason: cancelReason });
  };

  const sendViaGmail = async (to, subject, html, accessToken) => {
    const message = [
      `From: GenShield Generator Service <contact@genshieldservice.com>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      html,
    ].join('\r\n');
    const bytes = new TextEncoder().encode(message);
    const binary = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
    const raw = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const res = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Gmail ${res.status}: ${err.error?.message || 'send failed'}`);
    }
  };

  const doSendQuote = async (email) => {
    setSendingQuote(true);
    try {
      let token = job?.quote_approval_token;
      if (!token) {
        token = Math.random().toString(36).substring(2) + Date.now().toString(36);
        await db.Job.update(id, { quote_approval_token: token });
        queryClient.invalidateQueries({ queryKey: ["job", id] });
      }
      const approvalUrl = `${window.location.origin}/approve-quote/${id}/${token}`;
      const partsTotal = parts.reduce((s, p) => s + (p.total_price || 0), 0);
      const laborTotal = labor.reduce((s, l) => s + (l.total_price || 0), 0);
      const grandTotal = partsTotal + laborTotal;

      const laborRows = labor.map(l => `
        <tr>
          <td style="padding:8px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">
            ${l.description}
            <span style="display:block;font-size:11px;color:#9ca3af;">${l.is_flat_rate ? 'Flat rate' : `${l.hours}h @ ${formatCurrency(l.rate)}/hr`}</span>
          </td>
          <td style="padding:8px 12px;font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid #f3f4f6;">${formatCurrency(l.total_price)}</td>
        </tr>`).join('');

      const partsRows = parts.filter(p => p.total_price > 0).map(p => `
        <tr>
          <td style="padding:8px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">
            ${p.name}
            <span style="display:block;font-size:11px;color:#9ca3af;">Qty ${p.quantity}</span>
          </td>
          <td style="padding:8px 12px;font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid #f3f4f6;">${formatCurrency(p.total_price)}</td>
        </tr>`).join('');

      const subtotalsHtml = partsTotal > 0 && laborTotal > 0 ? `
        <tr><td style="padding:5px 12px;font-size:12px;color:#6b7280;">Labor subtotal</td><td style="padding:5px 12px;font-size:12px;color:#6b7280;text-align:right;">${formatCurrency(laborTotal)}</td></tr>
        <tr><td style="padding:5px 12px;font-size:12px;color:#6b7280;">Parts subtotal</td><td style="padding:5px 12px;font-size:12px;color:#6b7280;text-align:right;">${formatCurrency(partsTotal)}</td></tr>` : '';

      const html = `<!DOCTYPE html><html><body style="margin:0;padding:16px;background:#f3f4f6;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
  <div style="background:#1e3a5f;padding:24px;">
    <h1 style="color:white;margin:0;font-size:20px;font-weight:700;">GenShield Generator Service</h1>
    <p style="color:#93c5fd;margin:4px 0 0;font-size:13px;">Service Quote for ${customer?.name || job?.customer_name}</p>
  </div>
  <div style="padding:24px;">
    <h2 style="margin:0 0 4px;font-size:18px;color:#111827;">${job?.title || 'Service Quote'}</h2>
    ${job?.quote_notes ? `<p style="margin:0 0 20px;font-size:13px;color:#6b7280;">${job.quote_notes}</p>` : '<div style="margin-bottom:20px;"></div>'}
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <thead><tr style="background:#f9fafb;">
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;">Description</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;">Amount</th>
      </tr></thead>
      <tbody>${laborRows}${partsRows}</tbody>
      <tfoot>
        ${subtotalsHtml}
        <tr style="background:#f9fafb;">
          <td style="padding:12px;font-size:15px;font-weight:700;color:#111827;border-top:2px solid #e5e7eb;">Estimated Total</td>
          <td style="padding:12px;font-size:18px;font-weight:700;color:#111827;text-align:right;border-top:2px solid #e5e7eb;">${formatCurrency(grandTotal)}</td>
        </tr>
      </tfoot>
    </table>
    <div style="margin:24px 0;text-align:center;">
      <a href="${approvalUrl}" style="display:inline-block;background:#16a34a;color:white;padding:14px 32px;border-radius:10px;font-size:16px;font-weight:700;text-decoration:none;">✓ Approve This Quote</a>
      <p style="font-size:11px;color:#9ca3af;margin:8px 0 0;">One tap — no login required</p>
    </div>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;">
      <p style="margin:0;font-size:13px;color:#374151;">Questions? Call <strong>(973) 787-2431</strong> or reply to this email to approve or request changes.</p>
      <p style="margin:6px 0 0;font-size:12px;color:#9ca3af;">This quote is valid for 30 days.</p>
    </div>
  </div>
  <div style="background:#f9fafb;padding:14px 24px;border-top:1px solid #e5e7eb;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">GenShield Generator Service · contact@genshieldservice.com</p>
  </div>
</div></body></html>`;

      let sentViaGmail = false;
      if (googleToken) {
        try {
          await sendViaGmail(email, 'Your Service Quote — GenShield Generator Service', html, googleToken);
          sentViaGmail = true;
        } catch (e) {
          console.warn('[QuoteSend] Gmail failed, falling back to mailto:', e.message);
        }
      }

      if (!sentViaGmail) {
        const plainBody = `Service Quote: ${job?.title}\n\nEstimated Total: ${formatCurrency(grandTotal)}\n\nApprove online: ${approvalUrl}\n\nQuestions? Call (973) 787-2431 or reply to approve.`;
        window.open(`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Your Service Quote — GenShield Generator Service')}&body=${encodeURIComponent(plainBody)}`, '_blank');
      }

      updateJob.mutate({ status: 'quote_sent', quote_sent_date: new Date().toISOString() });
      toast.success(sentViaGmail ? `Quote sent to ${email}` : `Email drafted — mark as sent once delivered`);
      setQuoteEmailOpen(false);
    } catch (e) {
      toast.error(`Failed to send quote: ${e.message}`);
    } finally {
      setSendingQuote(false);
    }
  };

  const handleMarkAsSent = () => {
    if (customer?.email) {
      doSendQuote(customer.email);
    } else {
      setManualEmail('');
      setQuoteEmailOpen(true);
    }
  };

  const buildInvoiceData = () => {
    const { partsPrice, laborPrice } = getJobTotals();
    const lineItems = [
      ...parts.map(p => ({ type: "part", description: p.name, quantity: p.quantity, unit_price: p.price, total: p.total_price })),
      ...labor.map(l => ({ type: "labor", description: l.description, quantity: l.is_flat_rate ? 1 : l.hours, unit_price: l.is_flat_rate ? l.flat_rate_amount : l.rate, total: l.total_price })),
    ];
    return { parts_total: partsPrice, labor_total: laborPrice, total: partsPrice + laborPrice, line_items: lineItems, notes: invoiceNotes, customer_signature: job.customer_signature || null };
  };

  const handleFinalizeInvoice = async () => {
    const invoiceData = { ...buildInvoiceData(), job_id: id, customer_id: job.customer_id, customer_name: job.customer_name };
    let inv;
    if (existingInvoice) {
      await db.Invoice.update(existingInvoice.id, invoiceData);
      inv = existingInvoice;
    } else {
      inv = await db.Invoice.create({ ...invoiceData, invoice_number: `INV-${Date.now().toString(36).toUpperCase()}`, status: "draft" });
    }
    await db.Job.update(id, { status: "invoiced" });
    queryClient.invalidateQueries({ queryKey: ["job", id] });
    queryClient.invalidateQueries({ queryKey: ["job-invoice", id] });
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
    toast.success("Invoice finalized");
    navigate(`/invoices/${inv.id}`);
  };

  const handleCollectPayment = async () => {
    const invoiceData = buildInvoiceData();
    if (existingInvoice) {
      await db.Invoice.update(existingInvoice.id, invoiceData);
      navigate(`/invoices/${existingInvoice.id}`);
    } else {
      const inv = await db.Invoice.create({
        ...invoiceData, job_id: id, customer_id: job.customer_id, customer_name: job.customer_name,
        invoice_number: `INV-${Date.now().toString(36).toUpperCase()}`, status: "draft",
      });
      navigate(`/invoices/${inv.id}`);
    }
  };

  const addServiceAgreement = async (type) => {
    const AGREEMENT_DETAILS = {
      annual_air_cooled: {
        description: "Annual Service Agreement — Air-Cooled Generator · 1 maintenance visit/yr · 10% off parts, labor & repairs",
        flat_rate_amount: 340,
      },
      semi_annual_air_cooled: {
        description: "Semi-Annual Service Agreement — Air-Cooled Generator · 2 maintenance visits/yr · 15% off parts, labor & repairs",
        flat_rate_amount: 595,
      },
    };
    const details = AGREEMENT_DETAILS[type] ?? {
      description: `Service Agreement — ${type.replace(/_/g, " ")}`,
      flat_rate_amount: 0,
    };
    await db.JobLabor.create({
      job_id: id,
      description: details.description,
      is_flat_rate: true,
      flat_rate_amount: details.flat_rate_amount,
      flat_rate_cost: 0,
      total_price: details.flat_rate_amount,
      total_cost: 0,
      requires_agreement: type,
    });
    queryClient.invalidateQueries({ queryKey: ["job-labor", id] });
    setPendingPlan(type);
    toast.success("Service Agreement added to job · Customer signs at completion");
  };

  if (isLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!job) return <div className="p-4 text-center">Job not found</div>;

  const isClosed = ["invoiced", "canceled"].includes(job.status);
  const isMember = !!(customer?.membership_plan && customer?.membership_signed);
  const isSemiMember = !!(customer?.membership_plan === "semi_annual" && customer?.membership_signed);
  const memberDiscountRate = isSemiMember ? 0.85 : isMember ? 0.90 : 1.0;
  const hasPendingAgreement = labor.some(l => l.requires_agreement);
  const isActive = ["dispatched", "on_site"].includes(job.status);
  const headerBg = job.status === "on_site" ? "bg-amber-500" : job.status === "dispatched" ? "bg-cyan-600" : isClosed ? "bg-gray-600" : "bg-primary";
  const headerDot = job.status === "on_site" ? "bg-amber-300" : "bg-cyan-300";
  const tabActiveColor = job.status === "on_site" ? "#d97706" : job.status === "dispatched" ? "#0891b2" : "hsl(var(--primary))";

  return (
    <div className="flex flex-col h-screen bg-muted/30">

      {/* ── COLORED ACTIVE JOB HEADER ── */}
      <div className={`${headerBg} px-4 pt-3 pb-3 shrink-0`}>
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => navigate("/jobs")}
              className="w-8 h-8 rounded-xl bg-white/20 active:bg-white/30 flex items-center justify-center shrink-0"
            >
              <ArrowLeft className="w-4 h-4 text-white" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                {isActive && <div className={`w-1.5 h-1.5 rounded-full ${headerDot} animate-pulse shrink-0`} />}
                <span className="text-white/80 text-xs font-bold uppercase tracking-wider">
                  {job.status === "on_site" ? "On Site" :
                   job.status === "dispatched" ? "Dispatched" :
                   job.status === "completed" ? "Completed" :
                   job.status === "invoiced" ? "Invoiced" :
                   job.status === "canceled" ? "Canceled" :
                   job.status?.replace(/_/g, " ")}
                </span>
              </div>
              <p className="text-white font-bold text-base leading-tight truncate">{job.title}</p>
              <p className="text-white/75 text-xs">{job.customer_name}{job.assigned_to_name ? ` · ${job.assigned_to_name}` : ""}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {job.status === "on_site" && (
              <div className="text-right">
                <p className="font-mono text-white text-lg font-bold tracking-wider">{formatElapsed(elapsedSeconds)}</p>
                <p className="text-white/70 text-[10px]">{(elapsedSeconds / 3600).toFixed(2)}h on site</p>
              </div>
            )}
            {!isClosed && (
              <Link to={`/jobs/${id}/edit`}>
                <button className="w-8 h-8 rounded-xl bg-white/20 active:bg-white/30 flex items-center justify-center">
                  <Pencil className="w-4 h-4 text-white" />
                </button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── HORIZONTAL TAB BAR ── */}
      <div className="bg-white border-b border-border shrink-0 shadow-sm">
      <div className="flex overflow-x-auto max-w-lg mx-auto" style={{ scrollbarWidth: "none" }}>
      {[
        { key: "overview", label: "Overview", icon: "⚡" },
        { key: "items", label: "Items", icon: "📦" },
        { key: "work", label: "Work", icon: "🔧" },
        { key: "docs", label: "Docs", icon: "📄" },
        { key: "photos", label: "Photos", icon: "📷" },
        { key: "history", label: "History", icon: "📋" },
        { key: "notes", label: "Notes", icon: "📝" },
      ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveJobTab(tab.key)}
              className="flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors shrink-0"
              style={{
                borderBottomColor: activeJobTab === tab.key ? tabActiveColor : "transparent",
                color: activeJobTab === tab.key ? tabActiveColor : "#9ca3af",
              }}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── TAB CONTENT ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto">

          {/* ════ OVERVIEW TAB ════ */}
          {activeJobTab === "overview" && (
            <div className="p-4 space-y-3 pb-8">

              {/* ── Job Info Card ── */}
              <Card className="overflow-hidden">
                <div className="px-4 pt-3.5 pb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Job</p>
                    <p className="text-base font-bold text-foreground leading-tight">{job.title}</p>
                  </div>
                  {job.job_type && (
                    <StatusBadge status={job.job_type} className="mt-5 shrink-0" />
                  )}
                </div>
                {(job.quote_notes || job.notes) && (
                  <div className="mx-3.5 mb-3.5 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2.5">
                    <p className="text-[10px] font-bold text-sky-700 uppercase tracking-wider mb-1">Summary</p>
                    <p className="text-xs text-sky-800 leading-relaxed">
                      {job.quote_notes || job.notes}
                    </p>
                  </div>
                )}
              </Card>

              {/* ── Customer — collapsible ── */}
              <Card className="overflow-hidden">
                <button
                  onClick={() => setCustomerExpanded(e => !e)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 active:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-primary text-sm font-bold">
                        {job.customer_name?.charAt(0) || "?"}
                      </span>
                    </div>
                    <div className="text-left min-w-0">
                      <p className="text-sm font-bold text-foreground">{job.customer_name}</p>
                      {customer?.address && (
                        <p className="text-xs text-muted-foreground truncate">{customer.address}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isMember && (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${customer.membership_plan === "semi_annual" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                        🛡️ Member
                      </span>
                    )}
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${customerExpanded ? "rotate-180" : ""}`} />
                  </div>
                </button>

                {customerExpanded && (
                  <div className="border-t border-border px-3.5 pb-3.5 pt-3 space-y-2.5">
                    {(customer?.generator_model || customer?.generator_serial) && (
                      <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
                        <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider mb-1">Generator</p>
                        {customer.generator_model && (
                          <p className="text-xs font-semibold text-blue-900">{customer.generator_model}</p>
                        )}
                        {customer.generator_serial && (
                          <p className="text-xs text-blue-600">S/N {customer.generator_serial}</p>
                        )}
                      </div>
                    )}
                    {customer?.repeat_note && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                        <div className="flex items-start gap-2">
                          <div className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-white text-[9px] font-bold">!</span>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-amber-900 uppercase tracking-wider mb-0.5">Always Remember</p>
                            <p className="text-xs text-amber-800 leading-relaxed">{customer.repeat_note}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {customer?.property_notes && (
                      <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2 border border-amber-200">
                        ⚠ {customer.property_notes}
                      </p>
                    )}
                    {isMember && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                        <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1">Membership</p>
                        <p className="text-xs font-semibold text-emerald-800">
                          {customer.membership_plan === "semi_annual" ? "Semi-Annual" : "Annual"} Protection Plan
                        </p>
                        <p className="text-xs text-emerald-600">
                          10% off all parts & labor
                          {customer.membership_expiry ? ` · Expires ${new Date(customer.membership_expiry).toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : ""}
                        </p>
                      </div>
                    )}
                    <div className="flex gap-2 pt-0.5">
                      {customer?.phone && (
                        <a href={`tel:${customer.phone}`} className="flex-1">
                          <button className="w-full flex items-center justify-center gap-1.5 h-9 rounded-xl bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-700">
                            <Phone className="w-3.5 h-3.5" /> Call
                          </button>
                        </a>
                      )}
                      {customer?.address && (
                        <a href={`https://maps.google.com/?q=${encodeURIComponent(customer.address)}`} target="_blank" rel="noopener noreferrer" className="flex-1">
                          <button className="w-full flex items-center justify-center gap-1.5 h-9 rounded-xl bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-700">
                            <MapPin className="w-3.5 h-3.5" /> Directions
                          </button>
                        </a>
                      )}
                      <Link to={`/customers/${job.customer_id}`} className="flex-1">
                        <button className="w-full flex items-center justify-center gap-1.5 h-9 rounded-xl bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-700">
                          <User className="w-3.5 h-3.5" /> Profile
                        </button>
                      </Link>
                    </div>
                  </div>
                )}
              </Card>

              {/* ── On site timer ── */}
              {job.status === "on_site" && (
                <Card className="p-4 bg-amber-50 border-amber-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">On Site — Clock Running</p>
                      <p className="text-3xl font-bold font-mono text-amber-700 mt-1">{formatElapsed(elapsedSeconds)}</p>
                      <p className="text-xs text-amber-600 mt-0.5">{(elapsedSeconds / 3600).toFixed(2)} hours on site</p>
                    </div>
                    <div className="w-12 h-12 rounded-full border-4 border-amber-300 flex items-center justify-center">
                      <div className="w-3 h-3 rounded-full bg-amber-500 animate-pulse" />
                    </div>
                  </div>
                </Card>
              )}

              {/* ── Invoice Summary ── */}
              <Card className="px-4 pt-3.5 pb-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Invoice Summary</p>
                <Textarea
                  value={invoiceNotes}
                  onChange={e => handleNotesChange(e.target.value)}
                  className="text-sm rounded-xl resize-none border-border bg-muted/20 min-h-[64px]"
                  rows={3}
                  placeholder="Describe work performed for customer invoice..."
                />
              </Card>

              {/* ── Running Total ── */}
              <LiveTotalBar
                parts={parts}
                labor={labor}
                invoiceNotes={invoiceNotes}
                onNotesChange={handleNotesChange}
                generatorNotes={generatorNotes}
                onGeneratorNotesChange={handleGeneratorNotesUpdate}
                onCollectPayment={!isClosed ? handleCollectPayment : undefined}
                isSaving={updateJob.isPending}
              />

              {/* Service Agreement status card */}
              {hasPendingAgreement && (
                customer?.membership_signed ? (
                  <Card className="p-3.5 border-green-200 bg-green-50">
                    <p className="text-xs font-bold text-green-900 flex items-center gap-1.5">
                      ✅ SERVICE AGREEMENT ACTIVE
                    </p>
                    <p className="text-xs text-green-800 mt-0.5">Annual Service Agreement — Air-Cooled</p>
                    <p className="text-xs text-green-600 mt-0.5">Signed · Discounts applied automatically</p>
                  </Card>
                ) : (
                  <Card className="p-3.5 border-indigo-200 bg-indigo-50">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">📋 SERVICE AGREEMENT PENDING</p>
                        <p className="text-xs text-indigo-800 mt-0.5">Annual Service Agreement — Air-Cooled Generator</p>
                        <p className="text-xs text-indigo-600 mt-0.5">$340/yr · Customer signature required</p>
                      </div>
                      <Button size="sm" className="rounded-xl h-8 text-xs bg-indigo-600 hover:bg-indigo-700 shrink-0 ml-2"
                        onClick={() => navigate(`/customers/${job.customer_id}/membership?from_job=${id}`)}>
                        Sign
                      </Button>
                    </div>
                  </Card>
                )
              )}

              {/* Status action buttons */}
              {!isClosed && (
                <div className="space-y-2">
                  {job.status === "scheduled" && (
                    <Button className="w-full rounded-xl gap-1.5 h-11 bg-cyan-600 hover:bg-cyan-700"
                      onClick={() => handleStatusChange("dispatched", { dispatched_time: new Date().toISOString() })}>
                      <Navigation className="w-4 h-4" /> Dispatch — Head Out
                    </Button>
                  )}
                  {job.status === "dispatched" && (
                    <>
                      <div className="flex items-center gap-2 text-xs text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-xl px-3 py-2.5">
                        <Navigation className="w-3.5 h-3.5 shrink-0" />
                        <span>En route — tap when you arrive to start the clock</span>
                      </div>
                      <Button className="w-full rounded-xl gap-1.5 h-11 bg-amber-500 hover:bg-amber-600"
                        onClick={() => {
                          const now = new Date().toISOString();
                          setOptimisticOnSiteTime(now);
                          handleStatusChange("on_site", { on_site_time: now });
                        }}>
                        <MapPin className="w-4 h-4" /> Arrived — Start Clock
                      </Button>
                    </>
                  )}
                  {(job.status === "on_site" || job.status === "in_progress") && (
                    <Button className="w-full rounded-xl gap-1.5 h-11 bg-green-600 hover:bg-green-700"
                      onClick={() => {
                        const hoursOnSite = elapsedSeconds / 3600;
                        handleStatusChange("completed", {
                          time_on_site_seconds: elapsedSeconds,
                          time_on_site_hours: Math.round(hoursOnSite * 4) / 4,
                        });
                        if (hasPendingAgreement) setTimeout(() => setShowAgreementSign(true), 500);
                      }}>
                      <CheckCircle2 className="w-4 h-4" /> Complete Job
                    </Button>
                  )}
                  {job.status === "completed" && (
                    <div className="space-y-2">
                      {hasPendingAgreement && !customer?.membership_signed && (
                        <Button className="w-full rounded-xl gap-1.5 h-11 bg-indigo-600 hover:bg-indigo-700"
                          onClick={() => setShowAgreementSign(true)}>
                          🛡️ Customer Sign Protection Agreement
                        </Button>
                      )}
                      {existingInvoice?.status === "paid" ? (
                        <Card className="p-3 bg-green-50 border-green-200">
                          <p className="text-sm font-semibold text-green-800 flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4" /> Paid — {formatCurrency(existingInvoice.total)}
                          </p>
                        </Card>
                      ) : (
                        <>
                          <Button className="w-full rounded-xl gap-1.5 h-11 bg-green-600 hover:bg-green-700" onClick={handleCollectPayment}>
                            <DollarSign className="w-4 h-4" /> Collect Payment Now
                          </Button>
                          <Button variant="outline" className="w-full rounded-xl gap-1.5 h-11" onClick={handleFinalizeInvoice}>
                            <Receipt className="w-4 h-4" /> Finalize & Send Invoice
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                  {!["quote", "quote_sent"].includes(job.status) && (
                    <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="w-full rounded-xl gap-1.5 h-10 text-sm">
                          <XCircle className="w-4 h-4" /> Cancel Job
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-sm">
                        <DialogHeader><DialogTitle>Cancel Job</DialogTitle></DialogHeader>
                        <Textarea placeholder="Reason for cancellation..." value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
                        <Button variant="destructive" className="w-full rounded-xl" onClick={handleCancel}>Confirm Cancel</Button>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              )}

              {/* Quote section */}
              {["quote", "quote_sent"].includes(job.status) && (
                <Card className="p-4 border-sky-200 bg-sky-50">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-sky-900">Quote</p>
                    <Link to={`/jobs/${id}/quote`}>
                      <Button size="sm" variant="outline" className="rounded-xl text-xs h-8 gap-1">
                        <FileText className="w-3 h-3" /> View
                      </Button>
                    </Link>
                  </div>
                  {job.status === "quote_sent" && (
                    <>
                      <p className="text-xs text-sky-700 bg-sky-100 rounded-lg px-2.5 py-1.5 border border-sky-200">
                        ✓ Sent to customer — awaiting approval
                      </p>
                      <Button size="sm" variant="outline"
                        className="w-full rounded-xl gap-1.5 mt-2 border-amber-300 text-amber-800 hover:bg-amber-50"
                        onClick={() => handleStatusChange("scheduled", { quote_approved_date: new Date().toISOString() })}>
                        <CheckCircle2 className="w-3.5 h-3.5" /> Proceed Without Approval
                      </Button>
                      <p className="text-[10px] text-muted-foreground text-center mt-1 leading-tight">
                        Manual override — customer approved by phone or in person
                      </p>
                    </>
                  )}
                  {job.status === "quote" && (
                    <>
                      <Button size="sm" className="w-full rounded-xl gap-1.5 mb-2"
                        disabled={sendingQuote}
                        onClick={handleMarkAsSent}>
                        {sendingQuote
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending...</>
                          : <><Send className="w-3.5 h-3.5" /> Send Quote to Customer</>}
                      </Button>
                      <Button size="sm" variant="outline" className="w-full rounded-xl gap-1.5"
                        onClick={() => handleStatusChange("scheduled", { quote_approved_date: new Date().toISOString() })}>
                        <CheckCircle2 className="w-3.5 h-3.5" /> Approve & Schedule
                      </Button>
                    </>
                  )}
                </Card>
              )}

              {/* Schedule Next Service dialog */}
              <Dialog open={quoteEmailOpen} onOpenChange={setQuoteEmailOpen}>
                <DialogContent className="max-w-sm">
                  <DialogHeader><DialogTitle>Send Quote</DialogTitle></DialogHeader>
                  <p className="text-sm text-muted-foreground">No email on file for this customer. Enter one to send the quote — it won't be saved to the profile.</p>
                  <div>
                    <Label className="text-xs">Customer email</Label>
                    <Input
                      type="email"
                      value={manualEmail}
                      onChange={e => setManualEmail(e.target.value)}
                      placeholder="customer@example.com"
                      className="rounded-xl mt-1"
                      onKeyDown={e => { if (e.key === 'Enter' && manualEmail.includes('@')) doSendQuote(manualEmail); }}
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setQuoteEmailOpen(false)}>Cancel</Button>
                    <Button
                      className="flex-1 rounded-xl gap-1.5"
                      disabled={!manualEmail.includes('@') || sendingQuote}
                      onClick={() => doSendQuote(manualEmail)}
                    >
                      {sendingQuote
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
                        : <><Send className="w-4 h-4" /> Send Quote</>}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={scheduleNextOpen} onOpenChange={setScheduleNextOpen}>
                <DialogContent className="max-w-sm">
                  <DialogHeader><DialogTitle>Schedule Next Service?</DialogTitle></DialogHeader>
                  <p className="text-sm text-muted-foreground">Would you like to pre-schedule {job.customer_name}'s next maintenance visit?</p>
                  <div>
                    <Label className="text-xs">Next Service Date</Label>
                    <Input type="datetime-local" value={nextDate} onChange={e => setNextDate(e.target.value)} className="rounded-xl mt-1" />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setScheduleNextOpen(false)}>Skip</Button>
                    <Button className="flex-1 rounded-xl" onClick={async () => {
                      if (!nextDate) return;
                      await db.Job.create({
                        customer_id: job.customer_id, customer_name: job.customer_name,
                        title: job.title, job_type: "maintenance", status: "scheduled",
                        scheduled_date: new Date(nextDate).toISOString(),
                        notes: `Auto-scheduled following service on ${new Date().toLocaleDateString()}`,
                      });
                      setScheduleNextOpen(false);
                      toast.success("Next service scheduled");
                      queryClient.invalidateQueries({ queryKey: ["jobs"] });
                    }}>Schedule It</Button>
                  </div>
                </DialogContent>
              </Dialog>

            </div>
          )}

          {/* ════ WORK TAB ════ */}
          {activeJobTab === "work" && (
            <div className="flex flex-col pb-8">
              {/* Work sub-tabs */}
              <div className="flex bg-muted/60 mx-4 mt-3 rounded-xl p-0.5 shrink-0">
                {[
                  { key: "parts", label: "Parts" },
                  { key: "labor", label: "Labor" },
                  { key: "flatrates", label: "Flat Rates" },
                ].map(t => (
                  <button
                    key={t.key}
                    onClick={() => { setWorkSubTab(t.key); setFlatFolder(null); setWorkSearch(""); }}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${workSubTab === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
                  >
                    {t.label}
                    {t.key === "parts" && parts.length > 0 && ` (${parts.length})`}
                    {t.key === "labor" && labor.length > 0 && ` (${labor.length})`}
                  </button>
                ))}
              </div>

              {/* Work search */}
              <div className="relative px-4 mt-2">
                <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={
                    workSubTab === "parts" ? "Search parts..."
                    : workSubTab === "labor" ? "Search labor rates..."
                    : "Search flat rates..."
                  }
                  value={workSearch}
                  onChange={e => setWorkSearch(e.target.value)}
                  className="pl-9 rounded-xl h-9 text-sm"
                />
              </div>

              <div className="p-4 space-y-2">
                {/* Parts sub-tab */}
                {workSubTab === "parts" && (
                <JobPartsTab jobId={id} parts={parts} catalogParts={catalogParts} memberDiscountRate={memberDiscountRate} searchFilter={workSearch} />
                )}

                {/* Labor sub-tab */}
                {workSubTab === "labor" && (
                  <div className="space-y-2">
                    {/* Added labor items */}
                    {labor.length > 0 && (
                      <>
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Added to job</p>
                        {labor.filter(item => !workSearch || item.description?.toLowerCase().includes(workSearch.toLowerCase())).map(item => (
                          <Card key={item.id} className="p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{item.description}</p>
                                <p className="text-xs text-muted-foreground">{item.is_flat_rate ? "Flat rate" : `${item.hours}h @ $${item.rate}/hr`}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <p className="text-sm font-bold">{formatCurrency(item.total_price)}</p>
                                <Button variant="ghost" size="icon" className="h-7 w-7"
                                  onClick={() => db.JobLabor.delete(item.id).then(() => queryClient.invalidateQueries({ queryKey: ["job-labor", id] }))}>
                                  <Trash2 className="w-3 h-3 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          </Card>
                        ))}
                        <div className="border-t border-border pt-2" />
                      </>
                    )}

                    {/* Standard rates */}
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Rate Catalog</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Standard</p>
                    {[
                      { name: "First ½ Hour", sub: "Minimum charge", price: 125, type: "flat" },
                      { name: "Standard Hourly", sub: "After first ½ hr · per hour", price: 115, type: "hourly" },
                    ].filter(r => !workSearch || r.name.toLowerCase().includes(workSearch.toLowerCase())).map((r, i) => (
                      <Card key={i} className="p-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{r.name}</p>
                          <p className="text-xs text-muted-foreground">{r.sub}{isMember ? ` · ${Math.round((1-memberDiscountRate)*100)}% off` : ""}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <p className="text-sm font-bold">${isMember ? Math.round(r.price * memberDiscountRate) : r.price}{r.type === "hourly" ? "/hr" : ""}</p>
                          <Button size="icon" className="h-7 w-7 rounded-lg" onClick={() => {
                            const price = isMember ? Math.round(r.price * memberDiscountRate * 100) / 100 : r.price;
                            db.JobLabor.create({
                              job_id: id,
                              description: r.name + (isMember ? ` (Member ${Math.round((1-memberDiscountRate)*100)}% off)` : ""),
                              is_flat_rate: r.type === "flat",
                              flat_rate_amount: r.type === "flat" ? price : 0,
                              hours: r.type === "hourly" ? 1 : 0,
                              rate: r.type === "hourly" ? price : 0,
                              total_price: price,
                              total_cost: 0,
                              flat_rate_cost: 0,
                            }).then(() => queryClient.invalidateQueries({ queryKey: ["job-labor", id] }));
                            toast.success(`${r.name} added`);
                          }}>
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </Card>
                    ))}

                    {/* After Hours */}
                     <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400 mt-2">After Hours & Weekend</p>
                    {[
                      { name: "Night / Sat until 3:30pm", sub: "After hours rate", price: 245 },
                      { name: "Sat after 3:30pm / Sun", sub: "Weekend rate", price: 330 },
                      { name: "Holiday Rate", sub: "Federal holidays", price: 330 },
                    ].filter(r => !workSearch || r.name.toLowerCase().includes(workSearch.toLowerCase())).map((r, i) => (
                      <Card key={i} className="p-3 flex items-center justify-between border-orange-200 bg-orange-50/40">
                        <div>
                          <p className="text-sm font-medium">{r.name}</p>
                          <p className="text-xs text-orange-600">{r.sub}{isMember ? ` · ${Math.round((1-memberDiscountRate)*100)}% off` : ""}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <p className="text-sm font-bold text-orange-700">${isMember ? Math.round(r.price * memberDiscountRate) : r.price}/hr</p>
                          <Button size="icon" className="h-7 w-7 rounded-lg bg-orange-500 hover:bg-orange-600" onClick={() => {
                            const price = isMember ? Math.round(r.price * memberDiscountRate * 100) / 100 : r.price;
                            db.JobLabor.create({
                              job_id: id, description: r.name + (isMember ? ` (Member ${Math.round((1-memberDiscountRate)*100)}% off)` : ""),
                              is_flat_rate: false, hours: 1, rate: price, total_price: price, total_cost: 0,
                            }).then(() => queryClient.invalidateQueries({ queryKey: ["job-labor", id] }));
                            toast.success(`${r.name} added`);
                          }}>
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </Card>
                    ))}

                    {/* Emergency */}
                    <p className="text-[10px] font-bold uppercase tracking-wider text-red-400 mt-2">Emergency</p>
                    {[
                      { name: "Emergency Dispatch Fee", sub: "Same-day emergency response", price: 75, type: "flat" },
                      { name: "Emergency Hourly", sub: "Emergency rate · per hour", price: 245, type: "hourly" },
                    ].filter(r => !workSearch || r.name.toLowerCase().includes(workSearch.toLowerCase())).map((r, i) => (
                      <Card key={i} className="p-3 flex items-center justify-between border-red-200 bg-red-50/40">
                        <div>
                          <p className="text-sm font-medium">{r.name}</p>
                          <p className="text-xs text-red-500">{r.sub}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <p className="text-sm font-bold text-red-700">${r.price}{r.type === "hourly" ? "/hr" : ""}</p>
                          <Button size="icon" className="h-7 w-7 rounded-lg bg-red-500 hover:bg-red-600" onClick={() => {
                            db.JobLabor.create({
                              job_id: id, description: r.name,
                              is_flat_rate: r.type === "flat",
                              flat_rate_amount: r.type === "flat" ? r.price : 0,
                              hours: r.type === "hourly" ? 1 : 0,
                              rate: r.type === "hourly" ? r.price : 0,
                              total_price: r.price, total_cost: 0,
                            }).then(() => queryClient.invalidateQueries({ queryKey: ["job-labor", id] }));
                            toast.success(`${r.name} added`);
                          }}>
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Flat Rates sub-tab */}
                {workSubTab === "flatrates" && (
                  <div className="space-y-2">
                    {!flatFolder ? (
                      <>
                        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Folders</p>
                        {[
                          { key: "oil_pressure_switches", icon: "🔌", label: "Oil Pressure Switches" },
                          { key: "starters", icon: "⚡", label: "Starters" },
                          { key: "controllers", icon: "🖥️", label: "Controllers" },
                          { key: "load_shed", icon: "⚙️", label: "Load Shed" },
                          { key: "smm_boards", icon: "📟", label: "SMM Boards" },
                          { key: "batteries", icon: "🔋", label: "Batteries" },
                          { key: "maintenance", icon: "🔧", label: "Maintenance" },
                          { key: "service_agreements", icon: "📋", label: "Service Agreements" },
                          { key: "other", icon: "📦", label: "Other" },
                        ].filter(f => !workSearch || f.label.toLowerCase().includes(workSearch.toLowerCase())).map(folder => (
                          <button key={folder.key} onClick={() => setFlatFolder(folder.key)}
                            className="w-full bg-card border border-border rounded-xl p-3 flex items-center justify-between hover:bg-muted/30 transition-colors">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-base">{folder.icon}</div>
                              <p className="text-sm font-semibold">{folder.label}</p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          </button>
                        ))}
                      </>
                    ) : (
                      <>
                        <button onClick={() => setFlatFolder(null)} className="flex items-center gap-1.5 text-xs text-primary font-semibold mb-1">
                          ← Back to Folders
                        </button>

                        {/* Service Agreements folder */}
                         {flatFolder === "service_agreements" && (
                           <div className="space-y-2">
                             {/* Air-Cooled — enabled */}
                             <Card className="p-3.5 border-indigo-200 bg-indigo-50/40">
                               <div className="flex items-start justify-between gap-2">
                                 <div className="min-w-0 flex-1">
                                   <div className="flex items-center gap-2 flex-wrap mb-1">
                                     <p className="text-sm font-semibold">Service Agreement (Air-Cooled)</p>
                                     <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Agreement Required</span>
                                   </div>
                                   <p className="text-xs text-muted-foreground">1 maintenance visit/yr · 10% off parts, labor & repairs</p>
                                   <p className="text-[10px] text-amber-700 mt-1 font-medium">Price is fixed — not subject to member discount</p>
                                 </div>
                                 <div className="flex items-center gap-2 shrink-0 mt-1">
                                   <p className="text-sm font-bold">$340</p>
                                   <Button size="icon" className="h-7 w-7 rounded-lg bg-indigo-600 hover:bg-indigo-700"
                                     onClick={() => { addServiceAgreement("annual_air_cooled"); setFlatFolder(null); setWorkSubTab("parts"); }}>
                                     <Plus className="w-3.5 h-3.5" />
                                   </Button>
                                 </div>
                               </div>
                             </Card>
                             {/* Liquid-Cooled — disabled placeholder */}
                             <Card className="p-3.5 border-border bg-muted/30 opacity-60">
                               <div className="flex items-start justify-between gap-2">
                                 <div className="min-w-0 flex-1">
                                   <p className="text-sm font-semibold text-muted-foreground">Service Agreement (Liquid-Cooled)</p>
                                   <p className="text-xs text-muted-foreground">[Placeholder — Contract Pending]</p>
                                   <p className="text-[10px] text-muted-foreground mt-1">Liquid-cooled contract in development</p>
                                 </div>
                                 <div className="flex items-center gap-2 shrink-0 mt-1">
                                   <p className="text-sm font-bold text-muted-foreground">$595</p>
                                   <Button size="icon" className="h-7 w-7 rounded-lg" disabled>
                                     <Plus className="w-3.5 h-3.5" />
                                   </Button>
                                 </div>
                               </div>
                             </Card>
                             <Card className="p-3 border-amber-200 bg-amber-50/60">
                               <p className="text-xs font-bold text-amber-800">📋 How it works</p>
                               <p className="text-xs text-amber-700 mt-1 leading-relaxed">Adding an agreement charges the customer on this invoice. The signing step appears when you complete the job — customer reviews terms and signs before you leave.</p>
                             </Card>
                           </div>
                         )}

                        {/* Other flat rate folders via JobItemsTab */}
                        {flatFolder !== "service_agreements" && (
                           <JobItemsTab jobId={id} labor={labor} memberDiscountRate={memberDiscountRate} initialFolder="flat_rates" />
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════ DOCS TAB ════ */}
          {activeJobTab === "docs" && (
            <div className="p-4 pb-8">
              <JobDocsTab jobId={id} documents={documents} customerId={job.customer_id} />
            </div>
          )}

          {/* ════ PHOTOS TAB ════ */}
          {activeJobTab === "photos" && (
            <div className="p-4 pb-8">
              <JobPhotosTab jobId={id} photos={photos} isClosed={isClosed} />
            </div>
          )}

          {/* ════ HISTORY TAB ════ */}
          {activeJobTab === "history" && (
            <div className="p-4 space-y-3 pb-8">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {previousJobs.length} Previous Job{previousJobs.length !== 1 ? "s" : ""} — {job.customer_name}
              </p>
              {previousJobs.length === 0 ? (
                <Card className="p-6 text-center">
                  <p className="text-sm text-muted-foreground">No previous service history</p>
                  <p className="text-xs text-muted-foreground mt-1">This is the first job for this customer</p>
                </Card>
              ) : (
                previousJobs.map(prevJob => (
                  <Card key={prevJob.id} className="p-3.5">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{prevJob.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(prevJob.completed_date || prevJob.created_date)}
                          {prevJob.assigned_to_name ? ` · ${prevJob.assigned_to_name}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={prevJob.status} />
                        {prevJob.total_price > 0 && <p className="text-sm font-bold">{formatCurrency(prevJob.total_price)}</p>}
                      </div>
                    </div>
                    {prevJob.generator_notes && (
                      <p className="text-xs text-blue-700 bg-blue-50 rounded-lg px-2.5 py-1.5 border border-blue-100 leading-relaxed">{prevJob.generator_notes}</p>
                    )}
                    {prevJob.invoice_notes && !prevJob.generator_notes && (
                      <p className="text-xs text-muted-foreground leading-relaxed">{prevJob.invoice_notes}</p>
                    )}
                  </Card>
                ))
              )}
            </div>
          )}

          {/* ════ NOTES TAB ════ */}
          {activeJobTab === "notes" && (
            <div className="p-4 space-y-3 pb-8">
              {/* Generator notes */}
              {(job.generator_notes || !isClosed) && (
                <Card className="p-3.5 border-blue-200 bg-blue-50/40">
                  <div className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-white text-[10px] font-bold">G</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-blue-900 uppercase tracking-wider mb-1.5">Generator Notes (tech only)</p>
                      {!isClosed ? (
                        <Textarea
                          value={generatorNotes}
                          onChange={e => handleGeneratorNotesUpdate(e.target.value)}
                          className="text-sm rounded-xl resize-none border-blue-200 bg-white/60 min-h-[70px]"
                          rows={3}
                          placeholder="Fault codes, battery voltage, oil condition, anything for next tech..."
                        />
                      ) : (
                        generatorNotes ? <p className="text-sm text-blue-800 leading-relaxed">{generatorNotes}</p> : null
                      )}
                    </div>
                  </div>
                </Card>
              )}

              {/* Job notes */}
              {(job.notes || job.quote_notes) && (
                <Card className="p-3.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Job Notes</p>
                  {job.quote_notes && <p className="text-xs font-semibold text-muted-foreground mb-1">Quote Scope</p>}
                  {job.quote_notes && <p className="text-sm leading-relaxed mb-2">{job.quote_notes}</p>}
                  {job.notes && <p className="text-sm text-muted-foreground leading-relaxed">{job.notes}</p>}
                </Card>
              )}

              {/* Customer signature */}
              {(job.status === "in_progress" || job.status === "completed" || job.status === "invoiced") && (
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold">Customer Signature</p>
                      <p className="text-xs text-muted-foreground">{job.customer_signature ? "Signature on file" : "Not yet collected"}</p>
                    </div>
                    {!isClosed && (
                      <Dialog open={sigOpen} onOpenChange={setSigOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant={job.customer_signature ? "outline" : "default"} className="rounded-xl text-xs h-8 gap-1.5">
                            <PenLine className="w-3 h-3" />
                            {job.customer_signature ? "Re-sign" : "Collect Signature"}
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-sm">
                          <DialogHeader><DialogTitle>Customer Signature</DialogTitle></DialogHeader>
                          <p className="text-sm text-muted-foreground text-center italic">Please sign below to confirm work was completed satisfactorily</p>
                          <SignatureCanvas onSave={sig => { updateJob.mutate({ customer_signature: sig }); setSigOpen(false); toast.success("Signature saved"); }} />
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                  {job.customer_signature && (
                    <img src={job.customer_signature} alt="Customer signature" className="w-full max-h-24 object-contain rounded-xl border border-border bg-muted/20" />
                  )}
                </Card>
              )}
            </div>
          )}

          {/* ════ ITEMS TAB ════ */}
          {activeJobTab === "items" && (
            <div className="p-4 space-y-4 pb-8">
              {parts.length === 0 && labor.length === 0 && photos.length === 0 && documents.length === 0 ? (
                <Card className="p-8 text-center">
                  <Package className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nothing added yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Use the Work, Docs, and Photos tabs to add items</p>
                </Card>
              ) : (
                <>
                  {parts.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Parts ({parts.length})</p>
                      <div className="space-y-2">
                        {parts.map(part => (
                          <Card key={part.id} className="p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{part.name}</p>
                                <p className="text-xs text-muted-foreground">{part.quantity}x &middot; {formatCurrency(part.price)}/ea</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <p className="text-sm font-semibold">{formatCurrency(part.total_price)}</p>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                                  if (window.confirm(`Remove "${part.name}" from this job?`)) {
                                    db.JobPart.delete(part.id).then(() => queryClient.invalidateQueries({ queryKey: ["job-parts", id] }));
                                  }
                                }}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                  {labor.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Labor & Rates ({labor.length})</p>
                      <div className="space-y-2">
                        {labor.map(item => (
                          <Card key={item.id} className="p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{item.description}</p>
                                <p className="text-xs text-muted-foreground">{item.is_flat_rate ? "Flat rate" : `${item.hours}h @ ${formatCurrency(item.rate)}/hr`}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <p className="text-sm font-semibold">{formatCurrency(item.total_price)}</p>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                                  if (window.confirm(`Remove "${item.description}" from this job?`)) {
                                    db.JobLabor.delete(item.id).then(() => queryClient.invalidateQueries({ queryKey: ["job-labor", id] }));
                                  }
                                }}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                  {photos.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Photos ({photos.length})</p>
                      <div className="grid grid-cols-3 gap-2">
                        {photos.map(photo => (
                          <div key={photo.id} className="relative">
                            <a href={photo.url} target="_blank" rel="noopener noreferrer">
                              <img src={photo.url} alt="Job photo" className="w-full h-20 object-cover rounded-xl border border-border" />
                            </a>
                            <button onClick={() => {
                              if (window.confirm("Remove this photo from the job?")) {
                                db.JobPhoto.delete(photo.id).then(() => queryClient.invalidateQueries({ queryKey: ["job-photos", id] }));
                              }
                            }} className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center">
                              <Trash2 className="w-3 h-3 text-white" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {documents.length > 0 && (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Documents ({documents.length})</p>
                      <div className="space-y-2">
                        {documents.map(doc => (
                          <Card key={doc.id} className="p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{doc.template_name || "Document"}</p>
                                <p className="text-xs text-muted-foreground capitalize">{doc.status}</p>
                              </div>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                                if (window.confirm(`Remove "${doc.template_name || "this document"}" from this job?`)) {
                                  db.JobDocument.delete(doc.id).then(() => queryClient.invalidateQueries({ queryKey: ["job-docs", id] }));
                                }
                              }}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

        </div>
      </div>

    </div>
  );
}