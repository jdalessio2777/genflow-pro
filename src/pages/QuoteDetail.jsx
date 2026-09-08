import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/layout/PageHeader";
import { CheckCircle2, XCircle, Loader2, Mail, Phone, MapPin, ExternalLink } from "lucide-react";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import { toast } from "sonner";

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
    queryFn: () => db.QuoteLineItem.filter({ quote_id: id }),
  });

  const { data: customer } = useQuery({
    queryKey: ["quote-customer", quote?.customer_id],
    queryFn: async () => (await db.Customer.filter({ id: quote.customer_id }))[0],
    enabled: !!quote?.customer_id,
  });

  const total = lineItems.reduce((s, l) => s + (l.total_price || 0), 0);
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
  // quote's line items, in that order. The job lands in status "scheduled" with
  // no scheduled_date yet — NOT "quote_sent" (that status + quote_approval_token
  // belong exclusively to the separate dead/external approval flow and must
  // never be touched here). Because there's no scheduled_date at creation time,
  // the confirmation-email auto-send in JobDetail's handleStatusChange would
  // silently no-op anyway if triggered here — so this flow doesn't attempt one.
  // Staff pick a real appointment time via the normal job-edit flow, then use
  // the existing manual "Send Confirmation Email" button when ready.
  const approveMutation = useMutation({
    mutationFn: async () => {
      let finalCustomerId = quote.customer_id;
      let customerName = customer?.name;

      if (!finalCustomerId) {
        const newCustomer = await db.Customer.create({
          name: quote.prospect_name,
          phone: quote.prospect_phone || null,
          email: quote.prospect_email || null,
          address: quote.prospect_address || null,
        });
        finalCustomerId = newCustomer.id;
        customerName = newCustomer.name;
      }

      const job = await db.Job.create({
        customer_id: finalCustomerId,
        customer_name: customerName,
        title: `Quote Follow-up — ${customerName}`,
        job_type: "quote",
        status: "scheduled",
        notes: quote.notes || null,
        quote_notes: quote.notes || null,
      });

      await Promise.all(lineItems.map(l => {
        if (l.type === "part") {
          return db.JobPart.create({
            job_id: job.id,
            name: l.description,
            quantity: l.quantity || 1,
            price: l.unit_price || 0,
            cost: 0,
            total_price: l.total_price || 0,
            total_cost: 0,
            charge_for_part: true,
          });
        }
        return db.JobLabor.create({
          job_id: job.id,
          description: l.description,
          is_flat_rate: true,
          flat_rate_amount: l.total_price || 0,
          flat_rate_cost: 0,
          total_price: l.total_price || 0,
          total_cost: 0,
        });
      }));

      const updatedQuote = await db.Quote.update(id, {
        status: "approved",
        approved_at: new Date().toISOString(),
        customer_id: finalCustomerId,
        resulting_job_id: job.id,
      });

      return { quote: updatedQuote, job };
    },
    onSuccess: ({ job }) => {
      queryClient.invalidateQueries({ queryKey: ["quote", id] });
      queryClient.invalidateQueries({ queryKey: ["quotes-inbox"] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Quote approved — job created");
      navigate(`/jobs/${job.id}`);
    },
    onError: (e) => toast.error(`Failed to approve quote: ${e.message}`),
  });

  if (isLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!quote) return <div className="p-4 text-center">Quote not found</div>;

  const canAct = ["sent", "draft"].includes(quote.status);

  return (
    <div>
      <PageHeader title="Quote" subtitle={name} back="/inbox" />

      <div className="p-4 space-y-3 max-w-lg mx-auto pb-8">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-base font-bold">{name}</p>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${STATUS_STYLES[quote.status] || "bg-gray-100 text-gray-700"}`}>
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
          <div className="flex items-center justify-between pt-2 mt-2 border-t border-border">
            <span className="text-sm font-semibold">Total</span>
            <span className="text-lg font-bold text-primary">{formatCurrency(total)}</span>
          </div>
        </Card>

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
              onClick={() => approveMutation.mutate()}
            >
              {approveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Mark Approved
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
