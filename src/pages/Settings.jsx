import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { useSettings } from "@/lib/useSettings";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Truck, Plus, Trash2, Building2, MapPin, Users, CheckCircle2, Loader2 } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils/format";

// ─── BUSINESS INFO TAB ────────────────────────────────────────────────────────
function BusinessTab({ settings, setSetting, isSaving }) {
  const [local, setLocal] = useState({
    business_name: settings.business_name,
    business_phone: settings.business_phone,
    business_email: settings.business_email,
  });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    Object.entries(local).forEach(([key, value]) => setSetting(key, value));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    toast.success("Business info saved");
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Company Details</p>
        <div>
          <Label className="text-xs">Business Name</Label>
          <Input value={local.business_name} onChange={e => setLocal(l => ({...l, business_name: e.target.value}))} className="mt-1" placeholder="AJ's Generator Service" />
          <p className="text-xs text-muted-foreground mt-1">Used on invoices and emails sent to customers</p>
        </div>
        <div>
          <Label className="text-xs">Business Phone</Label>
          <Input value={local.business_phone} onChange={e => setLocal(l => ({...l, business_phone: e.target.value}))} className="mt-1" placeholder="(973) 555-0100" />
        </div>
        <div>
          <Label className="text-xs">Business Email</Label>
          <Input value={local.business_email} onChange={e => setLocal(l => ({...l, business_email: e.target.value}))} className="mt-1" placeholder="aj@ajgeneratorservice.com" />
          <p className="text-xs text-muted-foreground mt-1">Reply-to address on customer emails</p>
        </div>
        <Button
          onClick={handleSave}
          className={`w-full rounded-xl gap-1.5 ${saved ? "bg-green-600 hover:bg-green-700" : ""}`}
          disabled={isSaving}
        >
          {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
            : saved ? <><CheckCircle2 className="w-4 h-4" /> Saved</>
            : "Save Business Info"}
        </Button>
      </Card>
    </div>
  );
}

// ─── OPERATIONS TAB ───────────────────────────────────────────────────────────
function OperationsTab({ settings, setSetting, isSaving }) {
  const [homeAddress, setHomeAddress] = useState(settings.home_address);
  const [firstHalfHourRate, setFirstHalfHourRate] = useState(settings.first_half_hour_rate);
  const [hourlyRate, setHourlyRate] = useState(settings.hourly_rate);
  const [apiKey, setApiKey] = useState(settings.google_maps_api_key);
  const [showApiKey, setShowApiKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSetting("home_address", homeAddress);
    setSetting("first_half_hour_rate", firstHalfHourRate);
    setSetting("hourly_rate", hourlyRate);
    setSetting("google_maps_api_key", apiKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    toast.success("Operations settings saved");
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Home Base</p>
        <div>
          <Label className="text-xs">Home Address</Label>
          <Input value={homeAddress} onChange={e => setHomeAddress(e.target.value)} className="mt-1" placeholder="31209 Courtnay Lane, Wharton NJ 07885" />
          <p className="text-xs text-muted-foreground mt-1">Starting point for mileage calculations</p>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Labor Rates</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">First ½ Hour Rate</Label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input type="number" value={firstHalfHourRate} onChange={e => setFirstHalfHourRate(e.target.value)} className="pl-6" placeholder="125" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Used in on-site job timer</p>
          </div>
          <div>
            <Label className="text-xs">Standard Hourly Rate</Label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input type="number" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} className="pl-6" placeholder="115" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Used after first ½ hour</p>
          </div>
        </div>
        <Card className="p-3 bg-muted/40 border-0">
          <p className="text-xs text-muted-foreground">
            Example: 1.5hr job = <span className="font-semibold text-foreground">{formatCurrency(parseFloat(firstHalfHourRate) || 125)}</span> (first ½hr) + <span className="font-semibold text-foreground">{formatCurrency(parseFloat(hourlyRate) || 115)}</span> (next hr) = <span className="font-semibold text-foreground">{formatCurrency((parseFloat(firstHalfHourRate) || 125) + (parseFloat(hourlyRate) || 115))}</span>
          </p>
        </Card>
      </Card>

      <Card className="p-4 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Google Maps API</p>
        <div>
          <Label className="text-xs flex items-center justify-between">
            <span>Google Maps API Key</span>
            <button onClick={() => setShowApiKey(!showApiKey)} className="text-primary text-xs underline">
              {showApiKey ? "Hide" : "Show"}
            </button>
          </Label>
          <Input
            type={showApiKey ? "text" : "password"}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            className="mt-1 font-mono text-xs"
            placeholder="AIzaSy..."
          />
          <p className="text-xs text-muted-foreground mt-1">Required for automatic mileage distance calculations</p>
        </div>
      </Card>

      <Button
        onClick={handleSave}
        className={`w-full rounded-xl gap-1.5 ${saved ? "bg-green-600 hover:bg-green-700" : ""}`}
        disabled={isSaving}
      >
        {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
          : saved ? <><CheckCircle2 className="w-4 h-4" /> Saved</>
          : "Save Operations Settings"}
      </Button>
    </div>
  );
}

