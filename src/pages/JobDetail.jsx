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
import { Pencil, Check, X, FileText, Loader2, CheckCircle2, XCircle, Receipt, ChevronRight, ChevronDown, MapPin, PenLine, DollarSign, Navigation, ArrowLeft, Plus, Trash2, Search, User, Package, RefreshCw, AlertTriangle } from "lucide-react";
import CallButtons from "@/components/ui/CallButtons";
import StatusBadge from "@/components/ui/StatusBadge";
import RewardBadge from "@/components/ui/RewardBadge";
import JobPartsTab from "@/components/jobs/JobPartsTab";
import JobItemsTab from "@/components/jobs/JobItemsTab";
import JobDocsTab from "@/components/jobs/JobDocsTab";
import JobPhotosTab from "@/components/jobs/JobPhotosTab";
import { formatCurrency, formatDateTime, formatDate } from "@/lib/utils/format";
import { TAX_RATE, computeJobFinancials } from "@/lib/utils/jobFinancials";
import { formatTime, toDatetimeLocalValue } from "@/lib/formatTime";
import { usePreferences } from "@/hooks/usePreferences";
import { toast } from "sonner";
import { haptics } from "@/lib/haptics";
import { useState, useEffect, useCallback, useRef } from "react";
import { debounce } from "lodash";
import { useOfflineMutation } from "@/lib/useOfflineMutation";
import { useOffline } from "@/lib/OfflineContext";
import { useSettings } from "@/lib/useSettings";
import { useAuth } from "@/lib/AuthContext";
import { getUserDisplayName } from "@/lib/userColors";
import { notifyTeam, buildTable, buildRow, buildEventBadge } from "@/lib/notifyTeam";
import { useSwipeBack } from "@/hooks/useSwipeBack";
import { confirmationEmailHTML } from "@/lib/emailTemplates";
import { sendJobSummaryEmail, newResendNonce } from "@/lib/jobSummaryEmail";
import { buildInvoiceLineItems, isZeroDollarJob, canCloseAsNoCharge } from "@/lib/utils/invoiceTotals";
import { AGREEMENT_TYPE_TO_PLAN } from "@/lib/agreementTerms";
import { initSignatureCanvas } from "@/lib/signatureCanvas";
import SignatureGuideOverlay from "@/components/ui/SignatureGuideOverlay";

function SignatureCanvas({ onSave }) {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const [dismissed, setDismissed] = useState(false);
  const [slideClass, setSlideClass] = useState("translate-y-full");
  const isPortrait = typeof window !== "undefined" && window.innerWidth < window.innerHeight;

  // Slide-up animation on mount
  useEffect(() => {
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => setSlideClass("translate-y-0"));
    });
    return () => cancelAnimationFrame(t);
  }, []);

  // Background + pen only; the "Sign here" guide is a DOM overlay so it
  // never ends up in the exported PNG.
  const initCanvas = (canvas) => initSignatureCanvas(canvas);

  const canvasCallbackRef = (canvas) => {
    if (canvas && canvas !== canvasRef.current) {
      canvasRef.current = canvas;
      initCanvas(canvas);
    }
  };

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

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    initCanvas(canvas);
  };

  const handleDone = () => {
    const dataUrl = canvasRef.current.toDataURL("image/png");
    setSlideClass("translate-y-full");
    setTimeout(() => {
      setDismissed(true);
      onSave(dataUrl);
    }, 300);
  };

  if (dismissed) return null;

  const cw = typeof window !== "undefined" ? Math.round(window.innerWidth * 0.85) : 560;
  const ch = typeof window !== "undefined" ? Math.round(window.innerHeight * 0.50) : 280;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", zIndex: 9999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
    >
      <div
        style={{ transition: "transform 0.3s ease-out" }}
        className={`transform ${slideClass} flex flex-col items-center gap-4 w-full px-4`}
      >
        {/* Label */}
        <p style={{ color: "#ffffff", fontSize: "1rem", fontWeight: 600, letterSpacing: "0.02em" }}>Customer Signature</p>

        {/* Canvas */}
        <div style={{ position: "relative", display: "inline-block", lineHeight: 0 }}>
          <canvas
            ref={canvasCallbackRef}
            width={cw}
            height={ch}
            style={{ background: "#ffffff", borderRadius: "12px", display: "block", touchAction: "none" }}
            onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
            onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
          />
          <SignatureGuideOverlay />
        </div>

        {/* Portrait hint */}
        {isPortrait && (
          <p style={{ color: "#9ca3af", fontSize: "0.75rem" }}>Rotate device for more space</p>
        )}

        {/* Bottom action bar */}
        <div style={{ display: "flex", gap: "12px", width: "100%", maxWidth: `${cw}px` }}>
          <button
            onClick={clear}
            style={{ flex: 1, height: "44px", borderRadius: "12px", background: "#374151", color: "#ffffff", fontWeight: 600, fontSize: "0.9rem", border: "none", cursor: "pointer" }}
          >
            Clear
          </button>
          <button
            onClick={handleDone}
            style={{ flex: 1, height: "44px", borderRadius: "12px", background: "#D32C2C", color: "#ffffff", fontWeight: 600, fontSize: "0.9rem", border: "none", cursor: "pointer" }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}


