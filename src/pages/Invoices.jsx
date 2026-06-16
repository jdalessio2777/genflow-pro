import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { Link } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, DollarSign, Send } from "lucide-react";
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

  const markPaid = (inv) => {
    updateMutation.mutate(
      { id: inv.id, data: { status: "paid", paid_date: new Date().toISOString() } },
      { onSuccess: () => toast.success("Invoice marked as paid") }
    );
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
                    onAction: () => markPaid(inv),
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
    </div>
  );
}
