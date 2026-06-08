import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { supabase } from "@/lib/supabaseClient";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Phone, Plus, CheckCircle2, ChevronDown, ChevronUp, UserPlus, PhoneCall, X } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import { toast } from "sonner";

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

const SOURCE_LABELS = {
  website_form: "Website Form",
  nextiva_voicemail: "Voicemail",
};

const SOURCE_COLORS = {
  website_form: "bg-blue-100 text-blue-700",
  nextiva_voicemail: "bg-purple-100 text-purple-700",
};

export default function Inbox() {
  const [activeTab, setActiveTab] = useState("service_due");
  const [expandedLeads, setExpandedLeads] = useState(new Set());
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => db.Customer.list("name"),
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ["jobs"],
    queryFn: () => db.Job.list("-created_date", 200),
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

  const { data: leads = [] } = useQuery({
    queryKey: ["service-requests-inbox"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_requests")
        .select("*")
        .in("status", ["new", "contacted"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60000,
  });

  const updateLeadMutation = useMutation({
    mutationFn: async ({ id, updates }) => {
      const { error } = await supabase.from("service_requests").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-requests-inbox"] });
      queryClient.invalidateQueries({ queryKey: ["service-requests-count"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const markContacted = (id) => {
    try {
      updateLeadMutation.mutate({ id, updates: { status: "contacted", contacted_at: new Date().toISOString() } });
      toast.success("Marked as contacted");
    } catch (err) {
      toast.error(err.message);
    }
  };

  const dismissLead = (id) => {
    try {
      updateLeadMutation.mutate({ id, updates: { status: "dismissed" } });
      toast.success("Lead dismissed");
    } catch (err) {
      toast.error(err.message);
    }
  };

  const createCustomer = (lead) => {
    const params = new URLSearchParams();
    if (lead.name) params.set("name", lead.name);
    if (lead.phone) params.set("phone", lead.phone);
    if (lead.email) params.set("email", lead.email);
    navigate(`/customers/new?${params.toString()}`);
  };

  const toggleExpand = (id) => {
    setExpandedLeads(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const newLeadsCount = leads.filter(l => l.status === "new").length;

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

  const LeadCard = ({ lead }) => {
    const expanded = expandedLeads.has(lead.id);
    const isNew = lead.status === "new";
    return (
      <Card className={`p-3.5 ${isNew ? "border-orange-200" : "border-border"}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="text-sm font-semibold">{lead.name || "Unknown"}</p>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${SOURCE_COLORS[lead.source] || "bg-gray-100 text-gray-700"}`}>
                {SOURCE_LABELS[lead.source] || lead.source}
              </span>
              {isNew && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 text-red-700">NEW</span>
              )}
            </div>
            {lead.phone && <p className="text-xs text-muted-foreground">{lead.phone}</p>}
            {lead.email && <p className="text-xs text-muted-foreground">{lead.email}</p>}
            {lead.service_type && <p className="text-xs text-muted-foreground mt-0.5">Service: {lead.service_type}</p>}
            <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(lead.created_at)}</p>
          </div>
          <button onClick={() => toggleExpand(lead.id)} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {expanded && (
          <div className="mt-3 space-y-3 border-t pt-3">
            {(lead.message || lead.voicemail_transcription) && (
              <div className="bg-muted/50 rounded-xl p-2.5">
                <p className="text-xs font-semibold mb-1 text-muted-foreground">
                  {lead.voicemail_transcription ? "Voicemail Transcript" : "Message"}
                </p>
                <p className="text-xs text-foreground">{lead.voicemail_transcription || lead.message}</p>
              </div>
            )}
            {lead.generator_info && (
              <p className="text-xs text-muted-foreground">Generator: {lead.generator_info}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="h-8 rounded-xl gap-1.5 text-xs" onClick={() => createCustomer(lead)}>
                <UserPlus className="w-3.5 h-3.5" /> Create Customer
              </Button>
              {isNew && (
                <Button size="sm" variant="outline" className="h-8 rounded-xl gap-1.5 text-xs" onClick={() => markContacted(lead.id)}>
                  <PhoneCall className="w-3.5 h-3.5" /> Mark Contacted
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-xl gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => dismissLead(lead.id)}
              >
                <X className="w-3.5 h-3.5" /> Dismiss
              </Button>
            </div>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div>
      <PageHeader
        title="Inbox"
        subtitle={activeTab === "service_due"
          ? `${callList.length} customer${callList.length !== 1 ? "s" : ""} to reach out to`
          : `${leads.length} lead${leads.length !== 1 ? "s" : ""}`}
        back="/"
      />

      <div className="px-4 pt-3">
        <div className="flex gap-1 bg-muted/50 p-1 rounded-xl max-w-lg mx-auto">
          <button
            className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-all ${activeTab === "service_due" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
            onClick={() => setActiveTab("service_due")}
          >
            Service Due
          </button>
          <button
            className={`flex-1 text-xs font-semibold py-2 rounded-lg transition-all relative ${activeTab === "new_leads" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
            onClick={() => setActiveTab("new_leads")}
          >
            New Leads
            {newLeadsCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                {newLeadsCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="px-4 pt-3 pb-4 space-y-5 max-w-lg mx-auto">
        {activeTab === "service_due" && (
          <>
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
          </>
        )}

        {activeTab === "new_leads" && (
          <>
            {leads.length === 0 ? (
              <Card className="p-8 text-center">
                <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <p className="text-sm font-semibold">No new leads</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[220px] mx-auto">
                  New leads from the website form and Nextiva voicemails will appear here
                </p>
              </Card>
            ) : (
              <div className="space-y-2">
                {leads.map(lead => <LeadCard key={lead.id} lead={lead} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
