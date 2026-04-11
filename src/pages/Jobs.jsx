import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { getUserDisplayName } from "@/lib/userColors";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Wrench, Calendar, Search, CheckCircle2, Trash2 } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import { formatCurrency, formatDateTime, formatDate } from "@/lib/utils/format";
import { toast } from "sonner";

export default function Jobs() {
  const [filter, setFilter] = useState("active");
  const [search, setSearch] = useState("");
  const [techFilter, setTechFilter] = useState("all");
  const { user } = useAuth();

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["jobs"],
    queryFn: () => base44.entities.Job.list("-created_date", 200),
  });

  const queryClient = useQueryClient();

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list("name"),
  });
  const customerMap = Object.fromEntries(customers.map(c => [c.id, c]));

  const deleteMutation = useMutation({
    mutationFn: async (jobId) => {
      const [parts, labor, docs, photos] = await Promise.all([
        base44.entities.JobPart.filter({ job_id: jobId }),
        base44.entities.JobLabor.filter({ job_id: jobId }),
        base44.entities.JobDocument.filter({ job_id: jobId }),
        base44.entities.JobPhoto.filter({ job_id: jobId }),
      ]);
      await Promise.all([
        ...parts.map(r => base44.entities.JobPart.delete(r.id)),
        ...labor.map(r => base44.entities.JobLabor.delete(r.id)),
        ...docs.map(r => base44.entities.JobDocument.delete(r.id)),
        ...photos.map(r => base44.entities.JobPhoto.delete(r.id)),
      ]);
      return base44.entities.Job.delete(jobId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("Job deleted");
    },
    onError: (e) => toast.error("Failed to delete: " + e.message),
  });

  const filtered = jobs.filter(j => {
    if (filter === "active") return ["quote", "quote_sent", "scheduled", "dispatched", "on_site", "in_progress"].includes(j.status);
    if (filter === "completed") {
      const isCompleted = j.status === "completed" || j.status === "invoiced";
      if (!isCompleted) return false;
      if (!search) return true;
      return (
        j.title?.toLowerCase().includes(search.toLowerCase()) ||
        j.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
        j.job_type?.toLowerCase().includes(search.toLowerCase())
      );
    }
    if (filter === "canceled") return j.status === "canceled";
    return true;
  });

  const sortedFiltered = filter === "completed"
    ? [...filtered].sort((a, b) => new Date(b.completed_date || b.created_date) - new Date(a.completed_date || a.created_date))
    : filtered;

  const techFiltered = techFilter === "mine"
    ? sortedFiltered.filter(j => !j.assigned_to_name || j.assigned_to_name === getUserDisplayName(user)?.split(" ")[0])
    : sortedFiltered;

  const completedCount = jobs.filter(j => j.status === "completed" || j.status === "invoiced").length;

  return (
    <div>
      <PageHeader
        title="Jobs"
        subtitle={`${jobs.length} total`}
        actions={
          <Link to="/jobs/new">
            <Button size="sm" className="rounded-xl gap-1.5">
              <Plus className="w-4 h-4" /> New
            </Button>
          </Link>
        }
      />

      <div className="px-4 pt-3 pb-4 space-y-3 max-w-lg mx-auto">
        <Tabs value={filter} onValueChange={v => { setFilter(v); setSearch(""); }}>
          <TabsList className="w-full grid grid-cols-3 bg-muted/60 rounded-xl p-0.5">
            <TabsTrigger value="active" className="text-xs rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Active</TabsTrigger>
            <TabsTrigger value="completed" className="text-xs rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">
              History{completedCount > 0 ? ` (${completedCount})` : ""}
            </TabsTrigger>
            <TabsTrigger value="canceled" className="text-xs rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">Canceled</TabsTrigger>
          </TabsList>
        </Tabs>

        {filter === "completed" && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search history..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 rounded-xl" />
          </div>
        )}

        {filter === "active" && (
          <div className="flex items-center gap-2">
            {["all", "mine"].map(f => (
              <button
                key={f}
                onClick={() => setTechFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  techFilter === f ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                }`}
              >
                {f === "all" ? "All Jobs" : "My Jobs"}
              </button>
            ))}
          </div>
        )}

        {filter === "completed" && sortedFiltered.length > 0 && (
          <Card className="p-3 bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
            <div className="flex items-center justify-between text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{search ? "Matching" : "Completed"} Jobs</p>
                <p className="font-bold text-lg">{sortedFiltered.length}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total Revenue</p>
                <p className="font-bold text-lg text-primary">{formatCurrency(sortedFiltered.reduce((s, j) => s + (j.total_price || 0), 0))}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total Profit</p>
                <p className="font-bold text-lg text-green-600">{formatCurrency(sortedFiltered.reduce((s, j) => s + (j.profit || 0), 0))}</p>
              </div>
            </div>
          </Card>
        )}

        {techFiltered.length === 0 && !isLoading ? (
          <EmptyState
            icon={Wrench}
            title={`No ${filter} jobs`}
            description="Create a new job to get started"
          />
        ) : (
          <div className="space-y-2">
            {techFiltered.map(job => (
              filter === "completed" ? (
                <div key={job.id} className="relative">
                  <Link to={`/jobs/${job.id}`}>
                    <div className="bg-card border border-border rounded-2xl p-3.5 hover:border-primary/20 hover:shadow-sm transition-all duration-150 active:scale-[0.99] pr-10">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate">{job.title}</p>
                          <p className="text-xs text-primary font-medium">{job.customer_name}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <StatusBadge status={job.job_type} />
                            <StatusBadge status={job.status} />
                          </div>
                          {job.completed_date && (
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-green-600" />
                              Completed {formatDate(job.completed_date)}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          {job.total_price > 0 && <p className="text-base font-bold">{formatCurrency(job.total_price)}</p>}
                          {job.profit > 0 && <p className="text-xs text-green-600 font-medium">{formatCurrency(job.profit)} profit</p>}
                        </div>
                      </div>
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
                        <AlertDialogTitle>Delete "{job.title}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Permanently deletes this job and all associated parts, labor, documents, and photos. Cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate(job.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ) : (
                <div key={job.id} className="relative">
                  <Link to={`/jobs/${job.id}`}>
                    <div className="bg-card border border-border rounded-2xl p-3.5 hover:border-primary/20 hover:shadow-sm transition-all duration-150 active:scale-[0.99] pr-10">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{job.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{job.customer_name}</p>
                          {job.scheduled_date && (
                            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                              <Calendar className="w-3 h-3" />
                              {formatDateTime(job.scheduled_date)}
                            </div>
                          )}
                          {customerMap[job.customer_id]?.property_notes && (
                            <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                              <span>⚠</span>
                              <span className="truncate">{customerMap[job.customer_id].property_notes}</span>
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <StatusBadge status={job.status} />
                          <StatusBadge status={job.job_type} />
                          {job.assigned_to_name && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                              job.assigned_to_name === "Jeremy" ? "bg-blue-100 text-blue-700"
                                                          : job.assigned_to_name === "Derek" ? "bg-red-100 text-red-700"
                                                          : job.assigned_to_name === "Sean" ? "bg-purple-100 text-purple-700"
                                                          : "bg-green-100 text-green-700"
                            }`}>
                              {job.assigned_to_name}
                            </span>
                          )}
                          {job.total_price > 0 && <span className="text-xs font-semibold">{formatCurrency(job.total_price)}</span>}
                        </div>
                      </div>
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
                        <AlertDialogTitle>Delete "{job.title}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Permanently deletes this job and all associated parts, labor, documents, and photos. Cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate(job.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )
            ))}
          </div>
        )}
      </div>
    </div>
  );
}