function LiveTotalBar({ parts, labor, invoiceNotes, onNotesChange, generatorNotes, onGeneratorNotesChange, isSaving, onCollectPayment }) {
  const { partsTotal, laborGross, discountLines, subtotal, taxAmount, total } = computeJobFinancials(parts, labor);

  return (
    <Card className="p-4 bg-gradient-to-br from-primary/8 to-primary/4 border-primary/15 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Running Total</p>
        {isSaving && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> saving...</p>}
      </div>
      <div className="space-y-1.5">
        {partsTotal > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Parts</span>
            <span className="font-medium">{formatCurrency(partsTotal)}</span>
          </div>
        )}
        {laborGross > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Labor</span>
            <span className="font-medium">{formatCurrency(laborGross)}</span>
          </div>
        )}
        {discountLines.map((d, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{d.description}</span>
            <span className="font-medium text-destructive">{formatCurrency(d.amount)}</span>
          </div>
        ))}
        {discountLines.length > 0 && (
          <div className="flex items-center justify-between text-sm pt-1 border-t border-primary/10">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">{formatCurrency(subtotal)}</span>
          </div>
        )}
        {taxAmount > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">NJ Sales Tax (6.625%)</span>
            <span className="font-medium">{formatCurrency(taxAmount)}</span>
          </div>
        )}
        <div className="flex items-center justify-between pt-2 mt-1 border-t border-primary/10">
          <span className="text-sm font-semibold">Total</span>
          <span className="text-2xl font-bold text-primary tracking-tight">{formatCurrency(total)}</span>
        </div>
      </div>
      <div className="mt-2 pt-2 border-t border-blue-100/40 dark:border-blue-800/40">
        <p className="text-xs text-blue-700 dark:text-blue-300 font-medium mb-1 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
          Generator Notes (tech only)
        </p>
        <Textarea
          value={generatorNotes || ""}
          onChange={e => onGeneratorNotesChange?.(e.target.value)}
          className="text-sm rounded-xl resize-none border-blue-200 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-900/20 dark:text-gray-100 min-h-[56px]"
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
  const { user } = useAuth();
  const { confirmDelete, use24h } = usePreferences();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [resendingConfirmation, setResendingConfirmation] = useState(false);
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
  const [editingLaborPriceId, setEditingLaborPriceId] = useState(null);
  const [editingLaborPriceValue, setEditingLaborPriceValue] = useState("");
  const [editingPartPriceId, setEditingPartPriceId] = useState(null);
  const [editingPartPriceValue, setEditingPartPriceValue] = useState("");
  const [pendingPlan, setPendingPlan] = useState(null);
  const [customerExpanded, setCustomerExpanded] = useState(false);
  const [titleExpanded, setTitleExpanded] = useState(false);
  const [completeJobOpen, setCompleteJobOpen] = useState(false);
  const [completionSnapshot, setCompletionSnapshot] = useState(null);
  const [emailOnComplete, setEmailOnComplete] = useState(true);
  const [completingJob, setCompletingJob] = useState(false);
  const [resendOpen, setResendOpen] = useState(false);
  const [resendingSummary, setResendingSummary] = useState(false);
  const [closeNoChargeOpen, setCloseNoChargeOpen] = useState(false);
  const [closingNoCharge, setClosingNoCharge] = useState(false);
  useSwipeBack("/jobs");
  const [optimisticOnSiteTime, setOptimisticOnSiteTime] = useState(null);

  const { data: job, isLoading } = useQuery({
    queryKey: ["job", id],
    queryFn: async () => { const r = await db.Job.filter({ id }); return r[0]; },
  });

  const { data: parts = [], isSuccess: partsLoaded } = useQuery({
    queryKey: ["job-parts", id],
    queryFn: () => db.JobPart.filter({ job_id: id }),
  });

  const { data: labor = [], isSuccess: laborLoaded } = useQuery({
    queryKey: ["job-labor", id],
    queryFn: () => db.JobLabor.filter({ job_id: id }),
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["job-docs", id],
    queryFn: () => db.JobDocument.filter({ job_id: id }),
  });

  // Maintenance agreement signed during THIS job (job_agreements, migration
  // 0022). Its PDF rides on the completion email.
  const { data: jobAgreement = null } = useQuery({
    queryKey: ["job-agreement", id],
    queryFn: async () => {
      try { const r = await db.JobAgreement.filter({ job_id: id }); return r[0] || null; }
      catch { return null; }
    },
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
    initialData: () => queryClient.getQueryData(["job-invoice", id]),
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

  const updateLaborPriceMutation = useMutation({
    mutationFn: ({ id, data }) => db.JobLabor.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-labor", id] });
      setEditingLaborPriceId(null);
      toast.success("Price updated");
    },
    onError: () => toast.error("Failed to update price"),
  });

  const startEditingLaborPrice = (item) => {
    setEditingLaborPriceId(item.id);
    setEditingLaborPriceValue(String(item.is_flat_rate ? (item.flat_rate_amount ?? 0) : (item.rate ?? 0)));
  };

  const cancelLaborPriceEdit = () => {
    setEditingLaborPriceId(null);
    setEditingLaborPriceValue("");
  };

  const commitLaborPriceEdit = (item) => {
    const newPrice = parseFloat(editingLaborPriceValue);
    // Flat-rate items (e.g. discounts) may be negative to reduce the invoice; hourly rates may not.
    if (isNaN(newPrice) || (newPrice < 0 && !item.is_flat_rate)) { toast.error("Enter a valid price"); return; }
    if (item.is_flat_rate) {
      updateLaborPriceMutation.mutate({ id: item.id, data: { flat_rate_amount: newPrice, total_price: newPrice } });
    } else {
      updateLaborPriceMutation.mutate({ id: item.id, data: { rate: newPrice, total_price: newPrice * (item.hours || 0) } });
    }
  };

  const updatePartPriceMutation = useMutation({
    mutationFn: ({ id, price, quantity }) => db.JobPart.update(id, { price, total_price: price * quantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-parts", id] });
      setEditingPartPriceId(null);
      toast.success("Price updated");
    },
    onError: () => toast.error("Failed to update price"),
  });

  const startEditingPartPrice = (part) => {
    setEditingPartPriceId(part.id);
    setEditingPartPriceValue(String(part.price ?? 0));
  };

  const cancelPartPriceEdit = () => {
    setEditingPartPriceId(null);
    setEditingPartPriceValue("");
  };

  const commitPartPriceEdit = (part) => {
    const newPrice = parseFloat(editingPartPriceValue);
    if (isNaN(newPrice) || newPrice < 0) { toast.error("Enter a valid price"); return; }
    updatePartPriceMutation.mutate({ id: part.id, price: newPrice, quantity: part.quantity });
  };

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
    const f = computeJobFinancials(parts, labor);
    return { partsCost: f.partsCost, partsPrice: f.partsTotal, laborCost: f.laborCost, laborPrice: f.laborTotal };
  };

  const maybeOpenScheduleNext = () => {
    if (!["maintenance", "battery_replacement"].includes(job.job_type)) return;
    const intervalMonths = customer?.service_interval === "6_months" ? 6 : customer?.service_interval === "24_months" ? 24 : 12;
    const suggested = new Date();
    suggested.setMonth(suggested.getMonth() + intervalMonths);
    setNextDate(toDatetimeLocalValue(suggested));
    setScheduleNextOpen(true);
  };

  const handleStatusChange = async (newStatus, extraFields = {}) => {
    if (isClosed) return;
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
      const customerUpdate = { last_service_date: new Date().toISOString() };

      if (customer?.membership_plan === "semi_annual" && customer?.membership_signed) {
        const currentVisits = customer.membership_visits_used ?? 0;
        const newVisits = Math.min(currentVisits + 1, 2);
        customerUpdate.membership_visits_used = newVisits;

        if (newVisits === 1 && customer.membership_expiry) {
          const daysLeft = Math.ceil((new Date(customer.membership_expiry) - new Date()) / (1000 * 60 * 60 * 24));
          if (daysLeft > 60) {
            const expiryStr = new Date(customer.membership_expiry).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            setTimeout(() => toast.info(`Semi-annual member — 1 of 2 visits used. Second visit due before ${expiryStr}.`), 800);
          }
        }
      }

      db.Customer.update(job.customer_id, customerUpdate);
    }
    const triggeredBy = getUserDisplayName(user);
    if (newStatus === "dispatched") {
      notifyTeam({ subject: `Tech Dispatched — ${job.title} · ${job.customer_name}`, body: `${buildEventBadge("Dispatched", "amber")}${buildTable([buildRow("Customer", job.customer_name), buildRow("Address", customer?.address), buildRow("Job", job.title), buildRow("Tech", job.assigned_to_name || "Unassigned")])}`, triggeredBy });
    }
    if (newStatus === "on_site") {
      notifyTeam({ subject: `On Site — ${job.title} · ${job.customer_name}`, body: `${buildEventBadge("Arrived On Site", "amber")}${buildTable([buildRow("Customer", job.customer_name), buildRow("Address", customer?.address), buildRow("Job", job.title), buildRow("Tech", job.assigned_to_name || "Unassigned"), buildRow("Arrived", formatTime(new Date(), use24h))])}`, triggeredBy });
    }
    if (newStatus === "completed") {
      const { partsPrice, laborPrice } = getJobTotals();
      const total = partsPrice + laborPrice;
      notifyTeam({ subject: `Job Completed — ${job.title} · ${job.customer_name}${total > 0 ? ` · $${total.toFixed(2)}` : ""}`, body: `${buildEventBadge("Job Completed", "green")}${buildTable([buildRow("Customer", job.customer_name), buildRow("Job", job.title), buildRow("Type", job.job_type), buildRow("Tech", job.assigned_to_name || "Unassigned"), buildRow("Total", total > 0 ? `$${total.toFixed(2)}` : "TBD")])}`, triggeredBy });
    }
    if (newStatus === "canceled") {
      notifyTeam({ subject: `Job Canceled — ${job.title} · ${job.customer_name}`, body: `${buildEventBadge("Job Canceled", "red")}${buildTable([buildRow("Customer", job.customer_name), buildRow("Job", job.title), buildRow("Reason", cancelReason || "No reason given")])}`, triggeredBy });
    }
    haptics.medium();
    toast.success(`Job marked as ${newStatus.replace("_", " ")}`);
  };

  const handleCancel = () => {
    setCancelOpen(false);
    handleStatusChange("canceled", { cancel_reason: cancelReason });
  };

  // Resend for a job whose confirmation email failed or was never sent —
  // the only other confirmation-send path is the "Create & Send
  // Confirmation" choice at job creation (JobForm.jsx). This one never
  // touches job.status since the job may already be dispatched, on site,
  // or completed.
  const resendConfirmation = async () => {
    if (!customer?.email) return;
    setResendingConfirmation(true);
    try {
      const techFirstName = (job.assigned_to_name || '').split(' ')[0] || 'our technician';
      await integrationsCore.SendEmailWithRetry({
        to: customer.email,
        subject: `Appointment Confirmed — GenShield Generator Service`,
        html: confirmationEmailHTML({ customer, job, techFirstName, use24h }),
      });
      await db.Job.update(id, { confirmation_sent_at: new Date().toISOString(), confirmation_send_failed: false });
      queryClient.invalidateQueries({ queryKey: ['job', id] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      toast.success(`Confirmation sent to ${customer.email}`);
    } catch (e) {
      haptics.error();
      toast.error(`Failed to send confirmation: ${e.message}`);
      await db.Job.update(id, { confirmation_send_failed: true }).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['job', id] });
    } finally {
      setResendingConfirmation(false);
    }
  };

  const completedDocuments = documents.filter(d => d.status === "completed");

  // Agreement added to this job but not yet signed on it — must be signed
  // BEFORE Complete Job so its PDF can ride on the single completion email.
  // An already-active member (agreement line = renewal/upgrade) isn't blocked.
  const isActiveMember = !!(customer?.membership_signed && (!customer?.membership_expiry || new Date(customer.membership_expiry) > new Date()));
  const agreementLine = labor.find(l => l.requires_agreement);
  const agreementUnsigned = !!agreementLine && !jobAgreement && !isActiveMember;
  const goSignAgreement = () => {
    const plan = AGREEMENT_TYPE_TO_PLAN[agreementLine?.requires_agreement] || "annual";
    navigate(`/customers/${job.customer_id}/membership?from_job=${id}&plan=${plan}`);
  };

  const openCompleteJob = () => {
    if (job?.requires_document) {
      const hasCompleted = documents.some(d => d.status === "completed");
      if (!hasCompleted) { haptics.error(); toast.error("Complete at least one document before finishing this job"); return; }
    }
    if (agreementUnsigned) {
      haptics.error();
      toast.error("Customer must sign the Service Agreement before completing this job (or remove it from the job).", {
        action: { label: "Sign now", onClick: goSignAgreement },
      });
      return;
    }
    const hoursOnSite = elapsedSeconds / 3600;
    setCompletionSnapshot({
      time_on_site_seconds: elapsedSeconds,
      time_on_site_hours: Math.round(hoursOnSite * 4) / 4,
    });
    setEmailOnComplete(true);
    setCompleteJobOpen(true);
  };

  const patchInvoiceCache = (updated) => {
    queryClient.setQueryData(["job-invoice", id], (old) =>
      Array.isArray(old) ? old.map(inv => (inv.id === updated.id ? updated : inv)) : [updated]
    );
    queryClient.invalidateQueries({ queryKey: ["job-invoice", id] });
    queryClient.invalidateQueries({ queryKey: ["invoice", updated.id] });
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
  };

  // Complete Job: bring the invoice snapshot up to date from fresh DB rows
  // ($0.00 exactly -> close it as paid / payment_method 'no_charge'), mark the
  // job completed, then send the ONE completion email (server-built: invoice
  // inline + checklist/agreement PDFs). No other customer email is sent here.
  const doCompleteJob = async () => {
    setCompletingJob(true);
    try {
      const [freshParts, freshLabor] = await Promise.all([
        db.JobPart.filter({ job_id: id }),
        db.JobLabor.filter({ job_id: id }),
      ]);
      const fin = computeJobFinancials(freshParts, freshLabor);
      const zero = isZeroDollarJob(fin);
      if (existingInvoice && existingInvoice.status !== "paid") {
        const data = buildInvoiceData(freshParts, freshLabor);
        const patch = zero
          ? { ...data, status: "paid", payment_method: "no_charge", payment_reference: null, paid_date: new Date().toISOString() }
          : data;
        try {
          patchInvoiceCache(await db.Invoice.update(existingInvoice.id, patch));
        } catch (e) {
          haptics.error();
          toast.error(`Couldn't update the invoice: ${e.message}`);
          return;
        }
      }

      setCompleteJobOpen(false);
      await handleStatusChange("completed", completionSnapshot || {});

      if (customer?.email && emailOnComplete) {
        try {
          const r = await sendJobSummaryEmail({ jobId: id, kind: "completion" });
          if (r?.skipped === "already_sent") toast.info("Summary email was already sent for this job");
          else if (!r?.skipped) toast.success(`Summary sent to ${customer.email}`);
        } catch (e) {
          haptics.error();
          toast.error(`Failed to send summary email: ${e.message}`);
        }
        queryClient.invalidateQueries({ queryKey: ["job", id] });
      }

      if (["maintenance", "battery_replacement"].includes(job.job_type)) {
        maybeOpenScheduleNext();
      } else {
        navigate("/jobs");
      }
    } finally {
      setCompletingJob(false);
    }
  };

  // Legacy stuck $0 jobs (completed before $0 invoices were auto-closed):
  // close the $0 invoice as paid / no_charge exactly like the completion path
  // does — rebuilt line items, paid_date now — but send NOTHING. Re-checks the
  // $0.00 guard against fresh DB rows + the stored invoice before writing.
  const doCloseNoCharge = async () => {
    setClosingNoCharge(true);
    try {
      const [freshParts, freshLabor, freshInvoices] = await Promise.all([
        db.JobPart.filter({ job_id: id }),
        db.JobLabor.filter({ job_id: id }),
        db.Invoice.filter({ job_id: id }),
      ]);
      const inv = freshInvoices.find(i => i.id === existingInvoice?.id);
      const fin = computeJobFinancials(freshParts, freshLabor);
      if (!canCloseAsNoCharge({ jobStatus: job.status, invoice: inv, financials: fin })) {
        haptics.error();
        toast.error("This job's invoice isn't exactly $0.00 (or is already closed) — not changed.");
        return;
      }
      const data = buildInvoiceData(freshParts, freshLabor);
      const patch = { ...data, status: "paid", payment_method: "no_charge", payment_reference: null, paid_date: new Date().toISOString() };
      patchInvoiceCache(await db.Invoice.update(inv.id, patch));
      setCloseNoChargeOpen(false);
      toast.success("Closed as no charge — no email sent");
    } catch (e) {
      haptics.error();
      toast.error(`Couldn't close the invoice: ${e.message}`);
    } finally {
      setClosingNoCharge(false);
    }
  };

  // Explicit manual resend only (never part of the normal completion flow).
  const doResendSummary = async () => {
    setResendingSummary(true);
    try {
      const r = await sendJobSummaryEmail({ jobId: id, kind: "resend", nonce: newResendNonce() });
      if (r?.skipped === "no_email") toast.error("No email on file for this customer");
      else toast.success(`Summary re-sent to ${customer?.email}`);
      setResendOpen(false);
    } catch (e) {
      haptics.error();
      toast.error(`Failed to resend: ${e.message}`);
    } finally {
      setResendingSummary(false);
      queryClient.invalidateQueries({ queryKey: ["job", id] });
    }
  };

  const buildInvoiceData = (p = parts, l = labor) => {
    const { partsTotal, laborTotal, taxAmount, total } = computeJobFinancials(p, l);
    // charge_for_part: false parts are $0 by design (not billed) — hidden on
    // the customer-facing invoice/email, which render off this stored
    // line_items snapshot. Exception: on an exactly-$0 invoice they're listed
    // as "No charge" so a free visit's summary isn't an empty table.
    // Internal views (Job Detail's Parts/Work tab) render live `parts` state
    // directly, not this snapshot, so they're unaffected.
    const lineItems = buildInvoiceLineItems(p, l, { includeNoChargeParts: isZeroDollarJob({ total }) });
    return { parts_total: partsTotal, labor_total: laborTotal, total, tax_amount: taxAmount, tax_rate: TAX_RATE, line_items: lineItems, notes: invoiceNotes, customer_signature: job.customer_signature || null };
  };

  // Parts/labor mutations (add, edit price, delete) only ever invalidate their
  // own query — nothing recomputes an already-created invoice, so its stored
  // total/tax silently goes stale the moment a line item changes after
  // Finalize/Collect Payment. Keep it in sync automatically, matching the
  // stored-invoice-cache pattern from the payment stale-data fix. Skip once
  // paid — a paid invoice's total shouldn't retroactively change.
  // Line items are compared too (not just totals): a job that stays at $0
  // (or where a change doesn't move the totals) otherwise never gets its
  // line_items written and the invoice renders as an empty table. That
  // line-items-only resync is limited to jobs that aren't completed yet, so
  // opening an old completed job never rewrites its invoice.
  useEffect(() => {
    if (!job || !existingInvoice || existingInvoice.status === "paid") return;
    if (!partsLoaded || !laborLoaded) return;
    const fresh = buildInvoiceData();
    const totalsUnchanged =
      Math.abs((existingInvoice.parts_total || 0) - fresh.parts_total) < 0.005 &&
      Math.abs((existingInvoice.labor_total || 0) - fresh.labor_total) < 0.005 &&
      Math.abs((existingInvoice.tax_amount || 0) - fresh.tax_amount) < 0.005;
    const jobOpen = !["completed", "invoiced", "canceled"].includes(job.status);
    const itemsUnchanged = !jobOpen ||
      JSON.stringify(existingInvoice.line_items || []) === JSON.stringify(fresh.line_items);
    if (totalsUnchanged && itemsUnchanged) return;

    db.Invoice.update(existingInvoice.id, fresh).then(patchInvoiceCache);
  }, [parts, labor, existingInvoice?.id, existingInvoice?.status, partsLoaded, laborLoaded]);

  const handleCollectPayment = async () => {
    const invoiceData = buildInvoiceData();
    if (existingInvoice) {
      await db.Invoice.update(existingInvoice.id, invoiceData);
      navigate(`/invoices/${existingInvoice.id}`, { state: { fromJobId: id } });
    } else {
      const inv = await db.Invoice.create({
        ...invoiceData, job_id: id, customer_id: job.customer_id, customer_name: job.customer_name,
        invoice_number: `INV-${Date.now().toString(36).toUpperCase()}`, status: "draft",
      });
      navigate(`/invoices/${inv.id}`, { state: { fromJobId: id } });
    }
  };
  const addServiceAgreement = async (type) => {
    const FALLBACK = {
      annual_air_cooled: {
        description: "Annual Service Agreement — Air-Cooled Generator · 1 maintenance visit/yr · 10% off parts, labor & repairs",
        flat_rate_amount: 325,
      },
      semi_annual_air_cooled: {
        description: "Semi-Annual Service Agreement — Air-Cooled Generator · 2 maintenance visits/yr · 15% off parts, labor & repairs",
        flat_rate_amount: 575,
      },
    };
    let details = FALLBACK[type] ?? { description: `Service Agreement — ${type.replace(/_/g, " ")}`, flat_rate_amount: 0 };
    try {
      const rates = await db.LaborRate.filter({ category: "service_agreements" });
      const isSemi = type.startsWith("semi");
      // Must also gate on "air-cooled" — the catalog has liquid-cooled placeholder
      // rows in this same category with their own annual/semi-annual names, and
      // without this check the match could silently resolve to one of those instead
      // (their price is unrelated and shouldn't ever be charged for an air-cooled job).
      const match = rates.find(r => {
        const name = r.name.toLowerCase();
        return name.includes("air-cooled") && (isSemi ? name.includes("semi") : !name.includes("semi") && name.includes("annual"));
      });
      if (match && match.flat_price > 0) {
        details = { ...details, flat_rate_amount: Number(match.flat_price) };
      }
    } catch {
      // catalog fetch failed — fall back to hardcoded prices above
    }
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
  // Completed jobs are done: no editing the job itself or canceling it.
  // (Payment, resend summary, photos and notes stay available as before.)
  const canEditOrCancel = !isClosed && job.status !== "completed";
  const isMember = !!(customer?.membership_plan && customer?.membership_signed);
  const isSemiMember = !!(customer?.membership_plan === "semi_annual" && customer?.membership_signed);
  const memberDiscountRate = isSemiMember ? 0.85 : isMember ? 0.90 : 1.0;
  const hasPendingAgreement = labor.some(l => l.requires_agreement);
  const pendingAgreementLine = labor.find(l => l.requires_agreement);
  // Exactly $0.00 (integer cents) on live job rows — never prompt to collect.
  const isNoChargeJob = partsLoaded && laborLoaded && isZeroDollarJob(computeJobFinancials(parts, labor));
  // Legacy stuck $0 job (completed, $0 invoice never closed) -> offer a
  // no-email close. Same strict $0.00-in-cents guard is re-run on click.
  const showCloseNoCharge = partsLoaded && laborLoaded &&
    canCloseAsNoCharge({ jobStatus: job.status, invoice: existingInvoice, financials: computeJobFinancials(parts, labor) });
  const isActive = ["dispatched", "on_site"].includes(job.status);
  const headerBg = job.status === "on_site" ? "bg-amber-500" : job.status === "dispatched" ? "bg-cyan-600" : isClosed ? "bg-gray-600" : "bg-primary";
  const headerDot = job.status === "on_site" ? "bg-amber-300" : "bg-cyan-300";
  const tabActiveColor = job.status === "on_site" ? "#d97706" : job.status === "dispatched" ? "#0891b2" : "hsl(var(--primary))";

  return (
    <div className="flex flex-col h-screen bg-muted/30">

      {/* ── COLORED ACTIVE JOB HEADER ── */}
      <div className={`${headerBg} px-4 pt-3 pb-3 shrink-0`}>
        <div className="flex items-center justify-between gap-2 max-w-lg mx-auto min-w-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <button
              onClick={() => navigate("/jobs")}
              className="w-8 h-8 rounded-xl bg-white/20 active:bg-white/30 flex items-center justify-center shrink-0"
            >
              <ArrowLeft className="w-4 h-4 text-white" />
            </button>
            <div className="min-w-0 flex-1">
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
              {/* Long titles: clamp to 2 lines on phones; tap to show the full
                  title (also in the title attribute / Overview). */}
              <p
                data-testid="job-header-title"
                title={job.title}
                onClick={() => setTitleExpanded(v => !v)}
                className={`text-white font-bold text-base leading-tight break-words cursor-pointer ${titleExpanded ? "" : "line-clamp-2"}`}
              >
                {job.title}
              </p>
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-white/75 text-xs truncate min-w-0">{job.customer_name}{job.assigned_to_name ? ` · ${job.assigned_to_name}` : ""}</p>
                <RewardBadge show={customer?.pending_reward} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {job.status === "on_site" && (
              <div className="text-right">
                <p className="font-mono text-white text-lg font-bold tracking-wider">{formatElapsed(elapsedSeconds)}</p>
                <p className="text-white/70 text-[10px]">{(elapsedSeconds / 3600).toFixed(2)}h on site</p>
              </div>
            )}
            {canEditOrCancel && (
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
      <div className="bg-white dark:bg-gray-900 border-b border-border shrink-0 shadow-sm min-w-0">
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
      <div className="flex-1 overflow-y-auto" style={{ touchAction: "pan-y" }}>
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
                {job.customer_description?.trim() && (
                  <div className="mx-3.5 mb-3.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 dark:bg-emerald-900/20 dark:border-emerald-700">
                    <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider mb-1">Job Description · Customer-facing</p>
                    <p className="text-xs text-emerald-800 dark:text-emerald-200 leading-relaxed whitespace-pre-line">
                      {job.customer_description.trim()}
                    </p>
                  </div>
                )}
                {(job.quote_notes || job.notes) && (
                  <div className="mx-3.5 mb-3.5 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2.5 dark:bg-sky-900/20 dark:border-sky-700">
                    <p className="text-[10px] font-bold text-sky-700 dark:text-sky-300 uppercase tracking-wider mb-1">Summary</p>
                    <p className="text-xs text-sky-800 dark:text-sky-200 leading-relaxed">
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
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-bold text-foreground">{job.customer_name}</p>
                        <RewardBadge show={customer?.pending_reward} />
                      </div>
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
                      <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 dark:bg-blue-900/20 dark:border-blue-700">
                        <p className="text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider mb-1">Generator</p>
                        {customer.generator_model && (
                          <p className="text-xs font-semibold text-blue-900 dark:text-blue-200">{customer.generator_model}</p>
                        )}
                        {customer.generator_serial && (
                          <p className="text-xs text-blue-600 dark:text-blue-400">S/N {customer.generator_serial}</p>
                        )}
                      </div>
                    )}
                    {customer?.repeat_note && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 dark:bg-amber-900/20 dark:border-amber-700">
                        <div className="flex items-start gap-2">
                          <div className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-white text-[9px] font-bold">!</span>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider mb-0.5">Always Remember</p>
                            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">{customer.repeat_note}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {customer?.property_notes && (
                      <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-3 py-2 border border-amber-200 dark:border-amber-700">
                        ⚠ {customer.property_notes}
                      </p>
                    )}
                    {isMember && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 dark:bg-emerald-900/20 dark:border-emerald-700">
                        <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider mb-1">Membership</p>
                        <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                          {customer.membership_plan === "semi_annual" ? "Semi-Annual" : "Annual"} Protection Plan
                        </p>
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">
                          10% off all parts & labor
                          {customer.membership_expiry ? ` · Expires ${new Date(customer.membership_expiry).toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : ""}
                        </p>
                      </div>
                    )}
                    <div className="flex gap-2 pt-0.5">
                      {customer?.phone && (
                        <CallButtons phone={customer.phone} />
                      )}
                      {customer?.address && (
                        <a href={`https://maps.google.com/?q=${encodeURIComponent(customer.address)}`} target="_blank" rel="noopener noreferrer" className="flex-1">
                          <button className="w-full flex items-center justify-center gap-1.5 h-9 rounded-xl bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-700 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-300">
                            <MapPin className="w-3.5 h-3.5" /> Directions
                          </button>
                        </a>
                      )}
                      <Link to={`/customers/${job.customer_id}`} className="flex-1">
                        <button className="w-full flex items-center justify-center gap-1.5 h-9 rounded-xl bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-700 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-300">
                          <User className="w-3.5 h-3.5" /> Profile
                        </button>
                      </Link>
                    </div>
                  </div>
                )}
              </Card>

              {/* ── On site timer ── */}
              {job.status === "on_site" && (
                <Card className="p-4 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 uppercase tracking-wider">On Site — Clock Running</p>
                      <p className="text-3xl font-bold font-mono text-amber-700 dark:text-amber-300 mt-1">{formatElapsed(elapsedSeconds)}</p>
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{(elapsedSeconds / 3600).toFixed(2)} hours on site</p>
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
                onCollectPayment={!isClosed && !isNoChargeJob && existingInvoice?.status !== "paid" ? handleCollectPayment : undefined}
                isSaving={updateJob.isPending}
              />

              {/* Service Agreement status card */}
              {hasPendingAgreement && (
                jobAgreement ? (
                  <Card className="p-3.5 border-green-200 bg-green-50 dark:border-green-700 dark:bg-green-900/20">
                    <p className="text-xs font-bold text-green-900 dark:text-green-200 flex items-center gap-1.5">
                      ✅ SERVICE AGREEMENT SIGNED ON THIS JOB
                    </p>
                    <p className="text-xs text-green-800 dark:text-green-300 mt-0.5">{jobAgreement.plan_name}</p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">Signed contract (PDF) is emailed with the job summary at completion</p>
                  </Card>
                ) : customer?.membership_signed ? (
                  <Card className="p-3.5 border-green-200 bg-green-50 dark:border-green-700 dark:bg-green-900/20">
                    <p className="text-xs font-bold text-green-900 dark:text-green-200 flex items-center gap-1.5">
                      ✅ SERVICE AGREEMENT ACTIVE
                    </p>
                    <p className="text-xs text-green-800 dark:text-green-300 mt-0.5">{pendingAgreementLine?.description}</p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">Signed · Discounts applied automatically</p>
                  </Card>
                ) : (
                  <Card className="p-3.5 border-indigo-200 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-900/20">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">📋 SERVICE AGREEMENT PENDING</p>
                        <p className="text-xs text-indigo-800 dark:text-indigo-300 mt-0.5">{pendingAgreementLine?.description}</p>
                        <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">{formatCurrency(pendingAgreementLine?.flat_rate_amount)}/yr · Customer signature required</p>
                      </div>
                      <Button size="sm" className="rounded-xl h-8 text-xs bg-indigo-600 hover:bg-indigo-700 shrink-0 ml-2"
                        onClick={goSignAgreement}>
                        Sign
                      </Button>
                    </div>
                  </Card>
                )
              )}

              {/* Confirmation email needs attention — failed send or never sent */}
              {!isClosed && job.status !== "completed" && customer?.email &&
                (job.confirmation_send_failed || !job.confirmation_sent_at) && (
                <Card className="p-3.5 border-red-200 bg-red-50 dark:border-red-700 dark:bg-red-900/20">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                    <span className="text-sm font-semibold text-red-800 dark:text-red-200">
                      {job.confirmation_send_failed ? "Confirmation email failed to send" : "Confirmation email never sent"}
                    </span>
                  </div>
                  <Button size="sm" variant="outline" className="w-full rounded-xl gap-1.5 mt-2 border-red-300 dark:border-red-600 text-red-800 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30"
                    disabled={resendingConfirmation}
                    onClick={resendConfirmation}>
                    {resendingConfirmation
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending...</>
                      : <><RefreshCw className="w-3.5 h-3.5" /> Resend Confirmation Email</>}
                  </Button>
                </Card>
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
                      <div className="flex items-center gap-2 text-xs text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-700 rounded-xl px-3 py-2.5">
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
                      onClick={openCompleteJob}>
                      <CheckCircle2 className="w-4 h-4" /> Complete Job
                    </Button>
                  )}
                  {job.status === "completed" && (
                    <div className="space-y-2">
                      {/* Legacy: agreement left unsigned on an already-completed job.
                          Signed standalone (not from_job) so the customer still
                          gets the "Protection Plan Active" email with it. */}
                      {hasPendingAgreement && !customer?.membership_signed && (
                        <Button className="w-full rounded-xl gap-1.5 h-11 bg-indigo-600 hover:bg-indigo-700"
                          onClick={() => navigate(`/customers/${job.customer_id}/membership`)}>
                          🛡️ Customer Sign Protection Agreement
                        </Button>
                      )}
                      {existingInvoice?.status === "paid" && existingInvoice?.payment_method === "no_charge" ? (
                        <Card className="p-3 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-700">
                          <p className="text-sm font-semibold text-green-800 dark:text-green-200 flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4" /> No charge — {formatCurrency(0)}
                          </p>
                        </Card>
                      ) : existingInvoice?.status === "paid" ? (
                        <Card className="p-3 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-700">
                          <p className="text-sm font-semibold text-green-800 dark:text-green-200 flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4" /> Paid — {formatCurrency(existingInvoice.total)}
                          </p>
                        </Card>
                      ) : isNoChargeJob ? (
                        <>
                          <Card className="p-3 bg-muted/40">
                            <p className="text-sm font-semibold flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4" /> No charge — {formatCurrency(0)}
                            </p>
                            {showCloseNoCharge && (
                              <p className="text-xs text-muted-foreground mt-0.5">Invoice is still open. Close it as no charge, or resend the summary email.</p>
                            )}
                          </Card>
                          {showCloseNoCharge && (
                            <Button className="w-full rounded-xl gap-1.5 h-11" onClick={() => setCloseNoChargeOpen(true)}>
                              <CheckCircle2 className="w-4 h-4" /> Close as No Charge (no email)
                            </Button>
                          )}
                        </>
                      ) : (
                        <Button className="w-full rounded-xl gap-1.5 h-11 bg-green-600 hover:bg-green-700" onClick={handleCollectPayment}>
                          <DollarSign className="w-4 h-4" /> Collect Payment Now
                        </Button>
                      )}
                      {customer?.email && job.completion_send_failed && (
                        <Card className="p-3.5 border-red-200 bg-red-50 dark:border-red-700 dark:bg-red-900/20">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                            <span className="text-sm font-semibold text-red-800 dark:text-red-200">Job summary email failed to send</span>
                          </div>
                        </Card>
                      )}
                      {customer?.email && (
                        <Button variant="outline" className="w-full rounded-xl gap-1.5 h-10 text-sm" onClick={() => setResendOpen(true)}>
                          <RefreshCw className="w-4 h-4" /> Resend Summary Email
                        </Button>
                      )}
                    </div>
                  )}
                  {canEditOrCancel && (
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

              {/* Legacy $0 job: close invoice as no charge, no email */}
              <Dialog open={closeNoChargeOpen} onOpenChange={setCloseNoChargeOpen}>
                <DialogContent className="max-w-sm">
                  <DialogHeader><DialogTitle>Close as No Charge?</DialogTitle></DialogHeader>
                  <p className="text-sm text-muted-foreground">
                    Marks this job's {formatCurrency(0)} invoice{existingInvoice?.invoice_number ? ` ${existingInvoice.invoice_number}` : ""} as closed — no charge.
                    <strong className="text-foreground"> No email is sent to the customer.</strong>
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setCloseNoChargeOpen(false)}>Cancel</Button>
                    <Button className="flex-1 rounded-xl gap-1.5" disabled={closingNoCharge} onClick={doCloseNoCharge}>
                      {closingNoCharge ? <><Loader2 className="w-4 h-4 animate-spin" /> Closing...</> : "Close, No Email"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Manual resend of the job summary email (explicit action only) */}
              <Dialog open={resendOpen} onOpenChange={setResendOpen}>
                <DialogContent className="max-w-sm">
                  <DialogHeader><DialogTitle>Resend Summary Email?</DialogTitle></DialogHeader>
                  <p className="text-sm text-muted-foreground">
                    The customer already received the job summary automatically when the job was completed.
                    This sends another copy (invoice{completedDocuments.length > 0 ? " + checklist PDFs" : ""}{jobAgreement ? " + signed agreement" : ""}) to {customer?.email}.
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setResendOpen(false)}>Cancel</Button>
                    <Button className="flex-1 rounded-xl gap-1.5" disabled={resendingSummary} onClick={doResendSummary}>
                      {resendingSummary ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : "Resend"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Complete Job modal */}
              <Dialog open={completeJobOpen} onOpenChange={setCompleteJobOpen}>
                <DialogContent className="max-w-sm">
                  <DialogHeader><DialogTitle>Complete Job</DialogTitle></DialogHeader>

                  {isNoChargeJob ? (
                    <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5">
                      <p className="text-xs font-semibold">No charge — {formatCurrency(0)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Nothing to collect. The invoice will be closed as no charge.</p>
                    </div>
                  ) : existingInvoice && existingInvoice.status !== "paid" && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 px-3 py-2.5">
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">⚠ Invoice is still unpaid</p>
                      <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">You can complete the job and collect payment later.</p>
                    </div>
                  )}

                  {customer?.email ? (
                    <div className="space-y-2">
                      <button
                        onClick={() => setEmailOnComplete(v => !v)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors text-left ${emailOnComplete ? "border-primary bg-primary/5" : "border-border bg-card"}`}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${emailOnComplete ? "border-primary bg-primary" : "border-muted-foreground"}`}>
                          {emailOnComplete && <CheckCircle2 className="w-3 h-3 text-white" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">Email job summary</p>
                          <p className="text-xs text-muted-foreground truncate">{customer.email}</p>
                        </div>
                      </button>
                      {emailOnComplete && (
                        <ul className="text-xs text-muted-foreground space-y-1 px-1">
                          {existingInvoice && (
                            <li className="flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5 shrink-0" /> Invoice {existingInvoice.invoice_number} (in the email)</li>
                          )}
                          {completedDocuments.map(doc => (
                            <li key={doc.id} className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{doc.template_name}</span> (PDF)</li>
                          ))}
                          {jobAgreement && (
                            <li className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 shrink-0" /> Signed Maintenance Agreement (PDF)</li>
                          )}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No email on file — nothing will be sent, but the job will still complete.</p>
                  )}

                  <div className="flex gap-2 mt-2">
                    <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setCompleteJobOpen(false)}>Cancel</Button>
                    <Button
                      className="flex-1 rounded-xl gap-1.5 bg-green-600 hover:bg-green-700"
                      disabled={completingJob}
                      onClick={doCompleteJob}
                    >
                      {completingJob
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Completing...</>
                        : <><CheckCircle2 className="w-4 h-4" /> Complete Job</>}
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
                    <Button variant="outline" className="flex-1 rounded-xl" onClick={() => { setScheduleNextOpen(false); navigate("/jobs"); }}>Skip</Button>
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
                      navigate("/jobs");
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
              {/* Parts: filters this job's parts AND searches the whole catalog
                  (name or part #) — JobPartsTab renders tap-to-add matches. */}
              <div className="sticky top-0 z-10 bg-background px-4 pt-2 pb-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    type="search"
                    enterKeyHint="search"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    placeholder={
                      workSubTab === "parts" ? "Search parts — name or part #"
                      : workSubTab === "labor" ? "Search labor rates..."
                      : "Search flat rates..."
                    }
                    aria-label={workSubTab === "parts" ? "Search parts" : workSubTab === "labor" ? "Search labor rates" : "Search flat rates"}
                    value={workSearch}
                    onChange={e => setWorkSearch(e.target.value)}
                    className="pl-9 pr-11 rounded-xl h-11 text-sm [&::-webkit-search-cancel-button]:hidden"
                  />
                  {workSearch && (
                    <button
                      type="button"
                      aria-label="Clear search"
                      onClick={() => setWorkSearch("")}
                      className="absolute right-0 top-0 h-11 w-11 flex items-center justify-center text-muted-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
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
                              <div className="flex items-center gap-1.5 shrink-0">
                                {editingLaborPriceId === item.id ? (
                                  <>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      value={editingLaborPriceValue}
                                      onChange={e => setEditingLaborPriceValue(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === "Enter") commitLaborPriceEdit(item);
                                        if (e.key === "Escape") cancelLaborPriceEdit();
                                      }}
                                      className="w-20 h-7 text-sm text-right px-2 rounded-lg"
                                      autoFocus
                                    />
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:bg-green-50"
                                      onClick={() => commitLaborPriceEdit(item)} disabled={updateLaborPriceMutation.isPending}>
                                      <Check className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={cancelLaborPriceEdit}>
                                      <X className="w-3.5 h-3.5" />
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <p className="text-sm font-bold">{formatCurrency(item.total_price)}</p>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                      onClick={() => startEditingLaborPrice(item)}>
                                      <Pencil className="w-3 h-3" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7"
                                      onClick={() => db.JobLabor.delete(item.id).then(() => queryClient.invalidateQueries({ queryKey: ["job-labor", id] }))}>
                                      <Trash2 className="w-3 h-3 text-destructive" />
                                    </Button>
                                  </>
                                )}
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
                      <Card key={i} className="p-3 flex items-center justify-between border-orange-200 bg-orange-50/40 dark:border-orange-700 dark:bg-orange-900/20">
                        <div>
                          <p className="text-sm font-medium">{r.name}</p>
                          <p className="text-xs text-orange-600 dark:text-orange-400">{r.sub}{isMember ? ` · ${Math.round((1-memberDiscountRate)*100)}% off` : ""}</p>
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
                      <Card key={i} className="p-3 flex items-center justify-between border-red-200 bg-red-50/40 dark:border-red-700 dark:bg-red-900/20">
                        <div>
                          <p className="text-sm font-medium">{r.name}</p>
                          <p className="text-xs text-red-500 dark:text-red-400">{r.sub}</p>
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
                          { key: "discounts", icon: "🏷️", label: "Discounts" },
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
                             {/* Air-Cooled Annual — enabled */}
                             <Card className="p-3.5 border-indigo-200 bg-indigo-50/40 dark:border-indigo-700 dark:bg-indigo-900/20">
                               <div className="flex items-start justify-between gap-2">
                                 <div className="min-w-0 flex-1">
                                   <div className="flex items-center gap-2 flex-wrap mb-1">
                                     <p className="text-sm font-semibold">Service Agreement (Air-Cooled) — Annual</p>
                                     <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200">Agreement Required</span>
                                   </div>
                                   <p className="text-xs text-muted-foreground">1 maintenance visit/yr · 10% off parts, labor & repairs</p>
                                   <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-1 font-medium">Price is fixed — not subject to member discount</p>
                                 </div>
                                 <div className="flex items-center gap-2 shrink-0 mt-1">
                                   <p className="text-sm font-bold">$325</p>
                                   <Button size="icon" className="h-7 w-7 rounded-lg bg-indigo-600 hover:bg-indigo-700"
                                     onClick={() => { addServiceAgreement("annual_air_cooled"); setFlatFolder(null); setWorkSubTab("parts"); }}>
                                     <Plus className="w-3.5 h-3.5" />
                                   </Button>
                                 </div>
                               </div>
                             </Card>
                             {/* Air-Cooled Semi-Annual — enabled */}
                             <Card className="p-3.5 border-indigo-200 bg-indigo-50/40 dark:border-indigo-700 dark:bg-indigo-900/20">
                               <div className="flex items-start justify-between gap-2">
                                 <div className="min-w-0 flex-1">
                                   <div className="flex items-center gap-2 flex-wrap mb-1">
                                     <p className="text-sm font-semibold">Service Agreement (Air-Cooled) — Semi-Annual</p>
                                     <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200">Agreement Required</span>
                                   </div>
                                   <p className="text-xs text-muted-foreground">2 maintenance visits/yr · 15% off parts, labor & repairs</p>
                                   <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-1 font-medium">Price is fixed — not subject to member discount</p>
                                 </div>
                                 <div className="flex items-center gap-2 shrink-0 mt-1">
                                   <p className="text-sm font-bold">$575</p>
                                   <Button size="icon" className="h-7 w-7 rounded-lg bg-indigo-600 hover:bg-indigo-700"
                                     onClick={() => { addServiceAgreement("semi_annual_air_cooled"); setFlatFolder(null); setWorkSubTab("parts"); }}>
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
                             <Card className="p-3 border-amber-200 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-900/20">
                               <p className="text-xs font-bold text-amber-800 dark:text-amber-200">📋 How it works</p>
                               <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 leading-relaxed">Adding an agreement charges the customer on this invoice. The signing step appears when you complete the job — customer reviews terms and signs before you leave.</p>
                             </Card>
                           </div>
                         )}

                        {/* Other flat rate folders via JobItemsTab */}
                        {flatFolder !== "service_agreements" && (
                           <JobItemsTab key={flatFolder} jobId={id} labor={labor} parts={parts} memberDiscountRate={memberDiscountRate} initialFolder="flat_rates" presetSubFolderKey={flatFolder} customerId={job.customer_id} />
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
                      <p className="text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-2.5 py-1.5 border border-blue-100 dark:border-blue-700 leading-relaxed">{prevJob.generator_notes}</p>
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
                <Card className="p-3.5 border-blue-200 bg-blue-50/40 dark:border-blue-700 dark:bg-blue-900/20">
                  <div className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-white text-[10px] font-bold">G</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-bold text-blue-900 dark:text-blue-200 uppercase tracking-wider mb-1.5">Generator Notes (tech only)</p>
                      {!isClosed ? (
                        <Textarea
                          value={generatorNotes}
                          onChange={e => handleGeneratorNotesUpdate(e.target.value)}
                          className="text-sm rounded-xl resize-none border-blue-200 dark:border-blue-700 bg-white/60 dark:bg-gray-800/60 dark:text-gray-100 min-h-[70px]"
                          rows={3}
                          placeholder="Fault codes, battery voltage, oil condition, anything for next tech..."
                        />
                      ) : (
                        generatorNotes ? <p className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed">{generatorNotes}</p> : null
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
                          <SignatureCanvas onSave={sig => { haptics.success(); updateJob.mutate({ customer_signature: sig }); setSigOpen(false); toast.success("Signature saved"); }} />
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
                              <div className="flex items-center gap-1.5 shrink-0">
                                {editingPartPriceId === part.id ? (
                                  <>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={editingPartPriceValue}
                                      onChange={e => setEditingPartPriceValue(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === "Enter") commitPartPriceEdit(part);
                                        if (e.key === "Escape") cancelPartPriceEdit();
                                      }}
                                      className="w-20 h-7 text-sm text-right px-2 rounded-lg"
                                      autoFocus
                                    />
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:bg-green-50"
                                      onClick={() => commitPartPriceEdit(part)} disabled={updatePartPriceMutation.isPending}>
                                      <Check className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={cancelPartPriceEdit}>
                                      <X className="w-3.5 h-3.5" />
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <p className="text-sm font-semibold">{formatCurrency(part.total_price)}</p>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                      onClick={() => startEditingPartPrice(part)}>
                                      <Pencil className="w-3 h-3" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                                      if (!confirmDelete || window.confirm(`Remove "${part.name}" from this job?`)) {
                                        haptics.medium();
                                        db.JobPart.delete(part.id).then(() => queryClient.invalidateQueries({ queryKey: ["job-parts", id] }));
                                      }
                                    }}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                                  </>
                                )}
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
                              <div className="flex items-center gap-1.5 shrink-0">
                                {editingLaborPriceId === item.id ? (
                                  <>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      value={editingLaborPriceValue}
                                      onChange={e => setEditingLaborPriceValue(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === "Enter") commitLaborPriceEdit(item);
                                        if (e.key === "Escape") cancelLaborPriceEdit();
                                      }}
                                      className="w-20 h-7 text-sm text-right px-2 rounded-lg"
                                      autoFocus
                                    />
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:bg-green-50"
                                      onClick={() => commitLaborPriceEdit(item)} disabled={updateLaborPriceMutation.isPending}>
                                      <Check className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={cancelLaborPriceEdit}>
                                      <X className="w-3.5 h-3.5" />
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <p className="text-sm font-semibold">{formatCurrency(item.total_price)}</p>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                      onClick={() => startEditingLaborPrice(item)}>
                                      <Pencil className="w-3 h-3" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                                      if (!confirmDelete || window.confirm(`Remove "${item.description}" from this job?`)) {
                                        haptics.medium();
                                        db.JobLabor.delete(item.id).then(() => queryClient.invalidateQueries({ queryKey: ["job-labor", id] }));
                                      }
                                    }}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                                  </>
                                )}
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
                              if (!confirmDelete || window.confirm("Remove this photo from the job?")) {
                                haptics.medium();
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
                                if (!confirmDelete || window.confirm(`Remove "${doc.template_name || "this document"}" from this job?`)) {
                                  haptics.medium();
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