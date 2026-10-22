import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { partsCatalogQuery, jobQuery, jobPartsQuery, jobLaborQuery, jobInvoiceQuery, jobDocsQuery, jobPhotosQuery, jobCustomerQuery, customerHistoryQuery } from "@/lib/queries";
import { DetailSkeleton } from "@/components/ui/skeleton";
import { integrationsCore } from "@/lib/coreIntegrations";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import LongTextField from "@/components/ui/LongTextField";
import { markDraftsSaved } from "@/lib/textDrafts";
import BottomActionBar from "@/components/layout/BottomActionBar";
import { afterSheetsClose } from "@/lib/sheetHistory";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Check, X, FileText, Loader2, CheckCircle2, XCircle, Receipt, ChevronRight, ChevronDown, MapPin, DollarSign, Navigation, ArrowLeft, Plus, Trash2, Search, User, Package, RefreshCw, AlertTriangle } from "lucide-react";
import CallButtons from "@/components/ui/CallButtons";
import StatusBadge from "@/components/ui/StatusBadge";
import RewardBadge from "@/components/ui/RewardBadge";
import JobPartsTab from "@/components/jobs/JobPartsTab";
import JobItemsTab from "@/components/jobs/JobItemsTab";
import JobDocsTab from "@/components/jobs/JobDocsTab";
import JobPhotosTab from "@/components/jobs/JobPhotosTab";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { jobHeaderStatus } from "@/lib/jobStatus";
import { TAX_RATE, computeJobFinancials, partChargeTotal } from "@/lib/utils/jobFinancials";
import { formatTime, toDatetimeLocalValue } from "@/lib/formatTime";
import { sortJobs } from "@/lib/utils/jobSort";
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
import { showSaveError, dismissSaveError, withTimeout, createOnce, newRequestId, useSaveGuard } from "@/lib/saveSafety";
import { removePartFromJob, returnPartToStock } from "@/lib/inventory";
import { syncJobToCalendar, removeJobFromCalendar } from "@/lib/calendarSync";
import { useAddJobLabor } from "@/lib/useAddJobLabor";
import { buildLaborLine, groupLaborRates, memberPrice, ratePrice, descriptionAfterPriceEdit } from "@/lib/utils/laborPricing";
import { memberDiscountRateFor, isActiveMember as isActiveMemberNow } from "@/lib/utils/membership";
import { surchargeConfig, withResyncedSurcharge, balanceCentsOf } from "@/lib/utils/surcharge";
import { useBack, goBack } from "@/hooks/useBack";
import { useUrlState } from "@/hooks/useUrlState";
import { confirmationEmailHTML, fmtPaymentMethod } from "@/lib/emailTemplates";
import { sendJobSummaryEmail, newResendNonce } from "@/lib/jobSummaryEmail";
import { buildInvoiceLineItems, isZeroDollarJob, canCloseAsNoCharge } from "@/lib/utils/invoiceTotals";
import { AGREEMENT_TYPE_TO_PLAN } from "@/lib/agreementTerms";
import JobSignatureButton from "@/components/signature/JobSignatureButton";
import ScheduleJobSheet from "@/components/jobs/ScheduleJobSheet";
import ApplyMemberPricingDialog from "@/components/jobs/ApplyMemberPricingDialog";
import { planMemberRepricing, canRepriceJob } from "@/lib/memberRepricing";
import { estimateMinutes, formatEstimate } from "@/lib/jobDuration";

