import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Phone, Plus, CheckCircle2 } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { formatDate } from "@/lib/utils/format";

function getServiceDue(customer) {
  if (!customer.service_interval) return null;
  const intervalMonths = customer.service_interval === "6_months" ? 6
    : customer.service_interval === "24_months" ? 24 : 12;
  const lastService = customer.last_service_date || customer.generator_install_date;
  if (!lastService) return null;
  const dueDate = new Date(lastService);
  dueDate.setMonth(dueDate.getMonth() + intervalMonths);
  const daysUntilDue = Math.ceil((dueDate - new Date()) / (1000 * 60 * 60 * 24));
  return { daysUntilDue, dueDate };
}

export default function CallList() {
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("name"),
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ["jobs"],
    queryFn: () => base44.entities.Job.list("-created_date", 200),
  });

  const activeJobCustomerIds = new Set(
    jobs
      .filter(j => ["quote", "quote_sent", "scheduled", "in_progress"].includes(j.status))
      .map(j => j.customer_id)
  );

  const callList = customers
    .map(c => ({ ...c, _due: getServiceDue(c) }))
    .filter(c => c._due && c._due.daysUntilDue <= 90)
    .sort((a, b) => a._due.daysUntilDue - b._due.daysUntilDue);

  const overdue = callList.filter(c => c._due.daysUntilDue < 0);
  const dueSoon = callList.filter(c => c._due.daysUntilDue >= 0 && c._due.daysUntilDue <= 30);
  const dueUpcoming = callList.filter(c => c._due.daysUntilDue > 30);

  const CustomerRow = ({ customer }) => {
    const { daysUntilDue, dueDate } = customer._due;
    const isOverdue = daysUntilDue < 0;
    const hasActiveJob = activeJobCustomerIds.has(customer.id);
    return (
      <Card className={`p-3.5 ${isOverdue ? "border-red-200" : "border-amber-200"}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold">{customer.name}</p>
              {hasActiveJob && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 flex items-center gap-0.5">
                  <CheckCircle2 className="w-2.5 h-2.5" /> Scheduled
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{customer.generator_model || "Generator"}</p>
            <p className={`text-xs font-semibold mt-1 ${isOverdue ? "text-red-600" : "text-amber-700"}`}>
              {isOverdue ? `Overdue by ${Math.abs(daysUntilDue)} days`
                : daysUntilDue === 0 ? "Due today"
                : `Due in ${daysUntilDue} days — ${formatDate(dueDate)}`}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {customer.phone && (
              <a href={`tel:${customer.phone}`}>
                <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl">
                  <Phone className="w-4 h-4" />
                </Button>
              </a>
            )}
            <Link to={`/jobs/new?customer=${customer.id}`}>
              <Button size="icon" className="h-9 w-9 rounded-xl">
                <Plus className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    );
  };

  const Section = ({ title, items, color }) => {
    if (items.length === 0) return null;
    return (
      <div>
        <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${color}`}>{title} ({items.length})</p>
        <div className="space-y-2">
          {items.map(c => <CustomerRow key={c.id} customer={c} />)}
        </div>
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Call List"
        subtitle={`${callList.length} customer${callList.length !== 1 ? "s" : ""} to reach out to`}
        back="/"
      />
      <div className="px-4 pt-3 pb-4 space-y-5 max-w-lg mx-auto">
        {callList.length === 0 ? (
          <Card className="p-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm font-semibold">All caught up</p>
            <p className="text-xs text-muted-foreground mt-1">No customers due for service in the next 90 days</p>
          </Card>
        ) : (
          <>
            <Section title="Overdue" items={overdue} color="text-red-600" />
            <Section title="Due within 30 days" items={dueSoon} color="text-amber-700" />
            <Section title="Due in 31–90 days" items={dueUpcoming} color="text-blue-700" />
          </>
        )}
      </div>
    </div>
  );
}