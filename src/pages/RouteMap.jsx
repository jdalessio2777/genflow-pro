import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation, Clock, ExternalLink, Phone } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";

export default function RouteMap() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [techView, setTechView] = useState("all");

  const { data: jobs = [] } = useQuery({
    queryKey: ["jobs"],
    queryFn: () => db.Job.list("-created_date", 200),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => db.Customer.list("name"),
  });
  const customerMap = Object.fromEntries(customers.map(c => [c.id, c]));

  const todayJobs = jobs
    .filter(j => {
      if (!j.scheduled_date) return false;
      const jobDate = new Date(j.scheduled_date).toISOString().split("T")[0];
      if (jobDate !== selectedDate) return false;
      if (!["scheduled", "dispatched", "on_site", "in_progress"].includes(j.status)) return false;
      if (techView !== "all" && j.assigned_to_name && j.assigned_to_name !== techView) return false;
      return true;
    })
    .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));

  const jobsWithAddress = todayJobs.filter(j => customerMap[j.customer_id]?.address);

  const openGoogleMapsRoute = () => {
    const addresses = jobsWithAddress.map(j => encodeURIComponent(customerMap[j.customer_id].address));
    if (addresses.length === 0) return;
    if (addresses.length === 1) {
      window.open(`https://maps.google.com/?q=${addresses[0]}`, "_blank");
      return;
    }
    const destination = addresses[addresses.length - 1];
    const waypoints = addresses.slice(0, -1).join("|");
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${destination}&waypoints=${waypoints}&travelmode=driving`, "_blank");
  };

  const openSingleAddress = (address) => {
    window.open(`https://maps.google.com/?q=${encodeURIComponent(address)}`, "_blank");
  };

  return (
    <div>
      <PageHeader title="Route" subtitle={`${todayJobs.length} stop${todayJobs.length !== 1 ? "s" : ""}${techView !== "all" ? ` · ${techView}` : ""}`} />

      <div className="px-4 pt-3 space-y-4 max-w-lg mx-auto">
        <div className="flex items-center gap-1.5 flex-wrap">
          {["all", "Jeremy", "Alex", "Derek", "Sean"].map(name => (
            <button key={name} onClick={() => setTechView(name)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                techView === name
                  ? name === "Jeremy" ? "bg-blue-600 text-white"
                    : name === "Alex" ? "bg-green-600 text-white"
                    : name === "Derek" ? "bg-red-600 text-white"
                    : name === "Sean" ? "bg-purple-600 text-white"
                    : "bg-primary text-white"
                  : "bg-muted text-muted-foreground"
              }`}>
              {name === "all" ? "All" : name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="flex-1 h-10 rounded-xl border border-input bg-background px-3 text-sm"
          />
          <Button variant="outline" size="sm" className="rounded-xl h-10"
            onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])}>
            Today
          </Button>
        </div>

        {jobsWithAddress.length >= 2 && (
          <Button className="w-full rounded-xl h-12 gap-2" onClick={openGoogleMapsRoute}>
            <Navigation className="w-4 h-4" />
            Open Full Route in Maps ({jobsWithAddress.length} stops)
          </Button>
        )}

        {todayJobs.length === 0 ? (
          <Card className="p-8 text-center">
            <MapPin className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No jobs scheduled for this date</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {todayJobs.map((job, index) => {
              const cust = customerMap[job.customer_id];
              return (
                <Card key={job.id} className="p-3.5">
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{job.title}</p>
                          <p className="text-xs text-primary font-medium">{job.customer_name}</p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0 font-medium">
                          {new Date(job.scheduled_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      {cust?.address && (
                        <div className="flex items-center justify-between mt-1.5">
                          <p className="text-xs text-muted-foreground flex items-center gap-1 truncate mr-2">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate">{cust.address}</span>
                          </p>
                          <button onClick={() => openSingleAddress(cust.address)} className="text-primary shrink-0">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      {!cust?.address && <p className="text-xs text-amber-600 mt-1">⚠ No address on file</p>}
                      {job.estimated_duration && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Est. {job.estimated_duration}h
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2.5 ml-10">
                    <Link to={`/jobs/${job.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full rounded-xl h-8 text-xs">Open Job</Button>
                    </Link>
                    {cust?.phone && (
                      <a href={`tel:${cust.phone}`} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full rounded-xl h-8 text-xs gap-1.5">
                          <Phone className="w-3 h-3" /> Call
                        </Button>
                      </a>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}