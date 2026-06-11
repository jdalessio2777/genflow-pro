import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { integrationsCore } from "@/lib/coreIntegrations";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { DollarSign, Wrench, Users, Plus, AlertTriangle, CheckCircle2, FileText, Package, Navigation, Shield, StickyNote, Gift, Settings as SettingsIcon, Mail, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils/format";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";

function MembershipReminderCard({ c }) {
  const days = Math.ceil((new Date(c.membership_expiry) - new Date()) / (1000 * 60 * 60 * 24));
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const sendRenewalReminder = async () => {
    if (!c.email) { toast.error("No email on file for " + c.name); return; }
    setSending(true);
    try {
      const planName = c.membership_plan === "semi_annual" ? "Semi-Annual Protection Plan ($595/yr)" : "Annual Protection Plan ($340/yr)";
      const expiryStr = new Date(c.membership_expiry).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      await integrationsCore.SendEmail({
        to: c.email,
        subject: `Your Generator Protection Plan expires ${expiryStr}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><div style="background:#1e3a5f;padding:22px 24px;border-radius:8px 8px 0 0;"><h1 style="color:white;margin:0;font-size:18px;">AJ's Generator Service</h1><p style="color:#a8c4e0;margin:3px 0 0 0;font-size:12px;">Protection Plan Renewal</p></div><div style="background:#f8f9fa;padding:22px 24px;border-radius:0 0 8px 8px;"><p style="font-size:14px;color:#1a1a1a;">Hi ${c.name},</p><p style="font-size:13px;color:#444;margin-top:8px;">Your <strong>${planName}</strong> is expiring on <strong>${expiryStr}</strong>${days > 0 ? ` — ${days} day${days !== 1 ? "s" : ""} from now` : " — today"}.</p><div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin:14px 0;"><p style="margin:0 0 8px 0;font-size:13px;font-weight:bold;color:#1e3a5f;">Your Plan Includes:</p><ul style="margin:0;padding-left:18px;font-size:13px;color:#444;"><li style="margin-bottom:4px;">Annual maintenance visit${c.membership_plan === "semi_annual" ? "s (2x per year)" : ""}</li><li style="margin-bottom:4px;">10% discount on all parts and labor</li><li>Priority scheduling</li></ul></div><p style="font-size:13px;color:#444;">To renew, simply reply to this email or give us a call.</p><p style="font-size:12px;color:#666;margin-top:16px;">Thank you for being a valued AJ's Generator Service customer.</p></div></div>`,
      });
      setSent(true);
      toast.success(`Renewal reminder sent to ${c.name}`);
    } catch (e) {
      toast.error("Failed to send email");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className={`p-3 ${days <= 0 ? "border-red-200 bg-red-50/50" : days <= 14 ? "border-amber-200 bg-amber-50/50" : "border-blue-200 bg-blue-50/50"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link to={`/customers/${c.id}`}>
            <p className="text-sm font-semibold truncate">{c.name}</p>
          </Link>
          <p className="text-xs text-muted-foreground">
            {days <= 0 ? `Expired ${Math.abs(days)}d ago` : `Expires in ${days}d`}
            {" · "}{c.membership_plan === "semi_annual" ? "Semi-Annual" : "Annual"}
          </p>
        </div>
        <button
          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-colors shrink-0 ${sent ? "border-green-300 text-green-700 bg-green-50" : "border-border bg-background hover:bg-muted"}`}
          onClick={sendRenewalReminder}
          disabled={sending || sent || !c.email}
        >
          {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : sent ? <CheckCircle2 className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
          {sent ? "Sent" : "Remind"}
        </button>
      </div>
    </Card>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="space-y-2">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-xl font-bold leading-none">{value}</p>
        <p className="text-xs text-muted-foreground font-medium mt-1">{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: jobs = [] } = useQuery({
    queryKey: ["jobs"],
    queryFn: () => db.Job.list("-created_date", 100),
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => db.Invoice.list("-created_date", 100),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => db.Customer.list("-created_date"),
  });

  const { data: allCustomers = [] } = useQuery({
    queryKey: ["all-customers-svc"],
    queryFn: () => db.Customer.list("name"),
  });

  const { data: parts = [] } = useQuery({
    queryKey: ["parts-catalog"],
    queryFn: () => db.Part.list("name"),
  });
  const lowStockParts = parts.filter(p =>
    (p.in_stock !== undefined && p.in_stock !== null && p.in_stock <= 2) || p.reorder_flagged
  );

  function getServiceStatus(customer) {
    if (!customer.service_interval) return null;
    const intervalMonths = customer.service_interval === "6_months" ? 6 : customer.service_interval === "24_months" ? 24 : 12;
    const lastService = customer.last_service_date || customer.generator_install_date;
    if (!lastService) return null;
    const dueDate = new Date(lastService);
    dueDate.setMonth(dueDate.getMonth() + intervalMonths);
    const daysUntilDue = Math.ceil((dueDate - new Date()) / (1000 * 60 * 60 * 24));
    if (daysUntilDue <= 30) return { daysUntilDue, dueDate };
    return null;
  }

  const expiringMemberships = allCustomers.filter(c => {
    if (!c.membership_plan || !c.membership_signed || !c.membership_expiry) return false;
    const daysUntilExpiry = Math.ceil((new Date(c.membership_expiry) - new Date()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
  });

  const serviceDueCustomers = allCustomers
    .map(c => ({ ...c, _svc: getServiceStatus(c) }))
    .filter(c => c._svc !== null)
    .sort((a, b) => a._svc.daysUntilDue - b._svc.daysUntilDue)
    .slice(0, 5);

  const today = new Date().toDateString();
  const todayJobs = jobs.filter(j => {
    if (!j.scheduled_date) return false;
    return new Date(j.scheduled_date).toDateString() === today && ["scheduled", "dispatched", "on_site", "in_progress"].includes(j.status);
  }).sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));

  const activeJobs = jobs.filter(j => ["scheduled", "dispatched", "on_site", "in_progress"].includes(j.status));
  const completedJobs = jobs.filter(j => j.status === "completed" || j.status === "invoiced");
  const totalRevenue = invoices.filter(i => i.status === "paid").reduce((s, i) => s + (i.total || 0), 0);
  const totalProfit = completedJobs.reduce((s, j) => s + (j.profit || 0), 0);
  const unpaidInvoices = invoices.filter(i => i.status !== "paid" && i.status !== "draft");

  const [alertsOpen, setAlertsOpen] = useState(false);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const now = new Date();
  const thisMonthRevenue = invoices
    .filter(i => i.status === "paid" && i.paid_date &&
      new Date(i.paid_date).getMonth() === now.getMonth() &&
      new Date(i.paid_date).getFullYear() === now.getFullYear())
    .reduce((s, i) => s + (i.total || 0), 0);

  const referralSummary = Object.entries(
    allCustomers
      .filter(c => c.referred_by?.trim())
      .reduce((acc, c) => {
        const key = c.referred_by.trim();
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {})
  ).map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  return (
    <div>
      {/* Hero header */}
      <div className="bg-gradient-to-br from-primary to-blue-700 px-5 pt-6 pb-8">
        <div className="max-w-lg mx-auto">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-blue-200 text-sm font-medium">
                {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </p>
              <h1 className="text-white text-2xl font-bold mt-0.5">{greeting}, Jeremy</h1>
              <p className="text-blue-200/80 text-sm mt-0.5">Here's what's happening today.</p>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/settings">
                <button className="bg-white/10 hover:bg-white/20 active:bg-white/30 text-white border border-white/20 rounded-xl p-2 transition-colors backdrop-blur-sm">
                  <SettingsIcon className="w-4 h-4" />
                </button>
              </Link>
              <Link to="/jobs/new">
                <button className="bg-white/20 hover:bg-white/30 active:bg-white/40 text-white border border-white/20 rounded-xl px-3 py-2 text-sm font-semibold flex items-center gap-1.5 transition-colors backdrop-blur-sm">
                  <Plus className="w-4 h-4" /> New Job
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Stats card overlapping gradient */}
      <div className="px-4 -mt-5 mb-1 max-w-lg mx-auto">
        <div className="bg-card rounded-2xl shadow-lg shadow-black/8 border border-border/50 p-4 grid grid-cols-2 gap-4">
          <StatCard icon={Wrench} label="Active Jobs" value={activeJobs.length} color="bg-amber-100 text-amber-700" />
          <StatCard icon={DollarSign} label="This Month" value={formatCurrency(thisMonthRevenue)} color="bg-green-100 text-green-700" />
          <StatCard icon={Users} label="Customers" value={customers.length} color="bg-purple-100 text-purple-700" />
          <StatCard icon={FileText} label="Unpaid" value={unpaidInvoices.length} color={unpaidInvoices.length > 0 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"} />
        </div>
      </div>

      <div className="px-4 pb-4 space-y-5 max-w-lg mx-auto mt-4">

        {/* Today's jobs */}
        {todayJobs.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
                Today — {todayJobs.length} job{todayJobs.length > 1 ? "s" : ""}
              </p>
            </div>
            <div className="space-y-2">
              {todayJobs.map(job => (
                <Link key={job.id} to={`/jobs/${job.id}`}>
                  <div className="bg-card border border-primary/20 rounded-2xl p-3.5 hover:border-primary/40 hover:shadow-sm transition-all active:scale-[0.99]">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{job.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{job.customer_name}</p>
                        {job.estimated_duration && <p className="text-xs text-primary/70 mt-0.5">Est. {job.estimated_duration}h</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-medium text-primary">
                          {new Date(job.scheduled_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <StatusBadge status={job.status} />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Service due soon */}
        {serviceDueCustomers.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                Service Due Soon
              </p>
              <Link to="/customers" className="text-xs text-primary font-medium">View all</Link>
            </div>
            <div className="space-y-2">
              {serviceDueCustomers.map(c => {
                const { daysUntilDue } = c._svc;
                const isOverdue = daysUntilDue < 0;
                return (
                  <Link key={c.id} to={`/customers/${c.id}`}>
                    <div className={`rounded-2xl border p-3.5 hover:opacity-80 transition-all active:scale-[0.99] ${isOverdue ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.generator_model || "Generator"}</p>
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-lg shrink-0 ml-2 ${isOverdue ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                          {isOverdue ? `${Math.abs(daysUntilDue)}d overdue` : daysUntilDue === 0 ? "Due today" : `Due in ${daysUntilDue}d`}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Active jobs */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Active Jobs</p>
            <Link to="/jobs" className="text-xs text-primary font-medium">View all</Link>
          </div>
          {activeJobs.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Nothing active right now"
              subtitle="All quiet — dispatch a job when you're ready"
              className="py-10"
            />
          ) : (
            <div className="space-y-2">
              {activeJobs.slice(0, 5).map(job => (
                <Link key={job.id} to={`/jobs/${job.id}`}>
                  <div className="bg-card border border-border rounded-2xl p-3.5 card-lift hover:border-primary/30">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{job.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{job.customer_name}</p>
                      </div>
                      <StatusBadge status={job.status} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2.5">Quick Actions</p>
          <div className="grid grid-cols-2 gap-2.5">
            <Link to="/customers/new">
              <div className="h-14 flex items-center gap-3 px-3.5 rounded-2xl bg-emerald-50 border border-emerald-200/60 hover:bg-emerald-100/60 transition-colors active:scale-[0.99]">
                <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4 text-emerald-600" />
                </div>
                <p className="text-sm font-semibold text-emerald-900">New Customer</p>
              </div>
            </Link>
            <Link to="/route">
              <div className="h-14 flex items-center gap-3 px-3.5 rounded-2xl bg-amber-50 border border-amber-200/60 hover:bg-amber-100/60 transition-colors active:scale-[0.99]">
                <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                  <Navigation className="w-4 h-4 text-amber-600" />
                </div>
                <p className="text-sm font-semibold text-amber-900">Today's Route</p>
              </div>
            </Link>
            <Link to="/invoices">
              <div className="h-14 flex items-center gap-3 px-3.5 rounded-2xl bg-slate-50 border border-slate-200/60 hover:bg-slate-100/60 transition-colors active:scale-[0.99]">
                <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-slate-600" />
                </div>
                <p className="text-sm font-semibold text-slate-800">Invoices</p>
              </div>
            </Link>
            <Link to="/finance">
              <div className="h-14 flex items-center gap-3 px-3.5 rounded-2xl bg-green-50 border border-green-200/60 hover:bg-green-100/60 transition-colors active:scale-[0.99]">
                <div className="w-8 h-8 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
                  <DollarSign className="w-4 h-4 text-green-600" />
                </div>
                <p className="text-sm font-semibold text-green-900">Finance</p>
              </div>
            </Link>
            <Link to="/documents">
              <div className="h-14 flex items-center gap-3 px-3.5 rounded-2xl bg-orange-50 border border-orange-200/60 hover:bg-orange-100/60 transition-colors active:scale-[0.99]">
                <div className="w-8 h-8 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-orange-600" />
                </div>
                <p className="text-sm font-semibold text-orange-900">Documents</p>
              </div>
            </Link>
            <Link to="/referrals">
              <div className="h-14 flex items-center gap-3 px-3.5 rounded-2xl bg-rose-50 border border-rose-200/60 hover:bg-rose-100/60 transition-colors active:scale-[0.99]">
                <div className="w-8 h-8 bg-rose-100 rounded-xl flex items-center justify-center shrink-0">
                  <Gift className="w-4 h-4 text-rose-600" />
                </div>
                <p className="text-sm font-semibold text-rose-900">Referrals</p>
              </div>
            </Link>
          </div>
        </div>

        {/* Collapsible Alerts */}
        {(lowStockParts.length > 0 || expiringMemberships.length > 0 || unpaidInvoices.length > 0 || referralSummary.length >= 2) && (
          <div>
            <button
              onClick={() => setAlertsOpen(v => !v)}
              className="w-full flex items-center justify-between py-2 group"
            >
              <div className="flex items-center gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Alerts & Insights</p>
                {(lowStockParts.length > 0 || expiringMemberships.length > 0 || unpaidInvoices.length > 0) && (
                  <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none">
                    {lowStockParts.length + expiringMemberships.length + unpaidInvoices.length}
                  </span>
                )}
              </div>
              {alertsOpen
                ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>

            {alertsOpen && (
              <div className="space-y-3 tab-fade">
                {unpaidInvoices.length > 0 && (
                  <Link to="/invoices">
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 hover:opacity-80 transition-all">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span className="text-sm font-semibold text-amber-800">
                          {unpaidInvoices.length} Unpaid Invoice{unpaidInvoices.length > 1 ? "s" : ""}
                        </span>
                      </div>
                      <p className="text-xs text-amber-700">
                        {formatCurrency(unpaidInvoices.reduce((s, i) => s + (i.total || 0), 0))} outstanding
                      </p>
                    </div>
                  </Link>
                )}

                {lowStockParts.length > 0 && (
                  <Link to="/catalog">
                    <div className="rounded-2xl border border-orange-200 bg-orange-50 p-3.5 hover:opacity-80 transition-all">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-orange-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-orange-800">
                            {lowStockParts.filter(p => p.in_stock <= 0).length > 0
                              ? `${lowStockParts.filter(p => p.in_stock <= 0).length} part${lowStockParts.filter(p => p.in_stock <= 0).length > 1 ? "s" : ""} out of stock`
                              : `${lowStockParts.length} part${lowStockParts.length > 1 ? "s" : ""} running low`}
                          </p>
                          <p className="text-xs text-orange-700 truncate">
                            {lowStockParts.slice(0, 2).map(p => p.name).join(", ")}
                            {lowStockParts.length > 2 ? ` +${lowStockParts.length - 2} more` : ""}
                          </p>
                        </div>
                      </div>
                    </div>
                  </Link>
                )}

                {expiringMemberships.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-blue-500" />
                      Agreements Expiring Soon
                    </p>
                    <div className="space-y-2">
                      {expiringMemberships.map(c => (
                        <MembershipReminderCard key={c.id} c={c} />
                      ))}
                    </div>
                  </div>
                )}

                {referralSummary.length >= 2 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-primary" />
                      How Customers Find Us
                    </p>
                    <Card className="p-3">
                      <div className="space-y-2">
                        {referralSummary.slice(0, 5).map(({ source, count }) => {
                          const maxCount = referralSummary[0].count;
                          const width = Math.max((count / maxCount) * 100, 8);
                          return (
                            <div key={source} className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground truncate w-28 shrink-0">{source}</span>
                              <div className="flex-1 h-4 bg-muted/40 rounded-lg overflow-hidden">
                                <div className="h-full bg-primary/60 rounded-lg" style={{ width: `${width}%` }} />
                              </div>
                              <span className="text-xs font-semibold w-6 text-right shrink-0">{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}