// ─── VEHICLES TAB ─────────────────────────────────────────────────────────────
function VehiclesTab() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", year: "", make: "", model: "",
    plate: "", color: "", assigned_to_name: "", is_active: true,
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => db.Vehicle.list("name"),
  });

  const createMutation = useMutation({
    mutationFn: (data) => db.Vehicle.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      setOpen(false);
      setForm({ name: "", year: "", make: "", model: "", plate: "", color: "", assigned_to_name: "", is_active: true });
      toast.success("Vehicle added");
    },
    onError: (e) => toast.error("Failed: " + e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => db.Vehicle.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vehicles"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.Vehicle.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      toast.success("Vehicle removed");
    },
  });

  const TECH_OPTIONS = ["Jeremy", "Alex", "Derek", "Shared"];
  const TECH_COLORS = {
    Jeremy: "bg-blue-100 text-blue-700 border-blue-200",
    Alex: "bg-green-100 text-green-700 border-green-200",
    Derek: "bg-red-100 text-red-700 border-red-200",
    Shared: "bg-gray-100 text-gray-700 border-gray-200",
  };

  const activeVehicles = vehicles.filter(v => v.is_active !== false);
  const inactiveVehicles = vehicles.filter(v => v.is_active === false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">{activeVehicles.length} Active Vehicle{activeVehicles.length !== 1 ? "s" : ""}</p>
          <p className="text-xs text-muted-foreground">Tracked for IRS mileage reporting per vehicle</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-xl gap-1.5"><Plus className="w-4 h-4" /> Add</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Add Vehicle</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Display Name *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="mt-1" placeholder="e.g. White Ford F-250" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-xs">Year</Label><Input value={form.year} onChange={e => setForm(f => ({...f, year: e.target.value}))} className="mt-1" placeholder="2022" /></div>
                <div><Label className="text-xs">Make</Label><Input value={form.make} onChange={e => setForm(f => ({...f, make: e.target.value}))} className="mt-1" placeholder="Ford" /></div>
                <div><Label className="text-xs">Model</Label><Input value={form.model} onChange={e => setForm(f => ({...f, model: e.target.value}))} className="mt-1" placeholder="F-250" /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Plate</Label><Input value={form.plate} onChange={e => setForm(f => ({...f, plate: e.target.value.toUpperCase()}))} className="mt-1" placeholder="NJ ABC123" /></div>
                <div><Label className="text-xs">Color</Label><Input value={form.color} onChange={e => setForm(f => ({...f, color: e.target.value}))} className="mt-1" placeholder="White" /></div>
              </div>
              <div>
                <Label className="text-xs">Primary Driver</Label>
                <Select value={form.assigned_to_name} onValueChange={v => setForm(f => ({...f, assigned_to_name: v}))}>
                  <SelectTrigger className="mt-1 rounded-xl"><SelectValue placeholder="Select driver" /></SelectTrigger>
                  <SelectContent>
                    {TECH_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => { if (!form.name) { toast.error("Name required"); return; } createMutation.mutate(form); }}
                className="w-full rounded-xl"
                disabled={createMutation.isPending}
              >
                Add Vehicle
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {activeVehicles.length === 0 ? (
        <Card className="p-6 text-center">
          <Truck className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No vehicles added yet</p>
          <p className="text-xs text-muted-foreground mt-1">Add your work vehicle to enable mileage tracking</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {activeVehicles.map(v => (
            <Card key={v.id} className="p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 bg-muted rounded-xl flex items-center justify-center shrink-0">
                    <Truck className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{v.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[v.year, v.make, v.model].filter(Boolean).join(" ")}
                      {v.plate ? ` · ${v.plate}` : ""}
                      {v.color ? ` · ${v.color}` : ""}
                    </p>
                    {v.assigned_to_name && (
                      <span className={`inline-flex items-center mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${TECH_COLORS[v.assigned_to_name] || TECH_COLORS.Shared}`}>
                        Primary: {v.assigned_to_name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => { updateMutation.mutate({ id: v.id, data: { is_active: false } }); toast.success("Vehicle archived"); }}
                    className="text-xs text-muted-foreground px-2 py-1 rounded-lg hover:bg-muted"
                  >
                    Archive
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {v.name}?</AlertDialogTitle>
                        <AlertDialogDescription>Existing mileage logs will remain but lose the vehicle reference.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate(v.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {inactiveVehicles.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Archived</p>
          {inactiveVehicles.map(v => (
            <Card key={v.id} className="p-3 opacity-60 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{v.name}{v.plate ? ` · ${v.plate}` : ""}</p>
              <button onClick={() => updateMutation.mutate({ id: v.id, data: { is_active: true } })} className="text-xs text-primary underline">Restore</button>
            </Card>
          ))}
        </div>
      )}

      <Card className="p-3.5 border-amber-200 bg-amber-50">
        <p className="text-xs font-bold text-amber-800 mb-1">📋 IRS Note</p>
        <p className="text-xs text-amber-700 leading-relaxed">Mileage deductions must be reported per vehicle on Form 4562. Your accountant will need total business miles per vehicle for the year.</p>
      </Card>
    </div>
  );
}

// ─── TEAM TAB ─────────────────────────────────────────────────────────────────
function TeamTab({ settings, setSetting, isSaving }) {
  const [emails, setEmails] = useState({
    jeremy: settings.team_email_jeremy || "",
    alex: settings.team_email_alex || "",
    derek: settings.team_email_derek || "",
    sean: settings.team_email_sean || "",
  });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSetting("team_email_jeremy", emails.jeremy);
    setSetting("team_email_alex", emails.alex);
    setSetting("team_email_derek", emails.derek);
    setSetting("team_email_sean", emails.sean);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    toast.success("Team emails saved");
  };

  const TEAM = [
    { key: "jeremy", name: "Jeremy D'Alessio", role: "Co-Founder · Field Tech", color: "bg-blue-500", placeholder: "jeremy@gmail.com" },
    { key: "alex", name: "Alex Russo", role: "Co-Founder · Field Tech", color: "bg-green-500", placeholder: "alex@gmail.com" },
    { key: "derek", name: "Derek Sainz", role: "Financial Advisor · Marketing Strategy", color: "bg-red-500", placeholder: "derek@gmail.com" },
    { key: "sean", name: "Sean", role: "Head of Marketing", color: "bg-purple-500", placeholder: "sean@gmail.com" },
  ];

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-0.5">Team Notification Emails</p>
          <p className="text-xs text-muted-foreground">These addresses receive automatic alerts for all business events — new jobs, completions, payments, and more.</p>
        </div>
        {TEAM.map(member => (
          <div key={member.key} className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl ${member.color} flex items-center justify-center shrink-0`}>
              <span className="text-white text-sm font-bold">{member.name[0]}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold mb-1">{member.name}</p>
              <Input
                type="email"
                value={emails[member.key]}
                onChange={e => setEmails(prev => ({ ...prev, [member.key]: e.target.value }))}
                placeholder={member.placeholder}
                className="h-8 text-xs rounded-lg"
              />
            </div>
          </div>
        ))}
        <Button
          onClick={handleSave}
          className={`w-full rounded-xl gap-1.5 ${saved ? "bg-green-600 hover:bg-green-700" : ""}`}
          disabled={isSaving}
        >
          {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
            : saved ? <><CheckCircle2 className="w-4 h-4" /> Saved</>
            : "Save Team Emails"}
        </Button>
      </Card>
      <Card className="p-3.5 bg-muted/30 border-0">
        <p className="text-xs text-muted-foreground">Jeremy = Blue · Alex = Green · Derek = Red · Sean = Purple</p>
      </Card>
    </div>
  );
}

// ─── MAIN SETTINGS PAGE ───────────────────────────────────────────────────────
export default function Settings() {
  const { settings, isLoading, setSetting, isSaving } = useSettings();

  if (isLoading) return (
    <div className="flex items-center justify-center h-40">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div>
      <PageHeader title="Settings" subtitle="Business configuration" back="/" />
      <div className="px-4 pt-3 pb-4 max-w-lg mx-auto">
        <Tabs defaultValue="business">
          <TabsList className="w-full grid grid-cols-4 bg-muted/60 rounded-xl p-0.5 mb-4">
            <TabsTrigger value="business" className="text-xs rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <Building2 className="w-3 h-3 mr-1" />Business
            </TabsTrigger>
            <TabsTrigger value="operations" className="text-xs rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <MapPin className="w-3 h-3 mr-1" />Ops
            </TabsTrigger>
            <TabsTrigger value="vehicles" className="text-xs rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <Truck className="w-3 h-3 mr-1" />Vehicles
            </TabsTrigger>
            <TabsTrigger value="team" className="text-xs rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm">
              <Users className="w-3 h-3 mr-1" />Team
            </TabsTrigger>
          </TabsList>
          <TabsContent value="business">
            <BusinessTab settings={settings} setSetting={setSetting} isSaving={isSaving} />
          </TabsContent>
          <TabsContent value="operations">
            <OperationsTab settings={settings} setSetting={setSetting} isSaving={isSaving} />
          </TabsContent>
          <TabsContent value="vehicles">
            <VehiclesTab />
          </TabsContent>
          <TabsContent value="team">
            <TeamTab settings={settings} setSetting={setSetting} isSaving={isSaving} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}