import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";
import { getUserDisplayName } from "@/lib/userColors";
import { notifyTeam, buildTable, buildRow, buildEventBadge } from "@/lib/notifyTeam";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Send, CheckCircle2, Loader2, Trash2, CreditCard, Lock } from "lucide-react";
import RewardBadge from "@/components/ui/RewardBadge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import PageHeader from "@/components/layout/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { toast } from "sonner";
import { haptics } from "@/lib/haptics";
import StripePaymentModal from "@/components/payments/StripePaymentModal";

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [showStripeModal, setShowStripeModal] = useState(false);

  const { data: invoice, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => { const r = await db.Invoice.filter({ id }); return r[0]; },
  });

  const { data: invoiceCustomer } = useQuery({
    queryKey: ["invoice-customer", invoice?.customer_id],
    queryFn: async () => { const r = await db.Customer.filter({ id: invoice.customer_id }); return r[0]; },
    enabled: !!invoice?.customer_id,
  });

  const updateMutation = useMutation({
    mutationFn: (data) => db.Invoice.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => db.Invoice.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      navigate("/invoices", { replace: true });
    },
    onError: (e) => { haptics.error(); toast.error("Failed to delete: " + e.message); },
  });

  const markSent = () => { updateMutation.mutate({ status: "sent" }); toast.success("Invoice marked as sent"); };
  const markPaid = (method) => {
    updateMutation.mutate(
      { status: "paid", payment_method: method, paid_date: new Date().toISOString() },
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
                buildRow("Date", new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })),
              ])}
            `,
            triggeredBy: getUserDisplayName(user),
          });
        }
      }
    );
  };

  const markStripePaid = async ({ surchargeAmount, paymentIntentId }) => {
    await updateMutation.mutateAsync(
      {
        status: "paid",
        payment_method: "stripe",
        paid_date: new Date().toISOString(),
        surcharge_amount: surchargeAmount,
        stripe_payment_intent_id: paymentIntentId,
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
                surchargeAmount > 0 ? buildRow("Surcharge (3%)", `$${surchargeAmount.toFixed(2)}`) : "",
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

  if (isLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!invoice) return <div className="p-4 text-center">Invoice not found</div>;

  return (
    <div>
      <PageHeader
        title={invoice.invoice_number || "Invoice"}
        subtitle={<span className="inline-flex items-center gap-1.5">{invoice.customer_name}<RewardBadge show={invoiceCustomer?.pending_reward} /></span>}
        back="/invoices"
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
            <span className="text-2xl font-bold">{formatCurrency(invoice.total)}</span>
          </div>
          <div className="text-sm space-y-1">
            <p className="flex items-center gap-1.5 flex-wrap"><span className="text-muted-foreground">Customer:</span> <Link to={`/customers/${invoice.customer_id}`} className="text-primary">{invoice.customer_name}</Link><RewardBadge show={invoiceCustomer?.pending_reward} /></p>
            <p><span className="text-muted-foreground">Date:</span> {formatDate(invoice.created_date)}</p>
            {invoice.paid_date && <p><span className="text-muted-foreground">Paid:</span> {formatDate(invoice.paid_date)} ({invoice.payment_method})</p>}
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
            <div className="flex justify-between text-base font-bold pt-1 border-t"><span>Total</span><span>{formatCurrency(invoice.total)}</span></div>
          </div>
        </Card>

        {/* Actions */}
        <Button className="w-full rounded-xl gap-2 h-11" onClick={() => navigate(`/invoices/${id}/send`)}>
          <Send className="w-4 h-4" /> Send to Customer
        </Button>

        {invoice.status === "draft" && (
          <Button variant="outline" className="w-full rounded-xl gap-2 h-11" onClick={markSent}>
            <Send className="w-4 h-4" /> Mark as Sent
          </Button>
        )}

        {(invoice.status === "draft" || invoice.status === "sent") && (
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

        {(invoice.status === "draft" || invoice.status === "sent") && (
          <Card className="p-4 border-green-200 bg-green-50 dark:border-green-700 dark:bg-green-900/20">
            <p className="text-xs font-semibold text-green-800 dark:text-green-200 mb-3 uppercase tracking-wider">Record Payment (Manual)</p>
            <div className="grid grid-cols-3 gap-2">
              {["cash", "card", "check", "zelle", "venmo", "other"].map(method => (
                <Button
                  key={method}
                  variant="outline"
                  className="rounded-xl capitalize h-11 border-green-300 dark:border-green-700 bg-white dark:bg-gray-800 hover:bg-green-100 dark:hover:bg-green-900/30"
                  onClick={() => markPaid(method)}
                >
                  <CheckCircle2 className="w-4 h-4 mr-1 text-green-600" /> {method}
                </Button>
              ))}
            </div>
          </Card>
        )}

        {invoice.customer_signature && (
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Customer Signature</p>
            <div className="border rounded-xl overflow-hidden bg-white dark:bg-gray-800 p-2">
              <img src={invoice.customer_signature} alt="Customer signature" className="w-full max-h-24 object-contain" />
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
    </div>
  );
}