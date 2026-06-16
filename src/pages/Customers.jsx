import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Search, Phone, MapPin, Shield, Calendar, Trash2 } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import RewardBadge from "@/components/ui/RewardBadge";
import AnimatedListItem from "@/components/ui/AnimatedListItem";
import { Users } from "lucide-react";
import { formatPhone, formatDate } from "@/lib/utils/format";
import { toast } from "sonner";

function getServiceStatus(customer) {
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

function getCallListCategory(customer) {
  const svc = getServiceStatus(customer);
  if (!svc) return null;
  const { daysUntilDue } = svc;
  if (daysUntilDue < 0) return "overdue";
  if (daysUntilDue <= 30) return "due_soon";
  if (daysUntilDue <= 90) return "upcoming";
  return null;
}

function CustomerCard({ customer }) {
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: async (customerId) => {
      const jobs = await db.Job.filter({ customer_id: customerId });
      for (const job of jobs) {
        const [parts, labor, docs, photos] = await Promise.all([
          db.JobPart.filter({ job_id: job.id }),
          db.JobLabor.filter({ job_id: job.id }),
          db.JobDocument.filter({ job_id: job.id }),
          db.JobPhoto.filter({ job_id: job.id }),
        ]);
        await Promise.all([
          ...parts.map(r => db.JobPart.delete(r.id)),
          ...labor.map(r => db.JobLabor.delete(r.id)),
          ...docs.map(r => db.JobDocument.delete(r.id)),
          ...photos.map(r => db.JobPhoto.delete(r.id)),
        ]);
        await db.Job.delete(job.id);
      }
      return db.Customer.delete(customerId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer deleted");
    },
    onError: (e) => toast.error("Failed to delete: " + e.message),
  });

  const svc = getServiceStatus(customer);
  let svcBadge = null;
  if (svc) {
    const { daysUntilDue, dueDate } = svc;
    if (daysUntilDue < 0) svcBadge = { label: `${Math.abs(daysUntilDue)}d overdue`, style: "text-red-700 bg-red-50 border-red-200" };
    else if (daysUntilDue <= 30) svcBadge = { label: `Due in ${daysUntilDue}d`, style: "text-amber-700 bg-amber-50 border-amber-200" };
    else if (daysUntilDue <= 90) svcBadge = { label: `Due ${dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, style: "text-blue-700 bg-blue-50 border-blue-200" };
  }

  return (
    <div className="relative">
      <Link to={`/customers/${customer.id}`}>
        <div className="bg-card border border-border rounded-2xl p-3.5 card-lift hover:border-primary/20 pr-10">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-foreground">{customer.name}</p>
            <RewardBadge show={customer.pending_reward} />
          </div>
          <p className={`text-xs mt-0.5 ${customer.generator_model ? "text-muted-foreground" : "text-muted-foreground/50"}`}>
            {customer.generator_model || "Generator not specified"}
          </p>
          <div className="flex items-center justify-between mt-1.5 gap-2">
            <p className={`text-xs ${customer.last_service_date ? "text-muted-foreground" : "text-amber-600 font-medium"}`}>
              {customer.last_service_date ? `Last service: ${formatDate(customer.last_service_date)}` : "Never serviced"}
            </p>
            {customer.membership_plan && customer.membership_signed && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-green-100 text-green-700 border border-green-200/60 shrink-0">
                <Shield className="w-2.5 h-2.5" /> Member
              </span>
            )}
          </div>
          {customer.address && (
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{customer.address}</span>
            </div>
          )}
        </div>
      </Link>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            onClick={e => e.stopPropagation()}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {customer.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently deletes this customer and ALL their jobs, documents, photos, and history. Cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(customer.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CallListCard({ customer, category }) {
  const svc = getServiceStatus(customer);
  const { daysUntilDue, dueDate } = svc;

  const categoryStyle = {
    overdue: "border-red-200 bg-red-50/60",
    due_soon: "border-amber-200 bg-amber-50/60",
    upcoming: "border-blue-100 bg-blue-50/40",
  }[category];

  const labelStyle = {
    overdue: "text-red-700 bg-red-100",
    due_soon: "text-amber-700 bg-amber-100",
    upcoming: "text-blue-700 bg-blue-100",
  }[category];

  const dueLabel = daysUntilDue < 0
    ? `${Math.abs(daysUntilDue)}d overdue`
    : daysUntilDue === 0
    ? "Due today"
    : `Due ${dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <div className={`border rounded-2xl p-3.5 ${categoryStyle}`}>
      <div className="flex items-start justify-between gap-2">
        <Link to={`/customers/${customer.id}`} className="min-w-0 flex-1">
          <p className="font-semibold text-sm">{customer.name}</p>
          {customer.generator_model && (
            <p className="text-xs text-muted-foreground mt-0.5">{customer.generator_model}</p>
          )}
          {customer.address && (
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{customer.address}</span>
            </div>
          )}
        </Link>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`text-xs font-bold px-2 py-1 rounded-lg ${labelStyle}`}>{dueLabel}</span>
          <div className="flex items-center gap-1.5">
            {customer.phone && (
              <a
                href={`tel:${customer.phone}`}
                className="flex items-center gap-1 text-xs font-semibold text-white bg-primary rounded-lg px-2.5 py-1.5 hover:bg-primary/90 active:scale-95 transition-all"
              >
                <Phone className="w-3.5 h-3.5" /> Call
              </a>
            )}
            <Link
              to={`/jobs/new?customer=${customer.id}`}
              className="flex items-center gap-1 text-xs font-semibold text-primary border border-primary rounded-lg px-2.5 py-1.5 hover:bg-primary/5 active:scale-95 transition-all bg-white"
            >
              <Calendar className="w-3.5 h-3.5" /> Schedule
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Customers() {
  const [search, setSearch] = useState("");

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: () => db.Customer.list("-created_date"),
  });

  const filtered = customers.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.address?.toLowerCase().includes(search.toLowerCase()) ||
    c.generator_model?.toLowerCase().includes(search.toLowerCase())
  );

  const callListCustomers = customers
    .map(c => ({ ...c, _cat: getCallListCategory(c) }))
    .filter(c => c._cat !== null)
    .sort((a, b) => {
      const order = { overdue: 0, due_soon: 1, upcoming: 2 };
      return order[a._cat] - order[b._cat];
    });

  const callListBadgeCount = callListCustomers.filter(c => c._cat === "overdue" || c._cat === "due_soon").length;

  const overdue = callListCustomers.filter(c => c._cat === "overdue");
  const dueSoon = callListCustomers.filter(c => c._cat === "due_soon");
  const upcoming = callListCustomers.filter(c => c._cat === "upcoming");

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={`${customers.length} total`}
        actions={
          <Link to="/customers/new">
            <Button size="sm" className="rounded-xl gap-1.5">
              <Plus className="w-4 h-4" /> Add
            </Button>
          </Link>
        }
      />

      <div className="px-4 pt-3 pb-4 max-w-lg mx-auto">
        <Tabs defaultValue="all">
          <TabsList className="w-full mb-3">
            <TabsTrigger value="all" className="flex-1">All Customers</TabsTrigger>
            <TabsTrigger value="calllist" className="flex-1 relative">
              Call List
              {callListBadgeCount > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {callListBadgeCount > 9 ? "9+" : callListBadgeCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-3 mt-0">
            <div className="tab-fade">
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search customers..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 rounded-xl"
                />
              </div>

              {filtered.length === 0 && !isLoading ? (
                <EmptyState
                  icon={Users}
                  title="No customers yet"
                  subtitle="Add your first customer to get started"
                  action={
                    <Link to="/customers/new">
                      <Button className="rounded-xl gap-1.5">
                        <Plus className="w-4 h-4" /> Add Customer
                      </Button>
                    </Link>
                  }
                />
              ) : (
                <div className="space-y-2">
                  {filtered.map((customer, idx) => (
                    <AnimatedListItem key={customer.id} index={idx}>
                      <CustomerCard customer={customer} />
                    </AnimatedListItem>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="calllist" className="space-y-4 mt-0">
            <div className="tab-fade">
            {callListCustomers.length === 0 ? (
              <EmptyState
                icon={Phone}
                title="All caught up"
                subtitle="No customers are due for service right now"
              />
            ) : (
              <>
                {overdue.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-red-600 mb-2">Overdue ({overdue.length})</p>
                    <div className="space-y-2">
                      {overdue.map(c => <CallListCard key={c.id} customer={c} category="overdue" />)}
                    </div>
                  </div>
                )}
                {dueSoon.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-600 mb-2">Due Soon ({dueSoon.length})</p>
                    <div className="space-y-2">
                      {dueSoon.map(c => <CallListCard key={c.id} customer={c} category="due_soon" />)}
                    </div>
                  </div>
                )}
                {upcoming.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-600 mb-2">Upcoming ({upcoming.length})</p>
                    <div className="space-y-2">
                      {upcoming.map(c => <CallListCard key={c.id} customer={c} category="upcoming" />)}
                    </div>
                  </div>
                )}
              </>
            )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}