// One attachment row in the Complete Job dialog: checkbox-style toggle,
// ON = attach this PDF to the completion email.
function AttachmentToggle({ label, on, onToggle }) {
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        onClick={onToggle}
        className="w-full flex items-center gap-2 py-1 text-left"
      >
        <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${on ? "border-primary bg-primary" : "border-muted-foreground"}`}>
          {on && <Check className="w-3 h-3 text-white" />}
        </span>
        <FileText className="w-3.5 h-3.5 shrink-0" />
        <span className={`truncate ${on ? "" : "line-through opacity-60"}`}>{label}</span>
        <span className="shrink-0">(PDF)</span>
      </button>
    </li>
  );
}

function LiveTotalBar({ parts, labor, surcharge = 0, paidLabel = null, generatorNotes, onGeneratorNotesChange, savedGeneratorNotes, notesDraftKey, notesReady, isSaving, onCollectPayment, signatureSlot }) {
  const { partsTotal, laborGross, discountLines, subtotal, taxAmount, total: jobTotal } = computeJobFinancials(parts, labor);
  // Part E: the invoice's credit card surcharge is part of what the customer
  // pays, so the job's total shows it too (same figure as every customer copy).
  const total = Math.round((jobTotal + (surcharge > 0 ? surcharge : 0)) * 100) / 100;

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
        {surcharge > 0 && (
          <div className="flex items-center justify-between text-sm" data-testid="job-surcharge-line">
            <span className="text-muted-foreground">Credit card surcharge</span>
            <span className="font-medium">{formatCurrency(surcharge)}</span>
          </div>
        )}
        <div className="flex items-center justify-between pt-2 mt-1 border-t border-primary/10">
          <span className="text-sm font-semibold">Total{paidLabel ? <span className="ml-2 text-xs font-bold text-green-700 dark:text-green-400" data-testid="job-paid-label">{paidLabel}</span> : null}</span>
          <span className="text-2xl font-bold text-primary tracking-tight">{formatCurrency(total)}</span>
        </div>
      </div>
      <div className="mt-2 pt-2 border-t border-blue-100/40 dark:border-blue-800/40">
        <p className="text-xs text-blue-700 dark:text-blue-300 font-medium mb-1 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
          Generator Notes (tech only)
        </p>
        <LongTextField
          value={generatorNotes || ""}
          onChange={v => onGeneratorNotesChange?.(v)}
          savedValue={savedGeneratorNotes}
          draftKey={notesDraftKey}
          ready={notesReady}
          guard={false}
          title="Generator Notes"
          rows={5}
          className="border-blue-200 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-900/20 dark:text-gray-100"
          placeholder="Fault codes, battery voltage, oil condition..."
        />
      </div>
      {signatureSlot && <div className="mt-2">{signatureSlot}</div>}
      {onCollectPayment && (
        <Button className="w-full rounded-xl gap-1.5 h-11 mt-2 bg-green-600 hover:bg-green-700" onClick={onCollectPayment}>
          <DollarSign className="w-4 h-4" /> Collect Payment
        </Button>
      )}
    </Card>
  );
}

// Which autosaved notes box failed (for the persistent error message).
const notesErrorLabel = (data) =>
  data && "generator_notes" in data ? "Generator notes NOT saved" : "Service Summary NOT saved";

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { isOnline } = useOffline();
  const { settings } = useSettings();
  const surchargeCfg = surchargeConfig(settings);
  const { user } = useAuth();
  const { confirmDelete, use24h } = usePreferences();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [resendingConfirmation, setResendingConfirmation] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef(null);
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [generatorNotes, setGeneratorNotes] = useState("");
  const [scheduleNextOpen, setScheduleNextOpen] = useState(false);
  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false); // B1
  const [nextDate, setNextDate] = useState("");
  const notesInitialized = useRef(false);
  const [notesReady, setNotesReady] = useState(false); // drafts restore only after the saved notes are in the boxes
  const [activeJobTab, setActiveJobTab] = useUrlState("tab", "overview");
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
  const [memberPricingOpen, setMemberPricingOpen] = useState(false); // B5
  // Completing with an empty Service Summary: ask once (Add / Skip); never blocks.
  const [summaryAskOpen, setSummaryAskOpen] = useState(false);
  const summarySkipped = useRef(false);
  const serviceSummaryRef = useRef(null);
  const [completionSnapshot, setCompletionSnapshot] = useState(null);
  const [emailOnComplete, setEmailOnComplete] = useState(true);
  // Per-attachment toggles in the Complete Job dialog (all ON by default).
  const [excludedDocIds, setExcludedDocIds] = useState([]);
  const [includeAgreementPdf, setIncludeAgreementPdf] = useState(true);
  const [completingJob, setCompletingJob] = useState(false);
  const [resendOpen, setResendOpen] = useState(false);
  const [resendingSummary, setResendingSummary] = useState(false);
  const [closeNoChargeOpen, setCloseNoChargeOpen] = useState(false);
  const [closingNoCharge, setClosingNoCharge] = useState(false);
  // Back = pop to wherever this job was opened (or Jobs when opened directly).
  const back = useBack();
  const [optimisticOnSiteTime, setOptimisticOnSiteTime] = useState(null);

  const { data: job, isLoading } = useQuery(jobQuery(id));

  const { data: parts = [], isSuccess: partsLoaded } = useQuery(jobPartsQuery(id));

  const { data: labor = [], isSuccess: laborLoaded } = useQuery(jobLaborQuery(id));

  const { data: documents = [] } = useQuery(jobDocsQuery(id));

  // Maintenance agreement signed during THIS job (job_agreements, migration
  // 0022). Its PDF rides on the completion email.
  const { data: jobAgreement = null } = useQuery({
    queryKey: ["job-agreement", id],
    queryFn: async () => {
      try { const r = await db.JobAgreement.filter({ job_id: id }); return r[0] || null; }
      catch { return null; }
    },
  });

  const { data: catalogParts = [] } = useQuery(partsCatalogQuery());

  const { data: photos = [] } = useQuery(jobPhotosQuery(id));

  const { data: existingInvoices = [] } = useQuery({
    ...jobInvoiceQuery(id),
    initialData: () => queryClient.getQueryData(["job-invoice", id]),
  });
  const existingInvoice = existingInvoices[0] || null;

  const { data: customer } = useQuery({ ...jobCustomerQuery(job?.customer_id), enabled: !!job?.customer_id });

  const { data: customerHistory = [] } = useQuery({ ...customerHistoryQuery(job?.customer_id), enabled: !!job?.customer_id });
  const previousJobs = sortJobs(customerHistory
    .filter(j => j.id !== id && ["completed", "invoiced"].includes(j.status)))
    .slice(0, 10);

  useEffect(() => {
    if (job && !notesInitialized.current) {
      setInvoiceNotes(job.invoice_notes || "");
      setGeneratorNotes(job.generator_notes || "");
      notesInitialized.current = true;
      setNotesReady(true);
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
    // B5b: keep the "(Member N% off)" label in step with the edited price.
    const description = descriptionAfterPriceEdit({ line: item, newPrice, rates: laborRates, memberDiscountRate: memberDiscountRateFor(customer) });
    const label = description !== item.description ? { description } : {};
    if (item.is_flat_rate) {
      updateLaborPriceMutation.mutate({ id: item.id, data: { flat_rate_amount: newPrice, total_price: newPrice, ...label } });
    } else {
      updateLaborPriceMutation.mutate({ id: item.id, data: { rate: newPrice, total_price: newPrice * (item.hours || 0), ...label } });
    }
  };

  const updatePartPriceMutation = useMutation({
    mutationFn: ({ id, price, quantity, charge_for_part }) => {
      // A No Charge line is hidden on the invoice, so it can never carry a price.
      if (charge_for_part === false) throw new Error("No Charge parts can't be priced");
      return db.JobPart.update(id, { price, total_price: price * quantity });
    },
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
    updatePartPriceMutation.mutate({ id: part.id, price: newPrice, quantity: part.quantity, charge_for_part: part.charge_for_part });
  };

  const updateJobOffline = useOfflineMutation({
    entity: 'Job',
    type: 'update',
    queryKeys: ['jobs'],
    onSuccess: (_, variables) => {
      dismissSaveError(notesErrorLabel(variables?.data));
      queryClient.invalidateQueries({ queryKey: ["job", id] });
    },
    // Autosave failed: the text stays in the box; say so and offer Retry.
    onError: (error, variables) => {
      haptics.error();
      showSaveError(notesErrorLabel(variables?.data), error, () => updateJobOffline.mutate(variables));
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

  // F-11: notes typed just before switching apps / locking the phone / leaving
  // the job were lost while the 1.2-1.5 s autosave timer was still waiting.
  // Save them right away when the app is hidden or the job screen closes.
  useEffect(() => {
    const flush = () => { debouncedSaveNotes.flush(); handleGeneratorNotesChange.flush(); };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [debouncedSaveNotes, handleGeneratorNotesChange]);

  const formatElapsed = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
    return `${m}:${String(sec).padStart(2,"0")}`;
  };

  const statusGuard = useSaveGuard();
  const collectGuard = useSaveGuard();
  const scheduleNextGuard = useSaveGuard();
  const scheduleNextId = useRef(newRequestId());
  const collectInvoiceId = useRef(newRequestId());

  // Items-tab remove: same inventory ledger as the Work tab (stock back +
  // usage row removed), with Retry that resumes (H-4 / C-3).
  const removePartGuard = useSaveGuard();
  const pendingPartRemovals = useRef(new Map());
  const removeJobPart = (part) => removePartGuard.run(async function attempt() {
    const progress = pendingPartRemovals.current.get(part.id) || {};
    pendingPartRemovals.current.set(part.id, progress);
    try {
      await removePartFromJob(part, progress);
      pendingPartRemovals.current.delete(part.id);
      dismissSaveError("", { id: `remove-part-${part.id}` });
      toast.success(progress.stock ? `Part removed — ${part.quantity} put back in stock` : "Part removed");
    } catch (e) {
      haptics.error();
      showSaveError(progress.deleted ? `"${part.name}" removed, but stock NOT put back yet` : `"${part.name}" NOT removed`, e,
        () => removePartGuard.run(attempt), { id: `remove-part-${part.id}` });
    } finally {
      queryClient.invalidateQueries({ queryKey: ["job-parts", id] });
      queryClient.invalidateQueries({ queryKey: ["parts-catalog"] });
    }
  });

  const laborAdd = useAddJobLabor(id);
  const { data: laborRates = [], isSuccess: laborRatesLoaded } = useQuery({
    queryKey: ["labor-rates"],
    queryFn: () => db.LaborRate.list("name"),
  });
  const laborGroups = groupLaborRates(laborRates);

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

  // Returns true only once the server has saved the new status. On failure
  // nothing else runs (no team email, no customer update, no navigation) and
  // a persistent error with Retry is shown (F-04).
  const handleStatusChange = async (newStatus, extraFields = {}, { retry } = {}) => {
    if (isClosed) return false;
    const label = newStatus.replace("_", " ");
    const { partsCost, partsPrice, laborCost, laborPrice } = getJobTotals();
    try {
      await withTimeout(db.Job.update(id, {
        status: newStatus,
        total_parts_cost: partsCost, total_parts_price: partsPrice,
        total_labor_cost: laborCost, total_labor_price: laborPrice,
        total_cost: partsCost + laborCost, total_price: partsPrice + laborPrice,
        profit: (partsPrice + laborPrice) - (partsCost + laborCost),
        ...(newStatus === "completed" ? { completed_date: new Date().toISOString() } : {}),
        ...extraFields,
      }), 20000, "Saving the job");
    } catch (e) {
      haptics.error();
      showSaveError(`Job NOT marked ${label}`, e, retry || (() => statusGuard.run(() => handleStatusChange(newStatus, extraFields))), { id: "job-status-error" });
      return false;
    }
    dismissSaveError("", { id: "job-status-error" });
    queryClient.invalidateQueries({ queryKey: ["jobs"] });
    queryClient.invalidateQueries({ queryKey: ["job", id] });
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

      db.Customer.update(job.customer_id, customerUpdate).catch(e => {
        showSaveError("Customer's last service date NOT saved", e, () => db.Customer.update(job.customer_id, customerUpdate)
          .then(() => dismissSaveError("Customer's last service date NOT saved")).catch(() => {}));
      });
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
    toast.success(`Job marked as ${label}`);
    return true;
  };

  // Decision 2: cancelling a job with parts asks which were used. Every part
  // starts as "Return to stock". Order: cancel the job (nothing else happens
  // if that fails), then put the returned parts back; each step resumes on
  // Retry and the choices are kept until everything is saved.
  const [partChoices, setPartChoices] = useState({}); // jobPart.id -> "return" | "used"
  const cancelReturns = useRef(null); // { choices, progress: { [jobPartId]: {} }, ids: { [jobPartId]: returnId } }
  const stockParts = parts.filter(p => p.part_id);
  const choiceFor = (p) => partChoices[p.id] || "return";

  const returnChosenParts = async (snapshot) => {
    const toReturn = stockParts.filter(p => snapshot.choices[p.id] !== "used");
    let returned = 0;
    for (const p of toReturn) {
      snapshot.progress[p.id] ||= {};
      snapshot.ids[p.id] ||= newRequestId();
      const pr = await returnPartToStock(p, { returnId: snapshot.ids[p.id] }, snapshot.progress[p.id]);
      if (pr.qty > 0) returned += pr.qty;
    }
    return returned;
  };

  const handleCancel = () => statusGuard.run(async function attempt() {
    if (!cancelReturns.current) {
      cancelReturns.current = { choices: Object.fromEntries(stockParts.map(p => [p.id, choiceFor(p)])), progress: {}, ids: {}, canceled: false };
    }
    const snap = cancelReturns.current;
    if (!snap.canceled) {
      // Until the cancel is saved the tech may still change the choices.
      snap.choices = Object.fromEntries(stockParts.map(p => [p.id, choiceFor(p)]));
      if (!(await handleStatusChange("canceled", { cancel_reason: cancelReason }, { retry: () => statusGuard.run(attempt) }))) return;
      snap.canceled = true;
      markDraftsSaved(`job:${id}:cancel_reason`);
      setCancelOpen(false);
      removeJobFromCalendar({ job }); // never throws or blocks
    }
    try {
      const n = await returnChosenParts(snap);
      cancelReturns.current = null;
      dismissSaveError("", { id: "cancel-returns-error" });
      if (n > 0) toast.success(`${n} part${n === 1 ? "" : "s"} put back in stock`);
    } catch (e) {
      haptics.error();
      showSaveError("Job canceled, but parts NOT put back in stock yet", e, () => statusGuard.run(attempt), { id: "cancel-returns-error" });
    } finally {
      queryClient.invalidateQueries({ queryKey: ["parts-catalog"] });
    }
  });

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
  const isActiveMember = isActiveMemberNow(customer);
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
    setExcludedDocIds([]);
    setIncludeAgreementPdf(true);
    setCompleteJobOpen(true);
  };
  const requestCompleteJob = () => {
    if (!invoiceNotes.trim() && !summarySkipped.current) { setSummaryAskOpen(true); return; }
    openCompleteJob();
  };
  const addServiceSummaryFirst = () => {
    setSummaryAskOpen(false);
    // Switch tabs only after the prompt's history entry is popped, or the
    // pop would undo the switch (Complete Job is reachable from every tab).
    afterSheetsClose(() => {
      setActiveJobTab("overview");
      setTimeout(() => {
        serviceSummaryRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
        serviceSummaryRef.current?.focus();
      }, 350);
    });
  };
  const skipServiceSummary = () => {
    summarySkipped.current = true;
    setSummaryAskOpen(false);
    openCompleteJob();
  };
  // Back from "Collect now" (Complete dialog → invoice → payment recorded):
  // reopen the Complete dialog once. Paid in full now → no collect prompt.
  // Waits past the page transition: AnimatePresence briefly renders this
  // route inside the EXITING page too, and that throwaway copy must not
  // consume the state (its timer is cancelled when it unmounts).
  // The invoice screen pops back here with a session flag (no second copy
  // of the job in history), or replaces with state.openComplete.
  useEffect(() => {
    let flagged = false;
    try { flagged = sessionStorage.getItem("gf-open-complete") === id; } catch { /* ignore */ }
    if ((!location.state?.openComplete && !flagged) || !job) return;
    const t = setTimeout(() => {
      try { sessionStorage.removeItem("gf-open-complete"); } catch { /* ignore */ }
      if (location.state?.openComplete) navigate(location.pathname + location.search, { replace: true, state: {} });
      if (job.status === "on_site" || job.status === "in_progress") openCompleteJob();
    }, 400);
    return () => clearTimeout(t);
  }, [location.state?.openComplete, location.key, job?.id]);


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
  // The server builds the summary email from jobs.invoice_notes, but the
  // Service Summary textarea autosaves with a 1.2s debounce. Write any
  // pending text synchronously before an email is requested so the last
  // keystrokes are never missing.
  const flushInvoiceNotes = async () => {
    debouncedSaveNotes.cancel();
    if ((job?.invoice_notes || "") === invoiceNotes) return;
    await db.Job.update(id, { invoice_notes: invoiceNotes });
    queryClient.invalidateQueries({ queryKey: ["job", id] });
  };

  // The job is completed only once the server has saved it. Any failure
  // (no signal, timeout, server error) keeps the dialog open with a
  // persistent message and Retry; nothing is sent and nothing navigates
  // (F-04, F-20, A-14). Every step is safe to repeat.
  const doCompleteJob = () => statusGuard.run(async () => {
    setCompletingJob(true);
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        throw new Error("No connection");
      }
      try {
        await withTimeout(flushInvoiceNotes(), 20000, "Saving the Service Summary");
      } catch (e) {
        haptics.error();
        showSaveError("Job NOT completed — Service Summary not saved", e, doCompleteJob, { id: "job-complete-error" });
        return;
      }
      const [freshParts, freshLabor] = await withTimeout(Promise.all([
        db.JobPart.filter({ job_id: id }),
        db.JobLabor.filter({ job_id: id }),
      ]), 20000, "Loading the job");
      const fin = computeJobFinancials(freshParts, freshLabor);
      const zero = isZeroDollarJob(fin);
      // Every completion email carries the invoice (PAID / UNPAID + amount
      // due). Jobs created in the app always have one; a job that somehow has
      // none (old data, other entry paths) gets it now — same fixed id as
      // Collect Payment, so a Retry can't make a second one.
      if (!existingInvoice) {
        const data = buildInvoiceData(freshParts, freshLabor);
        try {
          const current = (await withTimeout(db.Invoice.filter({ job_id: id }), 20000, "Loading the invoice"))[0];
          if (!current) {
            patchInvoiceCache(await withTimeout(createOnce(db.Invoice, collectInvoiceId.current, {
              ...data, job_id: id, customer_id: job.customer_id, customer_name: job.customer_name,
              invoice_number: `INV-${Date.now().toString(36).toUpperCase()}`,
              ...(zero ? { status: "paid", payment_method: "no_charge", payment_reference: null, paid_date: new Date().toISOString(), surcharge_amount: 0 } : { status: "draft" }),
            }), 20000, "Creating the invoice"));
          }
        } catch (e) {
          haptics.error();
          showSaveError("Job NOT completed — invoice not created", e, doCompleteJob, { id: "job-complete-error" });
          return;
        }
      }
      if (existingInvoice && existingInvoice.status !== "paid") {
        const data = buildInvoiceData(freshParts, freshLabor);
        const patch = zero
          ? { ...data, status: "paid", payment_method: "no_charge", payment_reference: null, paid_date: new Date().toISOString(), surcharge_amount: 0 }
          : withResyncedSurcharge(data, existingInvoice, surchargeCfg);
        try {
          patchInvoiceCache(await withTimeout(db.Invoice.update(existingInvoice.id, patch), 20000, "Updating the invoice"));
        } catch (e) {
          haptics.error();
          showSaveError("Job NOT completed — invoice not updated", e, doCompleteJob, { id: "job-complete-error" });
          return;
        }
      }

      if (!(await handleStatusChange("completed", completionSnapshot || {}, { retry: doCompleteJob }))) return;
      dismissSaveError("", { id: "job-complete-error" });
      setCompleteJobOpen(false);

      if (customer?.email && emailOnComplete) {
        try {
          const r = await sendJobSummaryEmail({
            jobId: id, kind: "completion",
            documentIds: completedDocuments.filter(d => !excludedDocIds.includes(d.id)).map(d => d.id),
            includeAgreement: includeAgreementPdf,
          });
          if (r?.skipped === "already_sent") toast.info("Summary email was already sent for this job");
          else if (!r?.skipped) toast.success(`Summary sent to ${customer.email}`);
        } catch (e) {
          haptics.error();
          // The job IS completed; the email can be re-sent from the job screen.
          toast.error(`Job completed, but the summary email was NOT sent: ${e.message}. Use "Resend summary" on the job.`, { duration: Infinity, closeButton: true });
        }
        queryClient.invalidateQueries({ queryKey: ["job", id] });
      }

      if (["maintenance", "battery_replacement"].includes(job.job_type)) {
        maybeOpenScheduleNext();
      } else {
        // Pop to wherever the job was opened (Dashboard, Schedule, customer…).
        goBack(navigate, location, "/jobs");
      }
    } catch (e) {
      haptics.error();
      showSaveError("Job NOT completed", e, doCompleteJob, { id: "job-complete-error" });
    } finally {
      setCompletingJob(false);
    }
  });

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
      await flushInvoiceNotes();
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

    db.Invoice.update(existingInvoice.id, withResyncedSurcharge(fresh, existingInvoice, surchargeCfg)).then(patchInvoiceCache);
  }, [parts, labor, existingInvoice?.id, existingInvoice?.status, partsLoaded, laborLoaded]);

  // One invoice per job: guarded against double taps, re-checks the database
  // for an existing invoice before creating, and creates with a fixed id so a
  // Retry after a lost response can't make a second one (F-05).
  // Item 2: one save path for every Collect Signature button. Resolves only
  // after the server saved it (JobSignatureButton shows "Signature saved").
  const saveJobSignature = (sig) => new Promise((resolve, reject) => {
    updateJob.mutate({ customer_signature: sig }, { onSuccess: resolve, onError: reject });
  });

  // completeAfter: opened from the Complete dialog's "Collect now" — after the
  // payment is recorded the invoice screen brings the tech back here and the
  // Complete dialog reopens (now paid → no prompt, one combined email).
  const handleCollectPayment = ({ completeAfter = false } = {}) => collectGuard.run(async () => {
    try {
      const invoiceData = buildInvoiceData();
      const current = existingInvoice || (await db.Invoice.filter({ job_id: id }))[0];
      let inv;
      if (current) {
        inv = current.status === "paid" ? current : await db.Invoice.update(current.id, withResyncedSurcharge(invoiceData, current, surchargeCfg));
      } else {
        inv = await createOnce(db.Invoice, collectInvoiceId.current, {
          ...invoiceData, job_id: id, customer_id: job.customer_id, customer_name: job.customer_name,
          invoice_number: `INV-${Date.now().toString(36).toUpperCase()}`, status: "draft",
        });
      }
      dismissSaveError("", { id: "collect-payment-error" });
      patchInvoiceCache(inv);
      navigate(`/invoices/${inv.id}`, { state: { fromJobId: id, completeAfter } });
    } catch (e) {
      haptics.error();
      showSaveError("Invoice NOT opened", e, () => handleCollectPayment({ completeAfter }), { id: "collect-payment-error" });
    }
  });
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

  // Height of the pinned job header + tab strip, for things pinned below it.
  const jobHeaderRef = useRef(null);
  const hasJob = !!job;
  useEffect(() => {
    const el = jobHeaderRef.current;
    if (!el) return undefined;
    const root = document.documentElement;
    const set = () => root.style.setProperty("--job-header-h", `${el.offsetHeight}px`);
    set();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(set) : null;
    ro?.observe(el);
    return () => { ro?.disconnect(); root.style.removeProperty("--job-header-h"); };
  }, [hasJob]);

  // Tint the status-bar band (AppLayout) to the colored job header.
  const statusBarColor = !job ? null
    : job.status === "on_site" ? "#b45309"
    : job.status === "dispatched" ? "#0e7490"
    : ["invoiced", "canceled"].includes(job.status) ? "#4b5563"
    : "hsl(var(--primary))";
  useEffect(() => {
    if (!statusBarColor) return undefined;
    const root = document.documentElement;
    root.style.setProperty("--status-bar-bg", statusBarColor);
    return () => root.style.removeProperty("--status-bar-bg");
  }, [statusBarColor]);

  if (isLoading) return <DetailSkeleton />;
  if (!job) return <div className="p-4 text-center">Job not found</div>;

  const isClosed = ["invoiced", "canceled"].includes(job.status);
  // Completed jobs are done: no editing the job itself or canceling it.
  // (Payment, resend summary, photos and notes stay available as before.)
  const canEditOrCancel = !isClosed && job.status !== "completed";
  // Expired plans get no discount (D-01): one rule, src/lib/utils/membership.js.
  const memberDiscountRate = memberDiscountRateFor(customer);
  const isMember = memberDiscountRate < 1.0;
  // B5: a member's lines added before they signed are still at full price.
  const memberRepricing = isMember && canRepriceJob(job)
    ? planMemberRepricing({ parts, labor, catalogParts, rates: laborRates, memberDiscountRate })
    : null;
  const hasPendingAgreement = labor.some(l => l.requires_agreement);
  const pendingAgreementLine = labor.find(l => l.requires_agreement);
  // Exactly $0.00 (integer cents) on live job rows — never prompt to collect.
  const isNoChargeJob = partsLoaded && laborLoaded && isZeroDollarJob(computeJobFinancials(parts, labor));
  // Item 1: Collect Payment from On Site onward while the job is open, and
  // after completion. Paid in full = nothing left to collect.
  const jobIsOpenOnSite = job.status === "on_site" || job.status === "in_progress";
  // Completed job with money still owed: Collect Payment Now is its main action.
  const showCollectNow = job.status === "completed" && !isNoChargeJob && existingInvoice?.status !== "paid";
  const invoicePaidInFull = existingInvoice?.status === "paid";
  const invoicePartlyPaid = existingInvoice?.status === "partial";
  const balanceDue = existingInvoice ? balanceCentsOf(existingInvoice) / 100 : computeJobFinancials(parts, labor).total;
  // Item 2: the one signature control, placed above Collect Payment (or above
  // Close / Complete on $0 jobs) and in the Notes tab.
  const signatureButton = (
    <JobSignatureButton signature={job.customer_signature} onSave={saveJobSignature} disabled={isClosed} />
  );
  // Legacy stuck $0 job (completed, $0 invoice never closed) -> offer a
  // no-email close. Same strict $0.00-in-cents guard is re-run on click.
  const showCloseNoCharge = partsLoaded && laborLoaded &&
    canCloseAsNoCharge({ jobStatus: job.status, invoice: existingInvoice, financials: computeJobFinancials(parts, labor) });
  const isActive = ["dispatched", "on_site"].includes(job.status);
  // Header colors readable in sunlight (F-17): white text on amber-700 /
  // cyan-700 is ≥ 4.5:1 (amber-500 was 2.15:1). The status bar band above
  // the header takes the same color (statusBarColor).
  const headerBg = job.status === "on_site" ? "bg-amber-700" : job.status === "dispatched" ? "bg-cyan-700" : isClosed ? "bg-gray-600" : "bg-primary";
  const headerDot = job.status === "on_site" ? "bg-amber-200" : "bg-cyan-200";
  const tabActiveColor = job.status === "on_site" ? "#b45309" : job.status === "dispatched" ? "#0e7490" : "hsl(var(--primary))";

  return (
    <div className="bg-muted/30">

      {/* Colored header + tab strip stay pinned under the status bar while the
          page (the document — the only scroller) moves beneath them. */}
      <div ref={jobHeaderRef} data-sticky-header="" className="sticky top-[var(--sat)] z-30">
      {/* ── COLORED ACTIVE JOB HEADER ── */}
      <div className={`${headerBg} px-4 pt-3 pb-3 shrink-0`}>
        <div className="flex items-center justify-between gap-2 max-w-lg mx-auto min-w-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <button
              onClick={back}
              aria-label="Back"
              data-testid="back-button"
              className="relative hit-44 w-8 h-8 rounded-xl bg-white/20 active:bg-white/30 flex items-center justify-center shrink-0"
            >
              <ArrowLeft className="w-4 h-4 text-white" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-0.5">
                {isActive && <div className={`w-1.5 h-1.5 rounded-full ${headerDot} animate-pulse shrink-0`} />}
                <span className="text-white text-xs font-bold uppercase tracking-wider" data-testid="job-header-status">
                  {jobHeaderStatus(job)}
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
                <p className="text-white text-xs truncate min-w-0">{job.customer_name}{job.assigned_to_name ? ` · ${job.assigned_to_name}` : ""}</p>
                <RewardBadge show={customer?.pending_reward} />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {job.status === "on_site" && (
              <div className="text-right">
                <p className="font-mono text-white text-lg font-bold tracking-wider">{formatElapsed(elapsedSeconds)}</p>
                <p className="text-white text-[10px]">{(elapsedSeconds / 3600).toFixed(2)}h on site</p>
              </div>
            )}
            {canEditOrCancel && (
              <Link to={`/jobs/${id}/edit`}>
                <button className="relative hit-44 w-8 h-8 rounded-xl bg-white/20 active:bg-white/30 flex items-center justify-center">
                  <Pencil className="w-4 h-4 text-white" />
                </button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── HORIZONTAL TAB BAR ── */}
      <div className="bg-white dark:bg-gray-900 border-b border-border shrink-0 shadow-sm min-w-0">
      <div className="flex overflow-x-auto max-w-lg mx-auto scroll-hint-x" style={{ scrollbarWidth: "none" }}>
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
              onClick={(e) => { setActiveJobTab(tab.key); e.currentTarget.scrollIntoView?.({ inline: "nearest", block: "nearest" }); if (window.scrollY > 0) window.scrollTo(0, 0); }}
              className="min-h-[44px] flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors shrink-0"
              style={{
                borderBottomColor: activeJobTab === tab.key ? tabActiveColor : "transparent",
                color: activeJobTab === tab.key ? tabActiveColor : "#6b7280",
              }}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      </div>

      {/* ── TAB CONTENT ── */}
      <div>
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
                {/* B1/B2: appointment + estimated time on site; an approved job
                    with no date gets "Not scheduled" and a Schedule action. */}
                <div className="mx-3.5 mb-3.5 rounded-xl border border-border px-3 py-2.5" data-testid="job-appointment">
                  {job.scheduled_date ? (
                    <p className="text-xs text-foreground">
                      <span className="font-semibold">{formatDate(job.scheduled_date)} · {formatTime(job.scheduled_date, use24h)}</span>
                    </p>
                  ) : (
                    <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" data-testid="not-scheduled-badge">Not scheduled</span>
                  )}
                  <p className="text-xs text-muted-foreground mt-1" data-testid="job-estimate">Estimated time on site: {formatEstimate(estimateMinutes(job))}</p>
                  {!job.scheduled_date && job.status === "scheduled" && !isClosed && (
                    <Button size="sm" className="w-full rounded-xl mt-2" onClick={() => setScheduleSheetOpen(true)}>Schedule this job</Button>
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
                    <p className="text-[10px] font-bold text-sky-700 dark:text-sky-300 uppercase tracking-wider mb-1">Internal Notes</p>
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
                          {Math.round((1 - memberDiscountRate) * 100)}% off all parts & labor
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

              {/* ── Service Summary (customer-facing; jobs.invoice_notes) ── */}
              <Card className="px-4 pt-3.5 pb-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Service Summary</p>
                {/* Autosaves (1.2 s) — the local draft covers a crash before that. */}
                <LongTextField
                  textareaRef={serviceSummaryRef}
                  value={invoiceNotes}
                  onChange={handleNotesChange}
                  savedValue={job.invoice_notes || ""}
                  draftKey={`job:${id}:invoice_notes`}
                  ready={notesReady}
                  guard={false}
                  title="Service Summary"
                  rows={10}
                  data-testid="service-summary"
                  className="border-border bg-muted/20"
                  placeholder="Work performed — shown to the customer on the invoice..."
                />
              </Card>

              {/* ── Running Total ── */}
              <LiveTotalBar
                parts={parts}
                labor={labor}
                surcharge={Number(existingInvoice?.surcharge_amount) || 0}
                paidLabel={existingInvoice?.status === "paid" && existingInvoice?.payment_method !== "no_charge" ? `PAID · ${fmtPaymentMethod(existingInvoice.payment_method)}` : null}
                generatorNotes={generatorNotes}
                onGeneratorNotesChange={handleGeneratorNotesUpdate}
                savedGeneratorNotes={job.generator_notes || ""}
                notesDraftKey={`job:${id}:generator_notes`}
                notesReady={notesReady}
                onCollectPayment={jobIsOpenOnSite && !isNoChargeJob && !invoicePaidInFull ? () => handleCollectPayment() : undefined}
                signatureSlot={jobIsOpenOnSite && !isNoChargeJob ? signatureButton : null}
                isSaving={updateJob.isPending}
              />

              {/* B5: member pricing not yet on lines added before signing */}
              {memberRepricing?.updates.length > 0 && (
                <Card className="p-3.5 border-emerald-200 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/20" data-testid="member-pricing-card">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">MEMBER PRICING NOT APPLIED</p>
                      <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-0.5">
                        {memberRepricing.updates.length} item{memberRepricing.updates.length === 1 ? "" : "s"} still at full price · save {formatCurrency(memberRepricing.savings)}
                      </p>
                    </div>
                    <Button className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 shrink-0" data-testid="apply-member-pricing-open" onClick={() => setMemberPricingOpen(true)}>
                      Apply member pricing
                    </Button>
                  </div>
                </Card>
              )}

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
                ) : isActiveMember ? (
                  // B5a: an active member renewing (agreement line on this job)
                  // can sign the renewal here. Same customer row, no 2nd membership.
                  <Card className="p-3.5 border-green-200 bg-green-50 dark:border-green-700 dark:bg-green-900/20">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-green-900 dark:text-green-200 flex items-center gap-1.5">
                          ✅ SERVICE AGREEMENT ACTIVE
                        </p>
                        <p className="text-xs text-green-800 dark:text-green-300 mt-0.5">{pendingAgreementLine?.description}</p>
                        <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                          Current plan{customer?.membership_expiry ? ` expires ${new Date(customer.membership_expiry).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""} · Renewal signature not collected yet
                        </p>
                      </div>
                      {!isClosed && (
                        <Button size="sm" data-testid="sign-renewal" className="rounded-xl h-8 text-xs bg-green-700 hover:bg-green-800 shrink-0 ml-2"
                          onClick={goSignAgreement}>
                          Sign renewal
                        </Button>
                      )}
                    </div>
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
                  {job.status === "dispatched" && (
                    <>
                      <div className="flex items-center gap-2 text-xs text-cyan-700 dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-700 rounded-xl px-3 py-2.5">
                        <Navigation className="w-3.5 h-3.5 shrink-0" />
                        <span>En route — tap when you arrive to start the clock</span>
                      </div>
                    </>
                  )}
                  {jobIsOpenOnSite && isNoChargeJob && signatureButton}
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
                      {!(isNoChargeJob && showCloseNoCharge) && signatureButton}
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
                          {showCloseNoCharge && signatureButton}
                          {showCloseNoCharge && (
                            <Button className="w-full rounded-xl gap-1.5 h-11" onClick={() => setCloseNoChargeOpen(true)}>
                              <CheckCircle2 className="w-4 h-4" /> Close as No Charge (no email)
                            </Button>
                          )}
                        </>
                      ) : null}
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
                        <LongTextField
                          value={cancelReason}
                          onChange={setCancelReason}
                          savedValue=""
                          draftKey={cancelOpen ? `job:${id}:cancel_reason` : null}
                          ready={cancelOpen}
                          guard={false}
                          title="Reason for cancellation"
                          rows={4}
                          placeholder="Reason for cancellation..."
                        />
                        {stockParts.length > 0 && (
                          <div className="space-y-2" data-testid="cancel-parts">
                            <p className="text-sm font-semibold">Were any of these used?</p>
                            {stockParts.map(p => {
                              const used = choiceFor(p) === "used";
                              return (
                                <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-border p-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium break-words">{p.name}</p>
                                    <p className="text-xs text-muted-foreground">Qty {p.quantity}</p>
                                  </div>
                                  <div className="flex shrink-0 rounded-lg bg-muted p-0.5" role="radiogroup" aria-label={`${p.name}: used or return`}>
                                    {[["return", "Return to stock"], ["used", "Used"]].map(([v, label]) => (
                                      <button key={v} type="button" role="radio" aria-checked={(v === "used") === used}
                                        className={`min-h-[44px] px-2.5 rounded-md text-xs font-semibold ${(v === "used") === used ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
                                        onClick={() => setPartChoices(c => ({ ...c, [p.id]: v }))}>{label}</button>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <Button variant="destructive" className="w-full rounded-xl" onClick={handleCancel} disabled={statusGuard.busy}>{statusGuard.busy ? "Canceling…" : "Confirm Cancel"}</Button>
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
              <div className="sticky z-10 bg-background px-4 pt-2 pb-1" style={{ top: "calc(var(--sat) + var(--job-header-h, 0px))" }}>
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
                                      onClick={() => db.JobLabor.delete(item.id)
                                        .then(() => queryClient.invalidateQueries({ queryKey: ["job-labor", id] }))
                                        .catch(e => { haptics.error(); showSaveError(`"${item.description}" NOT removed`, e); })}>
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

                    {/* Rate Catalog — straight from Catalog › Labor Rates (H-5).
                        Adding stores the price at that moment; later catalog
                        edits only change NEW lines. */}
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Rate Catalog</p>
                    {laborGroups.map(group => (
                      <div key={group.key} className="space-y-2">
                        <p className={`text-[10px] font-bold uppercase tracking-wider mt-2 ${group.tone === "orange" ? "text-orange-400" : group.tone === "red" ? "text-red-400" : "text-muted-foreground/60"}`}>{group.label}</p>
                        {group.rates.filter(r => !workSearch || r.name.toLowerCase().includes(workSearch.toLowerCase())).map(r => {
                          const unit = memberPrice(ratePrice(r), memberDiscountRate);
                          const perHour = r.type === "hourly" ? "/hr" : "";
                          return (
                            <Card key={r.id} data-testid="labor-rate" className={`p-3 flex items-center justify-between ${group.tone === "orange" ? "border-orange-200 bg-orange-50/40 dark:border-orange-700 dark:bg-orange-900/20" : group.tone === "red" ? "border-red-200 bg-red-50/40 dark:border-red-700 dark:bg-red-900/20" : ""}`}>
                              <div className="min-w-0 mr-2">
                                <p className="text-sm font-medium">{r.name}</p>
                                <p className="text-xs text-muted-foreground">{r.notes || "Per hour"}{isMember ? ` · ${Math.round((1 - memberDiscountRate) * 100)}% off` : ""}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <div className="text-right">
                                  <p className="text-sm font-bold">{formatCurrency(unit)}{perHour}</p>
                                  {isMember && <p className="text-[10px] text-muted-foreground line-through">{formatCurrency(ratePrice(r))}</p>}
                                </div>
                                <Button size="icon" className="h-7 w-7 rounded-lg" aria-label={`Add ${r.name}`} disabled={laborAdd.busy}
                                  onClick={() => laborAdd.add(buildLaborLine({ rate: r, jobId: id, memberDiscountRate }), r.name)}>
                                  <Plus className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    ))}
                    {laborRatesLoaded && laborGroups.length === 0 && (
                      <p className="text-xs text-muted-foreground">No labor rates in the catalog. Add them in Catalog › Labor Rates.</p>
                    )}
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
                        <LongTextField
                          value={generatorNotes}
                          onChange={handleGeneratorNotesUpdate}
                          savedValue={job.generator_notes || ""}
                          draftKey={`job:${id}:generator_notes`}
                          ready={notesReady}
                          guard={false}
                          title="Generator Notes"
                          rows={5}
                          className="border-blue-200 dark:border-blue-700 bg-white/60 dark:bg-gray-800/60 dark:text-gray-100"
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
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Internal Notes</p>
                  {job.quote_notes && <p className="text-xs font-semibold text-muted-foreground mb-1">Quote Scope</p>}
                  {job.quote_notes && <p className="text-sm leading-relaxed mb-2">{job.quote_notes}</p>}
                  {job.notes && <p className="text-sm text-muted-foreground leading-relaxed">{job.notes}</p>}
                </Card>
              )}

              {/* Customer signature — same control as above Collect Payment (Item 2) */}
              {["on_site", "in_progress", "completed", "invoiced"].includes(job.status) && (
                <Card className="p-4 space-y-3">
                  <div>
                    <p className="text-sm font-semibold">Customer Signature</p>
                    <p className="text-xs text-muted-foreground">{job.customer_signature ? "Signature on file" : "Not yet collected"}</p>
                  </div>
                  {isClosed ? (job.customer_signature && (
                    <img src={job.customer_signature} alt="Customer signature" className="w-full max-h-24 object-contain rounded-xl border border-border bg-muted/20" />
                  )) : signatureButton}
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
                                    {part.charge_for_part === false ? (
                                      <p className="text-xs font-semibold text-muted-foreground">No Charge</p>
                                    ) : (
                                      <>
                                        <p className="text-sm font-semibold">{formatCurrency(partChargeTotal(part))}</p>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                          onClick={() => startEditingPartPrice(part)}>
                                          <Pencil className="w-3 h-3" />
                                        </Button>
                                      </>
                                    )}
                                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={removePartGuard.busy} onClick={() => {
                                      if (!confirmDelete || window.confirm(`Remove "${part.name}" from this job?`)) {
                                        haptics.medium();
                                        removeJobPart(part);
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

      {/* Complete Job is in the bottom bar on every tab, so its prompts live
          outside the Overview tab too (as does Schedule Next, which follows). */}
      <AlertDialog open={summaryAskOpen} onOpenChange={setSummaryAskOpen}>
        <AlertDialogContent className="max-w-sm rounded-2xl" data-testid="summary-ask">
          <AlertDialogHeader>
            <AlertDialogTitle>Add a Service Summary?</AlertDialogTitle>
            <AlertDialogDescription>It appears on the customer's email.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 rounded-xl" onClick={skipServiceSummary}>Skip</AlertDialogCancel>
            <AlertDialogAction className="h-11 rounded-xl" onClick={addServiceSummaryFirst}>Add</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Complete Job modal */}
      <Dialog open={completeJobOpen} onOpenChange={setCompleteJobOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Complete Job</DialogTitle></DialogHeader>

          {isNoChargeJob ? (
            <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5">
              <p className="text-xs font-semibold">No charge — {formatCurrency(0)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Nothing to collect. The invoice will be closed as no charge.</p>
            </div>
          ) : !invoicePaidInFull && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 px-3 py-2.5" data-testid="complete-unpaid-box">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                {invoicePartlyPaid ? `⚠ Partly paid — ${formatCurrency(balanceDue)} still due` : `⚠ Unpaid — ${formatCurrency(balanceDue)} due`}
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">Collect now, or complete it as unpaid and collect later.</p>
            </div>
          )}
          {invoicePaidInFull && !isNoChargeJob && (
            <div className="rounded-xl border border-green-200 bg-green-50 dark:border-green-700 dark:bg-green-900/20 px-3 py-2.5">
              <p className="text-xs font-semibold text-green-800 dark:text-green-200">✓ Paid in full</p>
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
                    <li className="flex items-center gap-1.5"><Receipt className="w-3.5 h-3.5 shrink-0" /> Invoice {existingInvoice.invoice_number} in the email — {isNoChargeJob ? "no charge" : invoicePaidInFull ? "PAID" : invoicePartlyPaid ? `${formatCurrency(balanceDue)} balance due` : `UNPAID, ${formatCurrency(balanceDue)} due`}</li>
                  )}
                  {completedDocuments.map(doc => (
                    <AttachmentToggle
                      key={doc.id}
                      label={doc.template_name || "Service checklist"}
                      on={!excludedDocIds.includes(doc.id)}
                      onToggle={() => setExcludedDocIds(ids => ids.includes(doc.id) ? ids.filter(x => x !== doc.id) : [...ids, doc.id])}
                    />
                  ))}
                  {jobAgreement && (
                    <AttachmentToggle label="Signed Maintenance Agreement" on={includeAgreementPdf} onToggle={() => setIncludeAgreementPdf(v => !v)} />
                  )}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No email on file — nothing will be sent, but the job will still complete.</p>
          )}

          {!isNoChargeJob && !invoicePaidInFull ? (
            // Unpaid / partly paid: collect now, or complete as unpaid.
            <div className="space-y-2 mt-2">
              <Button className="w-full rounded-xl gap-1.5 h-11 bg-green-600 hover:bg-green-700" disabled={completingJob || collectGuard.busy}
                onClick={() => { setCompleteJobOpen(false); handleCollectPayment({ completeAfter: true }); }}>
                <DollarSign className="w-4 h-4" /> Collect now
              </Button>
              <Button variant="outline" className="w-full rounded-xl gap-1.5 h-11" disabled={completingJob} onClick={doCompleteJob}>
                {completingJob
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Completing...</>
                  : <><CheckCircle2 className="w-4 h-4" /> Complete as unpaid</>}
              </Button>
              <Button variant="ghost" className="w-full rounded-xl h-11" onClick={() => setCompleteJobOpen(false)}>Cancel</Button>
            </div>
          ) : (
            <div className="flex gap-2 mt-2">
              <Button variant="outline" className="flex-1 rounded-xl h-11" onClick={() => setCompleteJobOpen(false)}>Cancel</Button>
              <Button
                className="flex-1 rounded-xl gap-1.5 h-11 bg-green-600 hover:bg-green-700"
                disabled={completingJob}
                onClick={doCompleteJob}
              >
                {completingJob
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Completing...</>
                  : <><CheckCircle2 className="w-4 h-4" /> Complete Job</>}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ApplyMemberPricingDialog open={memberPricingOpen} onOpenChange={setMemberPricingOpen} jobId={id} memberDiscountRate={memberDiscountRate} />
      <ScheduleJobSheet
        open={scheduleSheetOpen}
        onOpenChange={setScheduleSheetOpen}
        job={job}
        customer={customer}
        from="job"
        onDone={() => setScheduleSheetOpen(false)}
      />

      {/* Opens after Complete Job, from any tab. */}
      <Dialog open={scheduleNextOpen} onOpenChange={setScheduleNextOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Schedule Next Service?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Would you like to pre-schedule {job.customer_name}'s next maintenance visit?</p>
          <div>
            <Label className="text-xs">Next Service Date</Label>
            <Input type="datetime-local" value={nextDate} onChange={e => setNextDate(e.target.value)} className="rounded-xl mt-1" />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => { setScheduleNextOpen(false); goBack(navigate, location, "/jobs"); }}>Skip</Button>
            <Button className="flex-1 rounded-xl" disabled={scheduleNextGuard.busy} onClick={() => scheduleNextGuard.run(async function scheduleIt() {
              if (!nextDate) return;
              try {
                // Fixed id: a double tap or a Retry can't create a second job (A-05).
                const nextJob = await createOnce(db.Job, scheduleNextId.current, {
                  customer_id: job.customer_id, customer_name: job.customer_name,
                  title: job.title, job_type: "maintenance", status: "scheduled",
                  scheduled_date: new Date(nextDate).toISOString(),
                  notes: `Auto-scheduled following service on ${new Date().toLocaleDateString()}`,
                });
              } catch (e) {
                haptics.error();
                showSaveError("Next service NOT scheduled", e, () => scheduleNextGuard.run(scheduleIt), { id: "schedule-next-error" });
                return;
              }
              dismissSaveError("", { id: "schedule-next-error" });
              syncJobToCalendar({ job: nextJob, customer }); // never throws or blocks
              setScheduleNextOpen(false);
              toast.success("Next service scheduled");
              queryClient.invalidateQueries({ queryKey: ["jobs"] });
              goBack(navigate, location, "/jobs");
            })}>{scheduleNextGuard.busy ? "Scheduling…" : "Schedule It"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* The job's main action, just above the tab bar on every job tab. */}
      {/* The job's main action lives on its Overview tab only (Run 8, B2): on
          Work / Docs / Photos / History / Notes / Items it floated over lists
          and inputs. Overview shows the status, totals and Service Summary the
          action depends on; the other tabs are for adding things. */}
      {activeJobTab === "overview" && <BottomActionBar>
        {!isClosed && job.status === "scheduled" && (
          <Button className="w-full rounded-xl gap-1.5 h-11 bg-cyan-700 hover:bg-cyan-800" disabled={statusGuard.busy}
            onClick={() => statusGuard.run(() => handleStatusChange("dispatched", { dispatched_time: new Date().toISOString() }))}>
            {statusGuard.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />} Dispatch — Head Out
          </Button>
        )}
        {!isClosed && job.status === "dispatched" && (
          <Button className="w-full rounded-xl gap-1.5 h-11 bg-amber-700 hover:bg-amber-800" disabled={statusGuard.busy}
            onClick={() => statusGuard.run(async () => {
              const now = new Date().toISOString();
              setOptimisticOnSiteTime(now);
              // Clock only keeps running if the arrival was saved.
              if (!(await handleStatusChange("on_site", { on_site_time: now }))) setOptimisticOnSiteTime(null);
            })}>
            {statusGuard.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />} Arrived — Start Clock
          </Button>
        )}
        {!isClosed && jobIsOpenOnSite && (
          <Button className="w-full rounded-xl gap-1.5 h-11 bg-green-600 hover:bg-green-700"
            onClick={requestCompleteJob}>
            <CheckCircle2 className="w-4 h-4" /> Complete Job
          </Button>
        )}
        {showCollectNow && (
          <Button className="w-full rounded-xl gap-1.5 h-11 bg-green-600 hover:bg-green-700" onClick={() => handleCollectPayment()} disabled={collectGuard.busy}>
            <DollarSign className="w-4 h-4" /> Collect Payment Now{invoicePartlyPaid ? ` — ${formatCurrency(balanceDue)} due` : ""}
          </Button>
        )}
      </BottomActionBar>}
    </div>
  );
}