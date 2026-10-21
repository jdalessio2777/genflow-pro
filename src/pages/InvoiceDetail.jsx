import { useState } from "react";
import { useParams, Link, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";
import { getUserDisplayName } from "@/lib/userColors";
import { notifyTeam, buildTable, buildRow, buildEventBadge } from "@/lib/notifyTeam";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Send, CheckCircle2, Loader2, Trash2, CreditCard, Lock, Smartphone, Printer } from "lucide-react";
import RewardBadge from "@/components/ui/RewardBadge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import PageHeader from "@/components/layout/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { toast } from "sonner";
import { haptics } from "@/lib/haptics";
import StripePaymentModal from "@/components/payments/StripePaymentModal";
import CheckNumberDialog from "@/components/payments/CheckNumberDialog";
import { sendJobSummaryEmail, newResendNonce } from "@/lib/jobSummaryEmail";
import { isZeroDollarInvoice, receiptEmailExpected } from "@/lib/utils/invoiceTotals";
import { showSaveError, dismissSaveError, useSaveGuard } from "@/lib/saveSafety";
import { useSettings } from "@/lib/useSettings";
import { surchargeConfig, surchargeFor, surchargeLabel, balanceCentsOf, owedCentsOf, amountPaidCentsOf, supportsPartialPayments } from "@/lib/utils/surcharge";
import { Switch } from "@/components/ui/switch";
import { customerFacingInvoice, invoicePrintDocumentHtml } from "@/lib/invoicePrint";
import { goBack } from "@/hooks/useBack";
import { getAppRouter, previousEntry } from "@/lib/navigation";
import { fmtPaymentMethod } from "@/lib/emailTemplates";

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const fromJobId = location.state?.fromJobId;
  // Opened from the Complete dialog's "Collect now": after the payment is
  // recorded, go back to the job and reopen Complete (Item 1b).
  const completeAfter = !!location.state?.completeAfter;
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [showStripeModal, setShowStripeModal] = useState(false);
  // Part E: "Charge on Stripe" = copy the amount + "Payment completed?" (no
  // app opening, no server call). copyState: "copied" | "failed" | null.
  const [stripeAsk, setStripeAsk] = useState(false);
  const [stripeAmount, setStripeAmount] = useState(0);
  const [copyState, setCopyState] = useState(null);
  // After a payment on a job that is already completed (its completion email
  // went out): "Send receipt to customer?" (default Yes). Open jobs never ask.
  const [receiptAsk, setReceiptAsk] = useState(false);
  const [showCheckNumberDialog, setShowCheckNumberDialog] = useState(false);
  const [resending, setResending] = useState(false);
  // Partial payments (only once invoices.amount_paid exists): blank = the
  // whole balance.
  const [payAmount, setPayAmount] = useState("");
  // Set the moment a full payment is confirmed saved: hides every payment
  // option right away, so a tap landing in the gap before the refetched
  // (paid) invoice renders can't record it twice (Batch 3 independent check).
  const [paidHere, setPaidHere] = useState(false);

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => { const r = await db.Invoice.filter({ id }); return r[0]; },
  });

  const { data: invoiceCustomer } = useQuery({
    queryKey: ["invoice-customer", invoice?.customer_id],
    queryFn: async () => { const r = await db.Customer.filter({ id: invoice.customer_id }); return r[0]; },
    enabled: !!invoice?.customer_id,
  });

  // The invoice's job: decides whether recording a payment emails a receipt
  // (only if the job's completion email already went out — see
  // receiptEmailExpected). Legacy jobs completed before that email existed
  // get their payment recorded with NO email.
  const { data: invoiceJob } = useQuery({
    queryKey: ["invoice-job", invoice?.job_id],
    queryFn: async () => { const r = await db.Job.filter({ id: invoice.job_id }); return r[0] || null; },
    enabled: !!invoice?.job_id,
  });
  const receiptWillEmail = receiptEmailExpected({ job: invoiceJob, invoice, customer: invoiceCustomer });

  const recordGuard = useSaveGuard();
  const surchargeGuard = useSaveGuard();
  const [surchargeAsk, setSurchargeAsk] = useState(false);
  const { settings } = useSettings();
  const surchargeCfg = surchargeConfig(settings);
  const updateMutation = useMutation({
    mutationFn: (data) => db.Invoice.update(id, data),
    onSuccess: (updatedInvoice) => {
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      // The job this invoice belongs to caches its own copy of this same
      // invoice (JobDetail.jsx's ["job-invoice", jobId] query) to show
      // Paid/Unpaid. That query has no live subscriber while we're on this
      // page, so invalidateQueries alone only marks it stale for whenever
      // it next remounts — the remount's first render still paints from the
      // (now-stale) cached value before its own refetch resolves, producing
      // a brief flash of the old status. Patching the cache directly with
      // the row this mutation just returned removes that flash entirely;
      // invalidating on top is just a background double-check.
      if (updatedInvoice?.job_id) {
        queryClient.setQueryData(["job-invoice", updatedInvoice.job_id], (old) => {
          if (!Array.isArray(old)) return [updatedInvoice];
          const exists = old.some(inv => inv.id === updatedInvoice.id);
          return exists
            ? old.map(inv => (inv.id === updatedInvoice.id ? updatedInvoice : inv))
            : [...old, updatedInvoice];
        });
        queryClient.invalidateQueries({ queryKey: ["job-invoice", updatedInvoice.job_id] });
        queryClient.invalidateQueries({ queryKey: ["job", updatedInvoice.job_id] });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => db.Invoice.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      // Back to wherever the invoice was opened (its job, the list…).
      goBack(navigate, location, "/invoices");
    },
    onError: (e) => { haptics.error(); toast.error("Failed to delete: " + e.message); },
  });

  // Pay-later receipt: exactly one, decided + deduped server-side (only if
  // the job's completion email already went out unpaid; atomic claim on
  // invoices.receipt_sent_at so this and any other payment path can't both
  // send). The Stripe webhook never emails.
  const sendReceiptIfNeeded = async () => {
    if (!invoice?.job_id) return;
    // Known no-email case (e.g. legacy job whose completion email never went
    // out): don't even ask the server. Unknown (job not loaded) -> server decides.
    if (receiptWillEmail === false) return;
    try {
      const r = await sendJobSummaryEmail({ jobId: invoice.job_id, kind: "receipt" });
      if (r?.id && !r.skipped) toast.success(`Receipt emailed to ${r.to}`);
    } catch (e) {
      toast.error(`Payment recorded, but the receipt email failed: ${e.message}`);
    }
  };

  // Explicit manual resend of the job summary (invoice + PDFs).
  const resendJobSummary = async () => {
    setResending(true);
    try {
      const r = await sendJobSummaryEmail({ jobId: invoice.job_id, kind: "resend", nonce: newResendNonce() });
      if (r?.skipped === "no_email") toast.error("No email on file for this customer");
      else toast.success(`Email re-sent to ${r.to}`);
    } catch (e) {
      haptics.error();
      toast.error(`Failed to resend: ${e.message}`);
    } finally {
      setResending(false);
    }
  };

  // Every "mark paid" path goes through here (H-2): one at a time, "paid"
  // only after the server saved it, and a failure stays on screen with Retry.
  // onSuccess (receipt + team email) runs only after a confirmed save.
  const recordPayment = (patch, { onSuccess } = {}) => recordGuard.run(async function attempt() {
    try {
      // Never record twice (second phone, stale screen, retry after a lost
      // response): an invoice that is already paid on the server stays as is.
      if (patch.status === "paid" || patch.status === "partial") {
        const fresh = (await db.Invoice.filter({ id }))[0];
        if (fresh?.status === "paid") {
          setPaidHere(true);
          queryClient.invalidateQueries({ queryKey: ["invoice", id] });
          toast.info("This invoice is already paid — nothing recorded");
          return false;
        }
      }
      await updateMutation.mutateAsync(patch);
      if (patch.status === "paid") setPaidHere(true);
    } catch (e) {
      haptics.error();
      showSaveError("Payment NOT recorded", e, () => recordGuard.run(attempt), { id: "record-payment-error" });
      return false;
    }
    dismissSaveError("", { id: "record-payment-error" });
    onSuccess?.();
    afterPayment(patch.status === "paid");
    return true;
  });

  // Part E email rules + where to go next, for EVERY payment method:
  // - open job (completion email not sent yet): no email, no prompt — the
  //   receipt rides on the completion email (PAID, method, surcharge);
  // - completed job (its completion email went out): ask "Send receipt to
  //   customer?" (default Yes); the server sends at most one receipt;
  // - then back to the job's summary (or reopen Complete when collecting
  //   from the Complete dialog).
  const afterPayment = (paidInFull) => {
    if (receiptWillEmail !== false && invoice?.job_id && !completeAfter) { setReceiptAsk(true); return; }
    if (paidInFull) backToJob();
  };
  const backToJob = () => {
    if (!invoice?.job_id) return;
    if (completeAfter) {
      // Pop back to the job (no second copy of it in history) and reopen
      // Complete there; replace only if the job isn't the previous screen.
      const prev = previousEntry(getAppRouter()?.state.location ?? location);
      if (prev?.entry && prev.entry.path.split("?")[0] === `/jobs/${invoice.job_id}`) {
        try { sessionStorage.setItem("gf-open-complete", invoice.job_id); } catch { /* ignore */ }
        navigate(-prev.steps);
      } else {
        navigate(`/jobs/${invoice.job_id}`, { replace: true, state: { openComplete: true } });
      }
      return;
    }
    const prev = previousEntry(getAppRouter()?.state.location ?? location);
    if (prev?.entry && prev.entry.path.split("?")[0] === `/jobs/${invoice.job_id}`) navigate(-prev.steps);
    else navigate(`/jobs/${invoice.job_id}`, { replace: true });
  };
  const answerReceipt = async (send) => {
    setReceiptAsk(false);
    if (send) await sendReceiptIfNeeded();
    if (invoice?.status === "paid" || paidHere) backToJob();
  };

  const markSent = () => updateMutation.mutate({ status: "sent" }, {
    onSuccess: () => toast.success("Invoice marked as sent"),
    onError: (e) => showSaveError("Invoice NOT marked as sent", e, markSent, { id: "mark-sent-error" }),
  });
  const markPaid = (method, reference) => {
    // Partial payment (column present + an amount below the balance).
    const balanceCents = balanceCentsOf(invoice);
    const entered = Math.round(parseFloat(String(payAmount).replace(/[$,\s]/g, "")) * 100);
    const partial = supportsPartialPayments(invoice) && payAmount.trim() !== "" && Number.isFinite(entered) && entered > 0 && entered < balanceCents;
    if (supportsPartialPayments(invoice) && payAmount.trim() !== "" && !(Number.isFinite(entered) && entered > 0 && entered <= balanceCents)) {
      toast.error(`Enter an amount from $0.01 to ${formatCurrency(balanceCents / 100)}`);
      return;
    }
    if (partial) {
      const paidSoFar = (amountPaidCentsOf(invoice) + entered) / 100;
      recordPayment(
        { status: "partial", amount_paid: paidSoFar, payment_method: method, payment_reference: reference || null },
        { onSuccess: () => { haptics.success(); setPayAmount(""); toast.success(`${formatCurrency(entered / 100)} recorded — ${formatCurrency((balanceCents - entered) / 100)} still due`); } }
      );
      return;
    }
    // A card surcharge doesn't belong on a cash/check/Zelle/Venmo payment.
    let surcharge = Number(invoice.surcharge_amount) || 0;
    if (surcharge > 0 && window.confirm(`This invoice has a credit card surcharge (${formatCurrency(surcharge)}). Remove it? ${method} is not a credit card payment.`)) surcharge = 0;
    else if (surcharge > 0) surcharge = surchargeFor(invoice, surchargeCfg);
    const paidTotal = Math.round((owedCentsOf(invoice) / 100 + surcharge) * 100) / 100;
    recordPayment(
      { status: "paid", payment_method: method, payment_reference: reference || null, paid_date: new Date().toISOString(), surcharge_amount: surcharge, total: paidTotal, ...(supportsPartialPayments(invoice) ? { amount_paid: owedCentsOf(invoice) / 100 } : {}) },
      {
        onSuccess: () => {
          haptics.success();
          toast.success("Invoice marked as paid");
          notifyTeam({
            subject: `Invoice Paid — ${invoice.customer_name} · $${(invoice.total || 0).toFixed(2)}`,
            body: `
              <p style="font-size:14px;margin:0 0 4px 0;">${buildEventBadge("Payment Received", "green")}</p>
              ${buildTable([
                buildRow("Customer", invoice.customer_name),
                buildRow("Invoice", invoice.invoice_number),
                buildRow("Amount", `$${(invoice.total || 0).toFixed(2)}`),
                buildRow("Method", method),
                reference ? buildRow("Reference", `#${reference}`) : "",
                buildRow("Date", new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })),
              ].filter(Boolean))}
            `,
            triggeredBy: getUserDisplayName(user),
          });
        }
      }
    );
  };

  // The card was already charged when this runs; if saving fails, the
  // persistent "Payment NOT recorded" message with Retry is what keeps the
  // invoice from staying unpaid (the webhook also records it on production).
  const markStripePaid = async ({ surchargeAmount, paymentIntentId }) => {
    await recordPayment(
      {
        status: "paid",
        payment_method: "stripe",
        paid_date: new Date().toISOString(),
        surcharge_amount: surchargeAmount,
        stripe_payment_intent_id: paymentIntentId,
        total: Math.round((owedCentsOf(invoice) / 100 + surchargeAmount) * 100) / 100,
        ...(supportsPartialPayments(invoice) ? { amount_paid: owedCentsOf(invoice) / 100 } : {}),
      },
      {
        onSuccess: () => {
          haptics.success();
          toast.success("Payment successful");
          notifyTeam({
            subject: `Invoice Paid (Stripe) — ${invoice.customer_name} · $${((invoice.total || 0) + surchargeAmount).toFixed(2)}`,
            body: `
              <p style="font-size:14px;margin:0 0 4px 0;">${buildEventBadge("Payment Received", "green")}</p>
              ${buildTable([
                buildRow("Customer", invoice.customer_name),
                buildRow("Invoice", invoice.invoice_number),
                buildRow("Amount", `$${(invoice.total || 0).toFixed(2)}`),
                surchargeAmount > 0 ? buildRow("Card surcharge", `$${surchargeAmount.toFixed(2)}`) : "",
                buildRow("Total Charged", `$${((invoice.total || 0) + surchargeAmount).toFixed(2)}`),
                buildRow("Method", "Stripe (credit/debit card)"),
                buildRow("Date", new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })),
              ].filter(Boolean))}
            `,
            triggeredBy: getUserDisplayName(user),
          });
        },
      }
    );
  };

  // Base + tax only — what's owed before any card surcharge. The in-app
  // card form adds its own (server-computed) surcharge on top of this.
  // What is still owed: the whole invoice, or the balance after a recorded
  // partial payment.
  const getOwedTotal = () => balanceCentsOf(invoice) / 100;
  // What the customer pays now: owed + the credit card surcharge line, if
  // one was added on this screen. The Stripe App flow charges exactly this.
  // The surcharge is recomputed from the shared formula (Stripe's fee on the
  // amount charged), never taken from the stored figure.
  const getAmountDue = () => Math.round((getOwedTotal() + (Number(invoice.surcharge_amount) > 0 ? surchargeFor(invoice, surchargeCfg) : 0)) * 100) / 100;

  // Credit card surcharge button (Part 2): added like a discount — a tap,
  // a credit-card check, one-tap remove. Stored in invoices.surcharge_amount
  // (not taxed by default), recomputed from the shared config.
  const setSurcharge = (on) => surchargeGuard.run(async function attempt() {
    try {
      await updateMutation.mutateAsync({ surcharge_amount: on ? surchargeFor(invoice, surchargeCfg) : 0 });
      dismissSaveError("", { id: "surcharge-error" });
      toast.success(on ? "Credit card surcharge added" : "Credit card surcharge removed");
    } catch (e) {
      haptics.error();
      showSaveError(on ? "Surcharge NOT added" : "Surcharge NOT removed", e, () => surchargeGuard.run(attempt), { id: "surcharge-error" });
    }
  });

  // "Charge on Stripe" (Part E): copy the exact amount due (surcharge
  // included) inside the tap — iOS allows clipboard writes only there — then
  // ask "Payment completed?". Nothing is sent to Stripe or the server.
  const chargeOnStripe = () => {
    const amount = getAmountDue();
    setStripeAmount(amount);
    copyAmount(amount);
    setStripeAsk(true);
  };
  const copyAmount = (amount) => {
    const text = amount.toFixed(2);
    try {
      navigator.clipboard.writeText(text).then(
        () => { setCopyState("copied"); toast.success(`${formatCurrency(amount)} copied`); },
        () => setCopyState("failed"),
      );
    } catch { setCopyState("failed"); }
  };

  // Yes on "Payment completed?": recorded ONCE as Card (Stripe App) with the
  // total incl. surcharge (recordPayment is single-flight and re-checks the
  // server copy first).
  const markStripeAppPaid = () => {
    const surcharge = Number(invoice.surcharge_amount) > 0 ? surchargeFor(invoice, surchargeCfg) : 0;
    const total = Math.round((owedCentsOf(invoice) / 100 + surcharge) * 100) / 100;
    setStripeAsk(false);
    recordPayment(
      {
        status: "paid",
        payment_method: "stripe_app",
        paid_date: new Date().toISOString(),
        surcharge_amount: surcharge,
        total,
        ...(supportsPartialPayments(invoice) ? { amount_paid: owedCentsOf(invoice) / 100 } : {}),
      },
      {
        onSuccess: () => {
          haptics.success();
          toast.success(`Paid — ${formatCurrency(getAmountDue())} by card (Stripe App)`);
          notifyTeam({
            subject: `Invoice Paid (Stripe App) — ${invoice.customer_name} · $${total.toFixed(2)}`,
            body: `
              <p style="font-size:14px;margin:0 0 4px 0;">${buildEventBadge("Payment Received", "green")}</p>
              ${buildTable([
                buildRow("Customer", invoice.customer_name),
                buildRow("Invoice", invoice.invoice_number),
                surcharge > 0 ? buildRow("Card surcharge", `$${surcharge.toFixed(2)}`) : "",
                buildRow("Total Charged", `$${total.toFixed(2)}`),
                buildRow("Method", "Card (Stripe App)"),
                buildRow("Date", new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })),
              ].filter(Boolean))}
            `,
            triggeredBy: getUserDisplayName(user),
          });
        },
      }
    );
  };

  if (isLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!invoice) return <div className="p-4 text-center">Invoice not found</div>;

  // Exactly $0.00 (integer cents): nothing to collect — hide every payment
  // option. Negative and > $0 invoices are unaffected.
  const isNoCharge = isZeroDollarInvoice(invoice);
  const canCollect = ["draft", "sent", "partial"].includes(invoice.status) && !isNoCharge && !paidHere;
  const partialEnabled = supportsPartialPayments(invoice);
  const paidSoFar = amountPaidCentsOf(invoice) / 100;
  // Signature: the job's (collected any time) — the invoice copy may predate it.
  const signature = invoiceJob?.customer_signature || invoice.customer_signature;
  // What the customer sees (emails, print): the job's live Service Summary.
  const customerInvoice = customerFacingInvoice({ invoice, job: invoiceJob });
  const serviceSummary = String(customerInvoice.notes ?? "").trim() ? customerInvoice.notes : "";

  // Printable invoice / Save as PDF (iOS: Print > share > Save to Files).
  const printInvoice = () => {
    const win = window.open("", "_blank");
    if (!win) { toast.error("Couldn't open the print view"); return; }
    win.document.write(invoicePrintDocumentHtml({ invoice: customerInvoice, customer: invoiceCustomer, job: invoiceJob, surchargeConfig: surchargeCfg }));
    win.document.close();
    // The page itself runs no script (CSP); wire Close from here.
    win.document.getElementById("close-invoice")?.addEventListener("click", () => win.close());
    setTimeout(() => win.print(), 500);
  };

  return (
    <div>
      <PageHeader
        title={invoice.invoice_number || "Invoice"}
        subtitle={
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="truncate min-w-0">{invoice.customer_name}</span>
            <RewardBadge show={invoiceCustomer?.pending_reward} compact />
          </span>
        }
        back={invoice.job_id ? `/jobs/${invoice.job_id}` : "/invoices"}
        backLabel={fromJobId ? "Back to Job" : undefined}
        actions={
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-xl text-destructive hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this invoice?</AlertDialogTitle>
                <AlertDialogDescription>This will permanently delete the invoice. This action cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        }
      />

      <div className="p-4 space-y-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <StatusBadge status={invoice.status} />
            <span className="text-2xl font-bold">{formatCurrency((invoice.parts_total || 0) + (invoice.labor_total || 0) + (invoice.tax_amount || 0) + (invoice.surcharge_amount || 0))}</span>
          </div>
          <div className="text-sm space-y-1">
            <p className="flex items-center gap-1.5 flex-wrap"><span className="text-muted-foreground">Customer:</span> <Link to={`/customers/${invoice.customer_id}`} className="text-primary">{invoice.customer_name}</Link><RewardBadge show={invoiceCustomer?.pending_reward} /></p>
            <p><span className="text-muted-foreground">Date:</span> {formatDate(invoice.created_date)}</p>
            {invoice.paid_date && <p><span className="text-muted-foreground">Paid:</span> {formatDate(invoice.paid_date)} ({fmtPaymentMethod(invoice.payment_method)}{invoice.payment_reference ? ` #${invoice.payment_reference}` : ""})</p>}
          </div>
        </Card>

        {/* Line items */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Line Items</h3>
          <div className="space-y-2">
            {invoice.line_items?.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} × {formatCurrency(item.unit_price)}
                  </p>
                </div>
                <span className="font-medium">{formatCurrency(item.total)}</span>
              </div>
            ))}
          </div>
          <div className="border-t pt-3 mt-3 space-y-1">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Parts</span><span>{formatCurrency(invoice.parts_total)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Labor</span><span>{formatCurrency(invoice.labor_total)}</span></div>
            <div className="flex justify-between text-sm border-t pt-2 mt-1"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency((invoice.parts_total || 0) + (invoice.labor_total || 0))}</span></div>
            {(invoice.tax_amount > 0) && (
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">NJ Sales Tax (6.625%)</span><span>{formatCurrency(invoice.tax_amount)}</span></div>
            )}
            {(invoice.surcharge_amount > 0) && (
              <div className="flex items-center justify-between text-sm" data-testid="surcharge-line">
                <span className="text-muted-foreground">{surchargeLabel(surchargeCfg)}</span>
                <span>{formatCurrency(invoice.surcharge_amount)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold pt-1 border-t"><span>Total</span><span>{formatCurrency((invoice.parts_total || 0) + (invoice.labor_total || 0) + (invoice.tax_amount || 0) + (invoice.surcharge_amount || 0))}</span></div>
            {invoice.status === "partial" && (
              <>
                <div className="flex justify-between text-sm" data-testid="paid-so-far"><span className="text-muted-foreground">Paid so far</span><span>−{formatCurrency(paidSoFar)}</span></div>
                <div className="flex justify-between text-sm font-semibold text-amber-700 dark:text-amber-300" data-testid="balance-due"><span>Balance due</span><span>{formatCurrency(getAmountDue())}</span></div>
              </>
            )}
          </div>
          {canCollect && (
            // E1: one switch. ON (after "Is this a credit card?") adds the
            // surcharge line and the totals above follow; OFF removes it.
            <div data-testid="surcharge-toggle" className="mt-3 w-full min-h-[44px] flex items-center justify-between gap-3 rounded-xl border border-border px-3">
              <span className="flex items-center gap-2 text-sm font-medium">
                <CreditCard className="w-4 h-4 text-muted-foreground" /> Credit card surcharge
                <span className="text-muted-foreground font-normal">{formatCurrency(surchargeFor({ ...invoice, surcharge_amount: 1 }, surchargeCfg))}</span>
              </span>
              <Switch
                checked={Number(invoice.surcharge_amount) > 0}
                disabled={surchargeGuard.busy}
                aria-label="Credit card surcharge"
                onCheckedChange={(on) => (on ? setSurchargeAsk(true) : setSurcharge(false))}
              />
            </div>
          )}
          <AlertDialog open={surchargeAsk} onOpenChange={setSurchargeAsk}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Is this a credit card?</AlertDialogTitle>
                <AlertDialogDescription>Debit cards can't be surcharged.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>No — debit card</AlertDialogCancel>
                <AlertDialogAction data-testid="surcharge-credit-yes" onClick={() => setSurcharge(true)}>Yes — add {formatCurrency(surchargeFor({ ...invoice, surcharge_amount: 1 }, surchargeCfg))}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Card>

        {/* Actions */}
        {invoice.job_id ? (
          // Job invoices are emailed automatically at job completion (and a
          // receipt if paid later) — this is an explicit manual resend only.
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-full rounded-xl gap-2 h-11" disabled={resending}>
                {resending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Resend Email to Customer
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Resend job summary email?</AlertDialogTitle>
                <AlertDialogDescription>
                  The customer is emailed automatically when the job is completed. This sends another copy of the invoice and any checklist / agreement PDFs.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={resendJobSummary}>Resend</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <Button className="w-full rounded-xl gap-2 h-11" onClick={() => navigate(`/invoices/${id}/send`)}>
            <Send className="w-4 h-4" /> Send to Customer
          </Button>
        )}
        <Button variant="outline" className="w-full rounded-xl gap-2 h-11" onClick={printInvoice} data-testid="print-invoice">
          <Printer className="w-4 h-4" /> Print / Save PDF
        </Button>

        {isNoCharge && invoice.status !== "paid" && (
          <Card className="p-4 bg-muted/40">
            <p className="text-sm font-semibold">No charge — {formatCurrency(0)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Nothing to collect on this invoice.</p>
          </Card>
        )}

        {invoice.status === "draft" && (
          <Button variant="outline" className="w-full rounded-xl gap-2 h-11" onClick={markSent}>
            <Send className="w-4 h-4" /> Mark as Sent
          </Button>
        )}

        {canCollect && (
          <Card className="p-4 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-xl bg-blue-100 dark:bg-blue-900/60 p-2 shrink-0">
                <Lock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Charge Card Online</p>
                <p className="text-xs text-blue-600 dark:text-blue-300 mt-0.5">
                  Securely charge a credit or debit card via Stripe
                </p>
              </div>
            </div>
            <Button
              className="w-full rounded-xl h-12 gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium"
              onClick={() => setShowStripeModal(true)}
            >
              <CreditCard className="w-4 h-4" /> Charge Card Online
            </Button>
          </Card>
        )}

        {canCollect && (
          <Card className="p-4 border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/40" data-testid="stripe-app-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="rounded-xl bg-indigo-100 dark:bg-indigo-900/60 p-2 shrink-0">
                <Smartphone className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">Charge on Stripe</p>
                <p className="text-xs text-indigo-600 dark:text-indigo-300 mt-0.5">
                  Copies {formatCurrency(getAmountDue())} — charge it in the Stripe app, then come back and confirm
                </p>
              </div>
            </div>
            <Button
              data-testid="charge-on-stripe"
              className="w-full rounded-xl h-12 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
              disabled={recordGuard.busy}
              onClick={chargeOnStripe}
            >
              <Smartphone className="w-4 h-4" /> Charge on Stripe · {formatCurrency(getAmountDue())}
            </Button>
          </Card>
        )}

        {/* "Payment completed?" — the app's own dialog; No records nothing. */}
        <AlertDialog open={stripeAsk} onOpenChange={(o) => { if (!recordGuard.busy) setStripeAsk(o); }}>
          <AlertDialogContent className="max-w-sm rounded-2xl" data-testid="stripe-confirm">
            <AlertDialogHeader>
              <AlertDialogTitle>Payment completed?</AlertDialogTitle>
              <AlertDialogDescription>Did the Stripe app charge this amount?</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="text-center space-y-2">
              <p className="text-4xl font-bold tabular-nums" data-testid="stripe-confirm-amount">{formatCurrency(stripeAmount)}</p>
              {Number(invoice.surcharge_amount) > 0 && <p className="text-xs text-muted-foreground">includes {formatCurrency(surchargeFor(invoice, surchargeCfg))} credit card surcharge</p>}
              <Button type="button" variant="outline" className="h-11 rounded-xl" data-testid="copy-amount" onClick={() => copyAmount(stripeAmount)}>
                {copyState === "copied" ? "Copied ✓ — copy again" : "Copy amount"}
              </Button>
              {copyState === "failed" && <p className="text-xs text-amber-700">Couldn't copy — type the amount above into Stripe.</p>}
            </div>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel className="h-11 rounded-xl" data-testid="stripe-confirm-no" disabled={recordGuard.busy}>No</AlertDialogCancel>
              <Button className="h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700" data-testid="stripe-confirm-yes" disabled={recordGuard.busy} onClick={markStripeAppPaid}>
                {recordGuard.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Yes — paid
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Completed job only: the receipt is a choice made after the payment. */}
        <AlertDialog open={receiptAsk} onOpenChange={(o) => { if (!o) answerReceipt(false); }}>
          <AlertDialogContent className="max-w-sm rounded-2xl" data-testid="receipt-ask">
            <AlertDialogHeader>
              <AlertDialogTitle>Send receipt to customer?</AlertDialogTitle>
              <AlertDialogDescription>A short "Payment received" email to {invoiceCustomer?.email || "the customer"}, with the amount paid{Number(invoice.surcharge_amount) > 0 ? " and the card surcharge" : ""}.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel className="h-11 rounded-xl" onClick={() => answerReceipt(false)}>Don't send</AlertDialogCancel>
              <AlertDialogAction className="h-11 rounded-xl" data-testid="receipt-send" autoFocus onClick={() => answerReceipt(true)}>Send receipt</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {canCollect && (
          <Card className="p-4 border-green-200 bg-green-50 dark:border-green-700 dark:bg-green-900/20">
            <p className="text-xs font-semibold text-green-800 dark:text-green-200 uppercase tracking-wider">
              {receiptWillEmail === false ? "Record Payment (no email)" : "Record Payment (Manual)"}
            </p>
            <p data-testid="receipt-email-hint" className="text-xs text-green-700 dark:text-green-300 mt-0.5 mb-3">
              {receiptWillEmail === false
                ? "No email now — the receipt goes out with the completion email."
                : receiptWillEmail
                  ? "You'll be asked whether to email a receipt."
                  : "\u00a0"}
            </p>
            {partialEnabled && (
              <div className="mb-3">
                <Label className="text-xs text-green-900 dark:text-green-100">Amount received</Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <Input type="text" inputMode="decimal" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                    placeholder={getOwedTotal().toFixed(2)} className="pl-7 rounded-xl bg-white dark:bg-gray-800" aria-label="Amount received" />
                </div>
                <p className="text-[11px] text-green-700 dark:text-green-300 mt-1">Leave blank for the full {formatCurrency(getOwedTotal())}. Less records a partial payment.</p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {["cash", "check", "zelle", "venmo", "other"].map(method => (
                <Button
                  key={method}
                  variant="outline"
                  className="rounded-xl capitalize h-11 border-green-300 dark:border-green-700 bg-white dark:bg-gray-800 hover:bg-green-100 dark:hover:bg-green-900/30"
                  disabled={recordGuard.busy}
                  onClick={() => method === "check" ? setShowCheckNumberDialog(true) : markPaid(method)}
                >
                  <CheckCircle2 className="w-4 h-4 mr-1 text-green-600" /> {method}
                </Button>
              ))}
            </div>
          </Card>
        )}

        {serviceSummary && (
          <Card className="p-4" data-testid="invoice-service-summary">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Service Summary</p>
            <p className="text-sm whitespace-pre-wrap break-words">{serviceSummary}</p>
          </Card>
        )}

        {signature && (
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Customer Signature</p>
            <div className="border rounded-xl overflow-hidden bg-white dark:bg-gray-800 p-2">
              <img src={signature} alt="Customer signature" className="w-full max-h-24 object-contain" />
            </div>
            {invoice.paid_date && (
              <p className="text-xs text-muted-foreground mt-1">Collected {formatDate(invoice.created_date)}</p>
            )}
          </Card>
        )}
      </div>

      {invoice && (
        <StripePaymentModal
          invoice={invoice}
          open={showStripeModal}
          onClose={() => setShowStripeModal(false)}
          onPaid={markStripePaid}
        />
      )}

      <CheckNumberDialog
        open={showCheckNumberDialog}
        onOpenChange={setShowCheckNumberDialog}
        onConfirm={(checkNumber) => { setShowCheckNumberDialog(false); markPaid("check", checkNumber); }}
      />
    </div>
  );
}