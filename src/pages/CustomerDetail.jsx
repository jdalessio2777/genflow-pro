import { useParams, Link, useNavigate } from "react-router-dom";
import { useSwipeBack } from "@/hooks/useSwipeBack";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Pencil, Mail, MapPin, Wrench, DollarSign, Loader2, Shield, ShieldPlus, Trash2, ChevronRight, FileText, Users } from "lucide-react";
import CallButtons from "@/components/ui/CallButtons";
import RewardBadge from "@/components/ui/RewardBadge";
import PageHeader from "@/components/layout/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import { formatCurrency, formatDate, formatPhone } from "@/lib/utils/format";
import { sortJobs, isJobOverdue, isClosedJob } from "@/lib/utils/jobSort";
import { serviceHistoryDocumentHtml } from "@/lib/serviceHistory";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  useSwipeBack("/customers");
  const [generatingHistory, setGeneratingHistory] = useState(false);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const invoices = await db.Invoice.filter({ customer_id: id });
      await Promise.all(invoices.map(inv => db.Invoice.delete(inv.id)));

      const jobs = await db.Job.filter({ customer_id: id });
      for (const job of jobs) {
        await Promise.all([
          db.JobPart.filter({ job_id: job.id }).then(rows => Promise.all(rows.map(r => db.JobPart.delete(r.id)))),
          db.JobLabor.filter({ job_id: job.id }).then(rows => Promise.all(rows.map(r => db.JobLabor.delete(r.id)))),
          db.JobPhoto.filter({ job_id: job.id }).then(rows => Promise.all(rows.map(r => db.JobPhoto.delete(r.id)))),
          db.JobDocument.filter({ job_id: job.id }).then(rows => Promise.all(rows.map(r => db.JobDocument.delete(r.id)))),
        ]);
        await db.Job.delete(job.id);
      }
      await db.Customer.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      navigate("/customers", { replace: true });
    },
    onError: (e) => { toast.error("Failed to delete: " + e.message); },
  });

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const res = await db.Customer.filter({ id });
      return res[0];
    },
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ["customer-jobs", id],
    queryFn: () => db.Job.filter({ customer_id: id }, "-created_date"),
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["customer-invoices", id],
    queryFn: () => db.Invoice.filter({ customer_id: id }),
  });

  if (isLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!customer) return <div className="p-4 text-center">Customer not found</div>;

  const totalRevenue = invoices.filter(i => i.status === "paid").reduce((s, i) => s + (i.total || 0), 0);

  const generateServiceHistory = () => {
    setGeneratingHistory(true);
    try {
      const completedJobs = sortJobs(jobs.filter(j => ["completed", "invoiced"].includes(j.status)));

      const html = serviceHistoryDocumentHtml({ customer, completedJobs });

      const win = window.open("", "_blank");
      if (win) {
        win.document.write(html);
        win.document.close();
        // The page itself runs no script (CSP above); wire Close from here.
        win.document.getElementById("close-history")?.addEventListener("click", () => win.close());
        setTimeout(() => win.print(), 500);
      }
    } finally {
      setGeneratingHistory(false);
    }
  };
  const lastJob = sortJobs(jobs.filter(j => j.status === "completed" || j.status === "invoiced"))[0];

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="truncate min-w-0">{customer.name}</span>
            <RewardBadge show={customer.pending_reward} compact />
          </span>
        }
        subtitle={customer.generator_model || "No generator info"}
        back="/customers"
        actions={
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl h-9 gap-1.5 text-xs"
              onClick={generateServiceHistory}
              disabled={generatingHistory}
            >
              {generatingHistory
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <FileText className="w-3.5 h-3.5" />
              }
              <span className="hidden sm:inline">History</span>
            </Button>
            <Link to={`/customers/${id}/membership`}>
              <Button
                variant="outline"
                size="sm"
                className={`rounded-xl h-9 gap-1.5 text-xs ${
                  customer?.membership_plan && customer?.membership_signed
                    ? "border-emerald-300 text-emerald-700 bg-emerald-50"
                    : "border-blue-300 text-blue-700 bg-blue-50"
                }`}
              >
                {customer?.membership_plan && customer?.membership_signed
                  ? <Shield className="w-3.5 h-3.5" />
                  : <ShieldPlus className="w-3.5 h-3.5" />
                }
                <span className="hidden sm:inline">{customer?.membership_plan && customer?.membership_signed ? "Member" : "Agreement"}</span>
              </Button>
            </Link>
            <Link to={`/customers/${id}/edit`}>
              <Button variant="ghost" size="icon" className="rounded-xl">
                <Pencil className="w-4 h-4" />
              </Button>
            </Link>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-xl text-destructive hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {customer.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this customer. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        }
      />

      <div className="p-4 space-y-4">
        {/* Contact quick actions */}
        <div className="flex gap-2">
          {customer.phone && (
            <div className="flex-1 min-w-0">
              <Card className="p-3 text-center hover:bg-muted/50 transition-colors">
                <p className="text-xs font-medium mb-2 truncate">{formatPhone(customer.phone)}</p>
                <CallButtons phone={customer.phone} />
              </Card>
            </div>
          )}
          {customer.email && (
            <a href={`mailto:${customer.email}`} className="flex-1 min-w-0">
              <Card className="p-3 text-center hover:bg-muted/50 transition-colors">
                <Mail className="w-5 h-5 mx-auto text-primary mb-1" />
                <p className="text-xs font-medium truncate">{customer.email}</p>
              </Card>
            </a>
          )}
          {customer.address && (
            <a href={`https://maps.google.com/?q=${encodeURIComponent(customer.address)}`} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0">
              <Card className="p-3 text-center hover:bg-muted/50 transition-colors">
                <MapPin className="w-5 h-5 mx-auto text-primary mb-1" />
                <p className="text-xs font-medium">Maps</p>
              </Card>
            </a>
          )}
        </div>

        {/* Membership status */}
        {customer.membership_plan && customer.membership_signed && (
          <Card className={`p-3.5 ${customer.membership_plan === "semi_annual" ? "border-emerald-200 bg-emerald-50" : "border-blue-200 bg-blue-50"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${customer.membership_plan === "semi_annual" ? "bg-emerald-600" : "bg-blue-600"}`}>
                  <Shield className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className={`text-sm font-bold ${customer.membership_plan === "semi_annual" ? "text-emerald-900" : "text-blue-900"}`}>
                    {customer.membership_plan === "semi_annual" ? "Semi-Annual" : "Annual"} Member
                  </p>
                  <p className={`text-xs ${customer.membership_plan === "semi_annual" ? "text-emerald-700" : "text-blue-700"}`}>
                    {customer.membership_plan === "semi_annual" ? "15%" : "10%"} off all services · Expires {formatDate(customer.membership_expiry)}
                  </p>
                </div>
              </div>
              <Link to={`/customers/${id}/membership`}>
                <Button size="sm" variant="outline" className="rounded-xl h-8 text-xs">Manage</Button>
              </Link>
            </div>
          </Card>
        )}

        {!customer.membership_plan && (
          <Link to={`/customers/${id}/membership`}>
            <Card className="p-4 border-blue-200 bg-blue-50 hover:bg-blue-100 transition-all active:scale-[0.99]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
                    <Shield className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-blue-900">Enroll in Protection Plan</p>
                    <p className="text-xs text-blue-700 mt-0.5">Guardian Plan $325 · Sentinel Plan $575 · 10% off all services</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-blue-400 shrink-0" />
              </div>
            </Card>
          </Link>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-lg font-bold">{jobs.length}</p>
                <p className="text-xs text-muted-foreground">Total Jobs</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <div>
                <p className="text-lg font-bold">{formatCurrency(totalRevenue)}</p>
                <p className="text-xs text-muted-foreground">Revenue</p>
              </div>
            </div>
          </Card>
          <Card className="p-3 col-span-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Last Serviced</p>
                  <p className="text-sm font-bold">
                    {lastJob ? formatDate(lastJob.completed_date || lastJob.created_date) : "No service history"}
                  </p>
                </div>
              </div>
              {lastJob && <StatusBadge status={lastJob.job_type} />}
            </div>
          </Card>
        </div>

        {/* Generator info */}
        {customer.generator_model && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-2">Generator</h3>
            <div className="space-y-1 text-sm">
              <p><span className="text-muted-foreground">Model:</span> {customer.generator_model}</p>
              {customer.generator_serial && <p><span className="text-muted-foreground">Serial:</span> {customer.generator_serial}</p>}
              {customer.generator_install_date && <p><span className="text-muted-foreground">Installed:</span> {formatDate(customer.generator_install_date)}</p>}
              {customer.service_interval && (customer.last_service_date || customer.generator_install_date) && (() => {
                const intervalMonths = customer.service_interval === "6_months" ? 6 : customer.service_interval === "24_months" ? 24 : 12;
                const lastDate = new Date(customer.last_service_date || customer.generator_install_date);
                const dueDate = new Date(lastDate);
                dueDate.setMonth(dueDate.getMonth() + intervalMonths);
                const daysUntilDue = Math.ceil((dueDate - new Date()) / (1000 * 60 * 60 * 24));
                const isOverdue = daysUntilDue < 0;
                return (
                  <div className={`mt-3 px-3 py-2.5 rounded-xl border ${isOverdue ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-200"}`}>
                    <p className={`text-xs font-semibold ${isOverdue ? "text-red-800" : "text-blue-800"}`}>
                      {isOverdue ? `⚠ Service overdue by ${Math.abs(daysUntilDue)} days` : `Next service due: ${dueDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">Interval: {customer.service_interval.replace(/_/g, " ")}</p>
                  </div>
                );
              })()}
            </div>
          </Card>
        )}

        {customer.referred_by && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground -mt-2 px-1">
            <Users className="w-3 h-3 shrink-0" />
            <span>Referred by: <span className="font-medium text-foreground">{customer.referred_by}</span></span>
          </div>
        )}

        {customer.property_notes && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-1">Property Notes</h3>
            <p className="text-sm text-muted-foreground">{customer.property_notes}</p>
          </Card>
        )}

        {/* Job history */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Job History</h3>
            <Link to={`/jobs/new?customer=${id}`}>
              <Button size="sm" variant="outline" className="rounded-xl text-xs h-8">New Job</Button>
            </Link>
          </div>
          <div className="space-y-2">
            {sortJobs(jobs).map(job => (
              <Link key={job.id} to={`/jobs/${job.id}`}>
                <Card className="p-3 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{job.title}</p>
                      <p className={`text-xs ${isJobOverdue(job) ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>
                        {isClosedJob(job)
                          ? formatDate(job.completed_date || job.scheduled_date || job.created_date)
                          : job.scheduled_date ? formatDate(job.scheduled_date) : "No date set"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isJobOverdue(job) && <StatusBadge status="overdue" />}
                      {job.total_price > 0 && <span className="text-xs font-medium">{formatCurrency(job.total_price)}</span>}
                      <StatusBadge status={job.status} />
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
            {jobs.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No jobs yet</p>}
          </div>
        </div>
      </div>
    </div>
  );
}