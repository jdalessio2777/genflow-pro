import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";
import { getUserDisplayName } from "@/lib/userColors";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import StatusBadge from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";

const STATUS_COLORS = {
  quote: "bg-violet-400",
  quote_sent: "bg-sky-400",
  scheduled: "bg-blue-500",
  dispatched: "bg-cyan-500",
  on_site: "bg-amber-500",
  in_progress: "bg-amber-500",
  completed: "bg-green-500",
  invoiced: "bg-emerald-500",
};

export default function Schedule() {
  const [view, setView] = useState("month");
  const [current, setCurrent] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [techFilter, setTechFilter] = useState("all");
  const { user } = useAuth();


  const { data: jobs = [] } = useQuery({
    queryKey: ["jobs"],
    queryFn: () => db.Job.list("-created_date", 200),
  });

  const scheduledJobs = jobs.filter(j =>
    j.scheduled_date &&
    ["quote", "quote_sent", "scheduled", "in_progress", "completed"].includes(j.status)
  );

  const prev = () => {
    const d = new Date(current);
    view === "month" ? d.setMonth(d.getMonth() - 1) : d.setDate(d.getDate() - 7);
    setCurrent(d);
  };
  const next = () => {
    const d = new Date(current);
    view === "month" ? d.setMonth(d.getMonth() + 1) : d.setDate(d.getDate() + 7);
    setCurrent(d);
  };
  const goToday = () => setCurrent(new Date());

  const getMonthDays = () => {
    const year = current.getFullYear();
    const month = current.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = firstDay.getDay();
    const days = [];
    for (let i = 0; i < startPad; i++) {
      days.push({ date: new Date(year, month, -startPad + i + 1), inMonth: false });
    }
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({ date: new Date(year, month, i), inMonth: true });
    }
    while (days.length % 7 !== 0) {
      days.push({ date: new Date(year, month + 1, days.length - lastDay.getDate() - startPad + 1), inMonth: false });
    }
    return days;
  };

  const getWeekDays = () => {
    const start = new Date(current);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  };

  const getJobsForDate = (date) => {
    const dateStr = date.toDateString();
    return scheduledJobs.filter(j => new Date(j.scheduled_date).toDateString() === dateStr);
  };

  const isToday = (date) => date.toDateString() === new Date().toDateString();

  const monthLabel = current.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const weekDays = getWeekDays();
  const weekLabel = `${weekDays[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekDays[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  const rawSelectedJobs = selectedDate ? getJobsForDate(selectedDate) : [];
  const selectedJobs = techFilter === "mine"
    ? rawSelectedJobs.filter(j => !j.assigned_to_name || j.assigned_to_name === getUserDisplayName(user)?.split(" ")[0])
    : rawSelectedJobs;

  return (
    <div>
      <PageHeader
        title="Schedule"
        subtitle={view === "month" ? monthLabel : weekLabel}
        actions={
          <Link to="/jobs/new">
            <Button size="sm" className="rounded-xl gap-1.5">
              <Plus className="w-4 h-4" /> New
            </Button>
          </Link>
        }
      />

      <div className="px-4 pt-3 space-y-3 max-w-lg mx-auto">
        {/* Tech filter */}
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

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={prev}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={next}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl h-9 ml-1 text-xs" onClick={goToday}>
              Today
            </Button>
          </div>
          <div className="flex items-center gap-1 bg-muted/60 rounded-xl p-1">
            <button onClick={() => setView("month")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${view === "month" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>Month</button>
            <button onClick={() => setView("week")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${view === "week" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>Week</button>
          </div>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-px">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
            <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground py-1">{d}</div>
          ))}
        </div>

        {/* Month view */}
        {view === "month" && (
          <div className="grid grid-cols-7 gap-px bg-border rounded-2xl overflow-hidden border border-border">
            {getMonthDays().map(({ date, inMonth }, i) => {
              const dayJobs = getJobsForDate(date);
              const isSelected = selectedDate?.toDateString() === date.toDateString();
              return (
                <button key={i} onClick={() => setSelectedDate(isSelected ? null : date)}
                  className={`min-h-[52px] p-1.5 flex flex-col items-center gap-0.5 transition-colors
                    ${!inMonth ? "bg-muted/30" : "bg-card"}
                    ${isSelected ? "bg-primary/10" : ""}
                    ${isToday(date) ? "ring-1 ring-inset ring-primary" : ""}`}>
                  <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full
                    ${isToday(date) ? "bg-primary text-white" : inMonth ? "text-foreground" : "text-muted-foreground/50"}`}>
                    {date.getDate()}
                  </span>
                  <div className="flex flex-wrap gap-0.5 justify-center">
                    {dayJobs.slice(0, 3).map((job, ji) => (
                      <span key={ji} className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[job.status] || "bg-gray-400"}`} />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Week view */}
        {view === "week" && (
          <div className="grid grid-cols-7 gap-1">
            {getWeekDays().map((date, i) => {
              const dayJobs = getJobsForDate(date);
              const isSelected = selectedDate?.toDateString() === date.toDateString();
              return (
                <button key={i} onClick={() => setSelectedDate(isSelected ? null : date)}
                  className={`rounded-2xl border p-2 flex flex-col items-center gap-1 transition-colors min-h-[80px]
                    ${isSelected ? "border-primary bg-primary/5" : "border-border bg-card"}
                    ${isToday(date) ? "border-primary" : ""}`}>
                  <span className={`text-[11px] font-semibold w-7 h-7 flex items-center justify-center rounded-full
                    ${isToday(date) ? "bg-primary text-white" : "text-foreground"}`}>
                    {date.getDate()}
                  </span>
                  <div className="flex flex-col gap-0.5 w-full">
                    {dayJobs.slice(0, 3).map((job, ji) => (
                      <span key={ji} className={`w-full h-1 rounded-full ${STATUS_COLORS[job.status] || "bg-gray-400"}`} />
                    ))}
                    {dayJobs.length > 3 && <span className="text-[9px] text-muted-foreground text-center">+{dayJobs.length - 3}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Selected date jobs */}
        {selectedDate && (
          <div>
            <p className="text-sm font-bold mb-2">
              {selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              <span className="text-muted-foreground font-normal ml-1.5">{selectedJobs.length} job{selectedJobs.length !== 1 ? "s" : ""}</span>
            </p>
            {selectedJobs.length === 0 ? (
              <Card className="p-4 text-center">
                <p className="text-sm text-muted-foreground">No jobs scheduled</p>
                <Link to="/jobs/new">
                  <Button size="sm" variant="outline" className="rounded-xl mt-2 gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Schedule a job
                  </Button>
                </Link>
              </Card>
            ) : (
              <div className="space-y-2">
                {selectedJobs.sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date)).map(job => (
                  <Link key={job.id} to={`/jobs/${job.id}`}>
                    <Card className="p-3 hover:border-primary/20 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_COLORS[job.status] || "bg-gray-400"}`} />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{job.title}</p>
                            <p className="text-xs text-muted-foreground">{job.customer_name}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className="text-xs text-primary font-medium">
                            {new Date(job.scheduled_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <StatusBadge status={job.status} />
                        </div>
                      </div>
                      {job.estimated_duration && (
                        <p className="text-xs text-muted-foreground mt-1 ml-5">Est. {job.estimated_duration}h</p>
                      )}
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-3 pt-1 pb-2">
          {Object.entries(STATUS_COLORS).map(([status, color]) => (
            <div key={status} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${color}`} />
              <span className="text-[11px] text-muted-foreground capitalize">{status.replace("_", " ")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}