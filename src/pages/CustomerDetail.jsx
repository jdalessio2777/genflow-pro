import { useParams, Link, useNavigate } from "react-router-dom";
import { useSwipeBack } from "@/hooks/useSwipeBack";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Pencil, Phone, Mail, MapPin, Wrench, DollarSign, Loader2, Shield, Trash2, ChevronRight, FileText, Users } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import { formatCurrency, formatDate, formatPhone } from "@/lib/utils/format";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  useSwipeBack("/customers");
  const [generatingHistory, setGeneratingHistory] = useState(false);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.Customer.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      navigate("/customers", { replace: true });
    },
    onError: (e) => { toast.error("Failed to delete: " + e.message); },
  });

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const res = await base44.entities.Customer.filter({ id });
      return res[0];
    },
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ["customer-jobs", id],
    queryFn: () => base44.entities.Job.filter({ customer_id: id }, "-created_date"),
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["customer-invoices", id],
    queryFn: () => base44.entities.Invoice.filter({ customer_id: id }),
  });

  if (isLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!customer) return <div className="p-4 text-center">Customer not found</div>;

  const totalRevenue = invoices.filter(i => i.status === "paid").reduce((s, i) => s + (i.total || 0), 0);

  const generateServiceHistory = () => {
    setGeneratingHistory(true);
    try {
      const completedJobs = jobs
        .filter(j => ["completed", "invoiced"].includes(j.status))
        .sort((a, b) => new Date(b.completed_date || b.created_date) - new Date(a.completed_date || a.created_date));

      const jobRows = completedJobs.length === 0
        ? `<tr><td colspan="4" style="padding:20px;text-align:center;color:#888;font-size:13px;">No completed service history</td></tr>`
        : completedJobs.map((job, i) => `
            <tr style="background:${i % 2 === 0 ? "#f8f9fa" : "white"};">
              <td style="padding:10px 12px;font-size:13px;">${formatDate(job.completed_date || job.created_date)}</td>
              <td style="padding:10px 12px;font-size:13px;font-weight:600;">${job.title}</td>
              <td style="padding:10px 12px;font-size:13px;text-align:center;">
                <span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:${job.status === "invoiced" ? "#dcfce7" : "#f0fdf4"};color:#166534;">
                  ${job.status === "invoiced" ? "Invoiced" : "Completed"}
                </span>
              </td>
              <td style="padding:10px 12px;font-size:12px;color:#555;">${job.generator_notes || job.notes || "—"}</td>
            </tr>`).join("");

      const totalJobs = completedJobs.length;
      const firstService = completedJobs.length > 0
        ? formatDate(completedJobs[completedJobs.length - 1].completed_date || completedJobs[completedJobs.length - 1].created_date)
        : "—";
      const lastService = completedJobs.length > 0
        ? formatDate(completedJobs[0].completed_date || completedJobs[0].created_date)
        : "—";

      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Service History — ${customer.name}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #1a1a1a; background: white; padding: 32px; max-width: 800px; margin: 0 auto; }
  @media print { body { padding: 0; } @page { margin: 0.75in; } }
</style>
</head>
<body>
  <div style="background:#1e3a5f;color:white;padding:24px 28px;border-radius:8px;margin-bottom:24px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <h1 style="font-size:20px;font-weight:bold;margin-bottom:3px;">AJ's Generator Service</h1>
        <p style="font-size:12px;color:#a8c4e0;">Professional Generator Service &amp; Maintenance</p>
      </div>
      <div style="text-align:right;">
        <p style="font-size:15px;font-weight:bold;color:#a8c4e0;">SERVICE HISTORY</p>
        <p style="font-size:11px;color:#a8c4e0;margin-top:3px;">Generated ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
      </div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
    <div style="background:#f8f9fa;border-radius:8px;padding:16px;">
      <p style="font-size:10px;font-weight:bold;color:#888;letter-spacing:0.5px;margin-bottom:8px;">CUSTOMER</p>
      <p style="font-size:14px;font-weight:bold;margin-bottom:3px;">${customer.name}</p>
      ${customer.address ? `<p style="font-size:12px;color:#555;margin-bottom:2px;">${customer.address}</p>` : ""}
      ${customer.phone ? `<p style="font-size:12px;color:#555;">${customer.phone}</p>` : ""}
    </div>
    <div style="background:#f8f9fa;border-radius:8px;padding:16px;">
      <p style="font-size:10px;font-weight:bold;color:#888;letter-spacing:0.5px;margin-bottom:8px;">GENERATOR</p>
      <p style="font-size:14px;font-weight:bold;margin-bottom:3px;">${customer.generator_model || "Not specified"}</p>
      ${customer.generator_serial ? `<p style="font-size:12px;color:#555;margin-bottom:2px;">S/N: ${customer.generator_serial}</p>` : ""}
      ${customer.generator_install_date ? `<p style="font-size:12px;color:#555;">Installed: ${formatDate(customer.generator_install_date)}</p>` : ""}
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px;">
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px;text-align:center;">
      <p style="font-size:22px;font-weight:bold;color:#1e40af;">${totalJobs}</p>
      <p style="font-size:11px;color:#3b82f6;margin-top:2px;">Total Service Visits</p>
    </div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;text-align:center;">
      <p style="font-size:13px;font-weight:bold;color:#166534;">${firstService}</p>
      <p style="font-size:11px;color:#22c55e;margin-top:2px;">First Service</p>
    </div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;text-align:center;">
      <p style="font-size:13px;font-weight:bold;color:#166534;">${lastService}</p>
      <p style="font-size:11px;color:#22c55e;margin-top:2px;">Most Recent</p>
    </div>
  </div>
  <p style="font-size:13px;font-weight:bold;color:#1e3a5f;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;">Service Records</p>
  <table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr style="background:#1e3a5f;color:white;">
        <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;width:120px;">Date</th>
        <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;">Service</th>
        <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;width:100px;">Status</th>
        <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;">Notes</th>
      </tr>
    </thead>
    <tbody>${jobRows}</tbody>
  </table>
  <div style="margin-top:32px;text-align:center;border-top:1px solid #e5e7eb;padding-top:16px;">
    <p style="font-size:11px;color:#aaa;">AJ's Generator Service · This document is a record of service visits performed by AJ's Generator Service</p>
  </div>
</body>
</html>`;

      const win = window.open("", "_blank");
      if (win) {
        win.document.write(html);
        win.document.close();
        setTimeout(() => win.print(), 500);
      }
    } finally {
      setGeneratingHistory(false);
    }
  };
  const lastJob = jobs.filter(j => j.status === "completed" || j.status === "invoiced")
    .sort((a, b) => new Date(b.completed_date || b.created_date) - new Date(a.completed_date || a.created_date))[0];

  return (
    <div>
      <PageHeader
        title={customer.name}
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
              History
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
                <Shield className="w-3.5 h-3.5" />
                {customer?.membership_plan && customer?.membership_signed ? "Member" : "Agreement"}
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
            <a href={`tel:${customer.phone}`} className="flex-1">
              <Card className="p-3 text-center hover:bg-muted/50 transition-colors">
                <Phone className="w-5 h-5 mx-auto text-primary mb-1" />
                <p className="text-xs font-medium">{formatPhone(customer.phone)}</p>
              </Card>
            </a>
          )}
          {customer.email && (
            <a href={`mailto:${customer.email}`} className="flex-1">
              <Card className="p-3 text-center hover:bg-muted/50 transition-colors">
                <Mail className="w-5 h-5 mx-auto text-primary mb-1" />
                <p className="text-xs font-medium truncate">{customer.email}</p>
              </Card>
            </a>
          )}
          {customer.address && (
            <a href={`https://maps.google.com/?q=${encodeURIComponent(customer.address)}`} target="_blank" rel="noopener noreferrer" className="flex-1">
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
                    10% off all services · Expires {formatDate(customer.membership_expiry)}
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
                    <p className="text-xs text-blue-700 mt-0.5">Annual $340 · Semi-Annual $595 · 10% off all services</p>
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
            {jobs.map(job => (
              <Link key={job.id} to={`/jobs/${job.id}`}>
                <Card className="p-3 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{job.title}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(job.scheduled_date || job.created_date)}</p>
                    </div>
                    <div className="flex items-center gap-2">
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