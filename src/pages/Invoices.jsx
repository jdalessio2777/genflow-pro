import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { Link } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, DollarSign, Send, X } from "lucide-react";
import { haptics } from "@/lib/haptics";
import PageHeader from "@/components/layout/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import AnimatedListItem from "@/components/ui/AnimatedListItem";
import SwipeableListItem from "@/components/ui/SwipeableListItem";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { useState } from "react";
import { toast } from "sonner";

export default function Invoices() {
  const [filter, setFilter] = useState("all");
  const [payingInvoice, setPayingInvoice] = useState(null);
  const queryClient = useQueryClient();

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => db.Invoice.list("-created_date"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => db.Invoice.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e) => toast.error("Failed to update: " + e.message),
  });

  const markPaid = (inv, method) => {
    updateMutation.mutate(
      { id: inv.id, data: { status: "paid", payment_method: method, paid_date: new Date().toISOString() } },
      { onSuccess: () => { haptics.success(); toast.success("Invoice marked as paid"); } }
    );
    setPayingInvoice(null);
  };

  const markSent = (inv) => {
    updateMutation.mutate(
      { id: inv.id, data: { status: "sent" } },
      { onSuccess: () => toast.success("Invoice marked as sent") }
    );
  };

  const filtered = invoices.filter(i => {
    if (filter === "all") return true;
    return i.status === filter;
  });

  const totalUnpaid = invoices.filter(i => i.status !== "paid" && i.status !== "draft")
    .reduce((s, i) => s + (i.total || 0), 0);

  return (
    <div>
      <PageHeader title="Invoices" subtitle={totalUnpaid > 0 ? `${formatCurrency(totalUnpaid)} outstanding` : `${invoices.length} total`} />

      <div className="px-4 pt-3 pb-4 space-y-3 max-w-lg mx-auto">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList className="w-full grid grid-cols-4 bg-muted/60 rounded-xl p-0.5">
            <TabsTrigger value="all" className="text-xs rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">All</TabsTrigger>
            <TabsTrigger value="draft" className="text-xs rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Draft</TabsTrigger>
            <TabsTrigger value="sent" className="text-xs rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Sent</TabsTrigger>
            <TabsTrigger value="paid" className="text-xs rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Paid</TabsTrigger>
          </TabsList>
        </Tabs>

        {filtered.length === 0 && !isLoading ? (
          <EmptyState icon={FileText} title="No invoices" description="Invoices are created from completed jobs" />
        ) : (
          <div className="space-y-2">
            {filtered.map((inv, idx) => (
              <AnimatedListItem key={inv.id} index={idx}>
              <SwipeableListItem
                rightActions={[
                  ...((inv.status === "sent" || inv.status === "draft") ? [{
                    label: "Paid",
                    icon: <DollarSign size={18} className="text-white" />,
                    color: "bg-green-500",
                    onAction: () => setPayingInvoice(inv),
                  }] : []),
                  ...(inv.status === "draft" ? [{
                    label: "Send",
                    icon: <Send size={18} className="text-white" />,
                    color: "bg-blue-500",
                    onAction: () => markSent(inv),
                  }] : []),
                ]}
              >
              <Link to={`/invoices/${inv.id}`}>
                <div className="bg-card border border-border rounded-2xl p-3.5 hover:border-primary/20 hover:shadow-sm transition-all duration-150 active:scale-[0.99]">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{inv.customer_name}</p>
                      <p className="text-xs text-muted-foreground">{inv.invoice_number} · {formatDate(inv.created_date)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold">{formatCurrency(inv.total)}</span>
                      <StatusBadge status={inv.status} />
                    </div>
                  </div>
                </div>
                </Link>
              </SwipeableListItem>
              </AnimatedListItem>
            ))}
          </div>
        )}
      </div>

      {payingInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          onClick={() => setPayingInvoice(null)}
        >
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full max-w-lg mx-auto bg-card rounded-t-2xl p-5 pb-8 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold">How was this paid?</p>
              <button onClick={() => setPayingInvoice(null)} className="p-1 rounded-full hover:bg-muted">
                <X size={16} className="text-muted-foreground" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4 truncate">{payingInvoice.customer_name} · {payingInvoice.invoice_number}</p>
            <div className="grid grid-cols-3 gap-2">
              {["cash", "card", "check", "zelle", "venmo", "other"].map(method => (
                <button
                  key={method}
                  onClick={() => markPaid(payingInvoice, method)}
                  className="py-3 rounded-xl bg-muted hover:bg-primary hover:text-primary-foreground text-sm font-medium capitalize transition-colors"
                >
                  {method}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
