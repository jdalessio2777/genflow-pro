import { useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/layout/PageHeader";
import { CheckCircle2, XCircle, Loader2, Mail, Phone, MapPin, ExternalLink, CalendarPlus, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useBack } from "@/hooks/useBack";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import { toast } from "sonner";
import { jobFromApprovedQuote, jobLinesFromQuote, quoteTitle, sortQuoteLines } from "@/lib/quoteToJob";
import { createOnce, newRequestId } from "@/lib/saveSafety";
import { afterSheetsClose } from "@/lib/sheetHistory";
import ScheduleJobSheet from "@/components/jobs/ScheduleJobSheet";
import { computeQuoteTotals, agreementTypeForRate } from "@/lib/utils/quoteTotals";
import { SERVICE_TYPES } from "@/lib/jobTypes";

const STATUS_STYLES = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-700",
  expired: "bg-amber-100 text-amber-700",
};

export default function QuoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: quote, isLoading } = useQuery({
    queryKey: ["quote", id],
    queryFn: async () => (await db.Quote.filter({ id }))[0],
  });

  const { data: lineItems = [] } = useQuery({
    queryKey: ["quote-line-items", id],
    queryFn: async () => sortQuoteLines(await db.QuoteLineItem.filter({ quote_id: id })),
  });

  const { data: customer } = useQuery({
    queryKey: ["quote-customer", quote?.customer_id],
    queryFn: async () => (await db.Customer.filter({ id: quote.customer_id }))[0],
    enabled: !!quote?.customer_id,
  });

  // Same totals as jobs/invoices (H-3): NJ tax included in Total Due.
  const { subtotal, taxAmount, total } = computeQuoteTotals(lineItems);
  const approving = useRef(false);
  const name = customer?.name || quote?.prospect_name;
  const email = customer?.email || quote?.prospect_email;
  const phone = customer?.phone || quote?.prospect_phone;
  const address = customer?.address || quote?.prospect_address;

  const declineMutation = useMutation({
    mutationFn: () => db.Quote.update(id, { status: "declined", declined_at: new Date().toISOString() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quote", id] });
      queryClient.invalidateQueries({ queryKey: ["quotes-inbox"] });
      toast.success("Quote marked declined");
    },
    onError: (e) => toast.error(`Failed to update quote: ${e.message}`),
  });

  // Approve: create customer (if prospect) -> job -> job_parts/job_labor from the
  // quote's line items -> quote approved (resulting_job_id), in that order. The
  // job lands in status "scheduled" with no scheduled_date; the "Schedule this
  // job" sheet (B1) opens right away to give it a date, arrival time, tech and
  // estimated time on site — or "Schedule later" leaves it Not scheduled.
  //
  // Never two jobs for one quote: the quote is re-read first and an existing
  // resulting_job_id is reused (second device / stale screen / reopened
  // quote); every row uses an id fixed for this screen, so a Retry after a
  // lost response finds what it already made (createOnce).
  const createIds = useRef(null);
  if (!createIds.current) createIds.current = { customer: newRequestId(), job: newRequestId(), lines: {} };
  const [sheetJob, setSheetJob] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const openSheetFor = (job) => { setSheetJob(job); setSheetOpen(true); };

  const approveMutation = useMutation({
    mutationFn: async () => {
      const fresh = (await db.Quote.filter({ id }))[0];
      if (fresh?.resulting_job_id) {
        const existing = (await db.Job.filter({ id: fresh.resulting_job_id }))[0];
        if (existing) return { job: existing, reused: true };
      }

      let finalCustomerId = fresh?.customer_id || quote.customer_id;
      let customerName = customer?.name;

      if (!finalCustomerId) {
        const newCustomer = await createOnce(db.Customer, createIds.current.customer, {
          name: quote.prospect_name,
          phone: quote.prospect_phone || null,
          email: quote.prospect_email || null,
          address: quote.prospect_address || null,
        });
        finalCustomerId = newCustomer.id;
        customerName = newCustomer.name;
      } else if (!customerName) {
        customerName = (await db.Customer.filter({ id: finalCustomerId }))[0]?.name || quote.customer_name;
      }

      const job = await createOnce(db.Job, createIds.current.job,
        jobFromApprovedQuote(quote, { customerId: finalCustomerId, customerName, lineItems }));

      const [catalogParts, catalogRates] = await Promise.all([
        Promise.all(lineItems.filter(l => l.source_part_id).map(l => db.Part.filter({ id: l.source_part_id }))).then(r => r.flat()),
        Promise.all(lineItems.filter(l => l.source_labor_rate_id).map(l => db.LaborRate.filter({ id: l.source_labor_rate_id }))).then(r => r.flat()),
      ]);
      const ids = createIds.current.lines;
      lineItems.forEach(l => { ids[l.id] ??= newRequestId(); });
      const rows = jobLinesFromQuote(lineItems, { jobId: job.id, catalogParts, catalogRates, ids, agreementTypeForRate, at: Date.now() });
      await Promise.all([
        ...rows.parts.map(r => createOnce(db.JobPart, r.id, r)),
        ...rows.labor.map(r => createOnce(db.JobLabor, r.id, r)),
      ]);

      await db.Quote.update(id, {
        status: "approved",
        approved_at: new Date().toISOString(),
        customer_id: finalCustomerId,
        resulting_job_id: job.id,
      });

      return { job, reused: false };
    },
    onSuccess: ({ job, reused }) => {
      queryClient.invalidateQueries({ queryKey: ["quote", id] });
      queryClient.invalidateQueries({ queryKey: ["quotes-inbox"] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success(reused ? "Quote already approved — opening its job" : "Quote approved — job created");
      if (!job.scheduled_date && !["canceled", "completed", "invoiced"].includes(job.status)) openSheetFor(job);
      else navigate(`/jobs/${job.id}`, { replace: true });
    },
    onError: (e) => toast.error(`Failed to approve quote: ${e.message}`),
  });

  // An approved quote whose job still has no date: offer the sheet again.
  const { data: resultingJob } = useQuery({
    queryKey: ["job", quote?.resulting_job_id],
    queryFn: async () => (await db.Job.filter({ id: quote.resulting_job_id }))[0] ?? null,
    enabled: !!quote?.resulting_job_id,
  });
  const canScheduleResultingJob = !!resultingJob && !resultingJob.scheduled_date && resultingJob.status === "scheduled";

  // Delete (B3): the app's own confirm, staff only (the app is staff-only and
  // quotes are staff-only in the database). Only the quote and its lines go
  // (lines cascade); a job it created is never touched — the confirm for an
  // approved quote says so before anything happens.
  const [askDelete, setAskDelete] = useState(false);
  const goBack = useBack("/inbox?tab=quotes");
  const deleteMutation = useMutation({
    mutationFn: () => db.Quote.delete(id),
    onSuccess: () => {
      setAskDelete(false);
      queryClient.removeQueries({ queryKey: ["quote", id] });
      queryClient.invalidateQueries({ queryKey: ["quotes-inbox"] });
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast.success("Quote deleted");
      afterSheetsClose(() => goBack());
    },
    onError: (e) => toast.error(`Quote NOT deleted: ${e.message}`),
  });

  // Created / scheduled, or "Schedule later": the job replaces this quote
  // screen (back from the job returns to where the quote was opened from),
  // after the sheet's history entry is gone.
  const finishSheet = (_kind, job) => {
    setSheetOpen(false);
    const jobId = job?.id || sheetJob?.id;
    afterSheetsClose(() => navigate(`/jobs/${jobId}`, { replace: true }));
  };

  if (isLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!quote) return <div className="p-4 text-center">Quote not found</div>;

  const canAct = ["sent", "draft"].includes(quote.status);

  return (
    <div>
      <PageHeader title="Quote" subtitle={name} back />

      <div className="p-4 space-y-3 max-w-lg mx-auto pb-8">
        <Card className="p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0">
              <p className="text-base font-bold">{name}</p>
              {quoteTitle(lineItems) && <p className="text-sm text-muted-foreground" data-testid="quote-title">{quoteTitle(lineItems)}</p>}
            </div>
            <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${STATUS_STYLES[quote.status] || "bg-gray-100 text-gray-700"}`}>
              {quote.status}
            </span>
          </div>
          <div className="space-y-1.5 text-xs text-muted-foreground">
            {email && <p className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {email}</p>}
            {phone && <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {phone}</p>}
            {address && <p className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {address}</p>}
          </div>
          {!quote.customer_id && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-3">
              New prospect — no customer record yet. Approving will create one.
            </p>
          )}
          {canScheduleResultingJob && (
            <Button size="sm" className="w-full rounded-xl gap-1.5 mt-3" onClick={() => openSheetFor(resultingJob)}>
              <CalendarPlus className="w-3.5 h-3.5" /> Schedule this job
            </Button>
          )}
          {quote.resulting_job_id && (
            <Link to={`/jobs/${quote.resulting_job_id}`}>
              <Button variant="outline" size="sm" className="w-full rounded-xl gap-1.5 mt-3">
                <ExternalLink className="w-3.5 h-3.5" /> View Job
              </Button>
            </Link>
          )}
        </Card>

        <Card className="p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Line Items</p>
          <div className="space-y-2">
            {lineItems.map(l => (
              <div key={l.id} className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{l.description}</p>
                  <p className="text-xs text-muted-foreground capitalize">{l.type}{l.type === "part" ? ` · ×${l.quantity}` : ""}</p>
                </div>
                <span className="text-sm font-semibold shrink-0">{formatCurrency(l.total_price)}</span>
              </div>
            ))}
          </div>
          <div className="pt-2 mt-2 border-t border-border space-y-1" data-testid="quote-totals">
            <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
            <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">NJ Sales Tax (6.625%)</span><span>{formatCurrency(taxAmount)}</span></div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-sm font-semibold">Total Due</span>
              <span className="text-lg font-bold text-primary">{formatCurrency(total)}</span>
            </div>
          </div>
        </Card>

        {SERVICE_TYPES.some(t => t.value === quote.job_type) && (
          <Card className="p-4 flex items-center justify-between" data-testid="quote-service-type-row">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Service Type</p>
            <p className="text-sm font-medium">{SERVICE_TYPES.find(t => t.value === quote.job_type).label}</p>
          </Card>
        )}

        {quote.scope_notes && (
          <Card className="p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Scope of Work</p>
            <p className="text-sm text-foreground whitespace-pre-line">{quote.scope_notes}</p>
            <p className="text-[10px] text-muted-foreground mt-2">Included in the customer's quote email</p>
          </Card>
        )}

        {quote.notes && (
          <Card className="p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Notes</p>
            <p className="text-sm text-foreground">{quote.notes}</p>
            <p className="text-[10px] text-muted-foreground mt-2">Internal only — not shown to the customer</p>
          </Card>
        )}

        {quote.sent_at && (
          <p className="text-xs text-muted-foreground text-center">Sent {formatDateTime(quote.sent_at)}</p>
        )}

        {canAct && (
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1 rounded-xl gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
              disabled={declineMutation.isPending || approveMutation.isPending}
              onClick={() => declineMutation.mutate()}
            >
              {declineMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} Mark Declined
            </Button>
            <Button
              className="flex-1 rounded-xl gap-1.5"
              disabled={approveMutation.isPending || declineMutation.isPending}
              onClick={() => {
                // One approval only: a double tap must not create two jobs.
                if (approving.current) return;
                approving.current = true;
                approveMutation.mutate(undefined, { onSettled: () => { approving.current = false; } });
              }}
            >
              {approveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Mark Approved
            </Button>
          </div>
        )}
        <Button
          variant="ghost"
          className="w-full rounded-xl gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
          data-testid="quote-delete"
          disabled={deleteMutation.isPending}
          onClick={() => setAskDelete(true)}
        >
          <Trash2 className="w-4 h-4" /> Delete Quote
        </Button>
      </div>

      <AlertDialog open={askDelete} onOpenChange={(o) => { if (!deleteMutation.isPending) setAskDelete(o); }}>
        <AlertDialogContent className="max-w-sm rounded-2xl" data-testid="quote-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>{quote.resulting_job_id ? "This quote created a job" : "Delete this quote?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {quote.resulting_job_id
                ? <>Deleting the quote for {name} keeps its job{resultingJob?.title ? <> “{resultingJob.title}”</> : null} — the job, its lines and its invoice stay. Only the quote is removed. This can't be undone.</>
                : <>The quote for {name} ({formatCurrency(total)}) will be removed. This can't be undone.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-11 rounded-xl" disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => { e.preventDefault(); deleteMutation.mutate(); }}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null} {quote.resulting_job_id ? "Delete Quote Only" : "Delete Quote"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ScheduleJobSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        job={sheetJob}
        customer={sheetJob?.customer_id && customer?.id === sheetJob.customer_id ? customer : undefined}
        from="quote"
        onDone={finishSheet}
      />
    </div>
  );
}
