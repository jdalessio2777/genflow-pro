import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { integrationsCore } from "@/lib/coreIntegrations";
import { useAuth } from "@/lib/AuthContext";
import { getUserDisplayName } from "@/lib/userColors";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DollarSign, TrendingUp, TrendingDown, Receipt, Car, Plus, Trash2, FileText, Navigation, Truck, ChevronDown, ChevronUp, Loader2, Camera, ImagePlus, X } from "lucide-react";
// Note: Truck still used in MileageTab
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import PageHeader from "@/components/layout/PageHeader";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { toast } from "sonner";
import { useSettings } from "@/lib/useSettings";

const HOME_ADDRESS = "31209 Courtnay Lane, Wharton NJ 07885"; // fallback default
const IRS_RATE = 0.725;

const EXPENSE_CATEGORIES = [
  "Parts & Supplies",
  "Fuel",
  "Tools & Equipment",
  "Insurance",
  "Marketing",
  "Professional Services",
  "Vehicle",
  "Software & Subscriptions",
  "Other",
];

const IRS_MILEAGE_RATE = 0.725;

// ─── OVERVIEW TAB ─────────────────────────────────────────────────────────────
function OverviewTab({ invoices, expenses, mileage, jobs = [] }) {
  const [period, setPeriod] = useState("month");
  const now = new Date();

  const filterByPeriod = (date) => {
    if (!date) return false;
    const d = new Date(date);
    if (period === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (period === "quarter") {
      const q = Math.floor(now.getMonth() / 3);
      return Math.floor(d.getMonth() / 3) === q && d.getFullYear() === now.getFullYear();
    }
    if (period === "year") return d.getFullYear() === now.getFullYear();
    return true;
  };

  const paidInvoices = invoices.filter(i => i.status === "paid" && filterByPeriod(i.paid_date));
  const revenue = paidInvoices.reduce((s, i) => s + (i.total || 0), 0);
  const periodExpenses = expenses.filter(e => filterByPeriod(e.date));
  const expenseTotal = periodExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const periodMileage = mileage.filter(m => filterByPeriod(m.date));
  const mileageTotal = periodMileage.reduce((s, m) => s + (m.miles || 0), 0);
  const mileageDeduction = mileageTotal * IRS_MILEAGE_RATE;
  const netProfit = revenue - expenseTotal;
  const outstandingInvoices = invoices.filter(i => i.status === "sent");
  const outstanding = outstandingInvoices.reduce((s, i) => s + (i.total || 0), 0);

  const monthlyRevenue = Array.from({ length: 12 }, (_, month) => {
    const total = invoices
      .filter(i => i.status === "paid" && new Date(i.paid_date || i.created_date).getMonth() === month && new Date(i.paid_date || i.created_date).getFullYear() === now.getFullYear())
      .reduce((s, i) => s + (i.total || 0), 0);
    return { month: new Date(now.getFullYear(), month, 1).toLocaleDateString("en-US", { month: "short" }), total };
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 flex-wrap">
        {[["month", "This Month"], ["quarter", "This Quarter"], ["year", "This Year"], ["all", "All Time"]].map(([key, label]) => (
          <button key={key} onClick={() => setPeriod(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${period === key ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3.5 border-green-200 bg-green-50">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-green-600" />
            <p className="text-xs font-semibold text-green-800">Revenue</p>
          </div>
          <p className="text-2xl font-bold text-green-700">{formatCurrency(revenue)}</p>
          <p className="text-xs text-green-600 mt-0.5">{paidInvoices.length} paid invoice{paidInvoices.length !== 1 ? "s" : ""}</p>
        </Card>

        <Card className="p-3.5 border-red-200 bg-red-50">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-red-600" />
            <p className="text-xs font-semibold text-red-800">Expenses</p>
          </div>
          <p className="text-2xl font-bold text-red-700">{formatCurrency(expenseTotal)}</p>
          <p className="text-xs text-red-600 mt-0.5">{periodExpenses.length} expense{periodExpenses.length !== 1 ? "s" : ""}</p>
        </Card>

        <Card className={`p-3.5 col-span-2 ${netProfit >= 0 ? "border-blue-200 bg-blue-50" : "border-red-200 bg-red-50"}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Net Profit</p>
              <p className={`text-3xl font-bold ${netProfit >= 0 ? "text-blue-700" : "text-red-700"}`}>{formatCurrency(netProfit)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Mileage deduction</p>
              <p className="text-sm font-bold text-purple-700">{formatCurrency(mileageDeduction)}</p>
              <p className="text-xs text-muted-foreground">{mileageTotal.toLocaleString()} mi</p>
            </div>
          </div>
        </Card>
      </div>

      {outstanding > 0 && (
        <Card className="p-3.5 border-amber-200 bg-amber-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-amber-600" />
              <div>
                <p className="text-sm font-bold text-amber-900">Outstanding</p>
                <p className="text-xs text-amber-700">{outstandingInvoices.length} sent invoice{outstandingInvoices.length !== 1 ? "s" : ""} unpaid</p>
              </div>
            </div>
            <p className="text-lg font-bold text-amber-700">{formatCurrency(outstanding)}</p>
          </div>
        </Card>
      )}

      {outstandingInvoices.length > 0 && (() => {
        const now = new Date();
        const aged30 = outstandingInvoices.filter(i => (now - new Date(i.updated_date || i.created_date)) / 86400000 >= 30);
        const aged14 = outstandingInvoices.filter(i => { const d = (now - new Date(i.updated_date || i.created_date)) / 86400000; return d >= 14 && d < 30; });
        const aged7 = outstandingInvoices.filter(i => { const d = (now - new Date(i.updated_date || i.created_date)) / 86400000; return d >= 7 && d < 14; });
        if (aged7.length === 0 && aged14.length === 0 && aged30.length === 0) return null;
        return (
          <Card className="p-3.5 border-amber-200 bg-amber-50/50">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-900 mb-2.5">Invoice Aging</p>
            <div className="space-y-2">
              {aged30.length > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500 shrink-0" /><p className="text-xs font-semibold text-red-700">30+ days unpaid</p></div>
                  <div className="text-right"><p className="text-xs font-bold text-red-700">{aged30.length} invoice{aged30.length !== 1 ? "s" : ""}</p><p className="text-xs text-red-600">{formatCurrency(aged30.reduce((s, i) => s + (i.total || 0), 0))}</p></div>
                </div>
              )}
              {aged14.length > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" /><p className="text-xs font-semibold text-amber-800">14–29 days unpaid</p></div>
                  <div className="text-right"><p className="text-xs font-bold text-amber-800">{aged14.length} invoice{aged14.length !== 1 ? "s" : ""}</p><p className="text-xs text-amber-700">{formatCurrency(aged14.reduce((s, i) => s + (i.total || 0), 0))}</p></div>
                </div>
              )}
              {aged7.length > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" /><p className="text-xs font-semibold text-yellow-800">7–13 days unpaid</p></div>
                  <div className="text-right"><p className="text-xs font-bold text-yellow-800">{aged7.length} invoice{aged7.length !== 1 ? "s" : ""}</p><p className="text-xs text-yellow-700">{formatCurrency(aged7.reduce((s, i) => s + (i.total || 0), 0))}</p></div>
                </div>
              )}
            </div>
          </Card>
        );
      })()}

      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Monthly Revenue — {now.getFullYear()}</p>
        <Card className="p-3">
          <div className="space-y-2">
            {monthlyRevenue.map((m, i) => {
              if (new Date(now.getFullYear(), i, 1) > now && m.total === 0) return null;
              const maxVal = Math.max(...monthlyRevenue.map(x => x.total), 1);
              const width = Math.max((m.total / maxVal) * 100, m.total > 0 ? 4 : 0);
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-8 shrink-0">{m.month}</span>
                  <div className="flex-1 h-5 bg-muted/40 rounded-lg overflow-hidden">
                    <div className="h-full bg-primary/70 rounded-lg transition-all" style={{ width: `${width}%` }} />
                  </div>
                  <span className="text-xs font-semibold w-16 text-right shrink-0">{m.total > 0 ? formatCurrency(m.total) : "—"}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {(() => {
        const JOB_TYPE_COLORS = {
          maintenance:         "bg-blue-500",
          diagnostic_repair:   "bg-orange-500",
          emergency:           "bg-red-500",
          battery_replacement: "bg-amber-500",
          warranty:            "bg-violet-500",
          inspection:          "bg-purple-500",
          other:               "bg-gray-400",
        };
        const jobMap = Object.fromEntries(jobs.map(j => [j.id, j]));
        const byType = paidInvoices.reduce((acc, inv) => {
          const job = jobMap[inv.job_id];
          const type = job?.job_type || "other";
          acc[type] = (acc[type] || 0) + (inv.total || 0);
          return acc;
        }, {});
        const typeEntries = Object.entries(byType).sort((a, b) => b[1] - a[1]).filter(([, v]) => v > 0);
        if (typeEntries.length === 0) return null;
        const maxVal = Math.max(...typeEntries.map(([, v]) => v), 1);
        return (
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Revenue by Job Type</p>
            <Card className="p-3">
              <div className="space-y-2">
                {typeEntries.map(([type, total]) => {
                  const width = Math.max((total / maxVal) * 100, 4);
                  const colorClass = JOB_TYPE_COLORS[type] || "bg-gray-400";
                  return (
                    <div key={type} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-20 shrink-0 capitalize">{type}</span>
                      <div className="flex-1 h-5 bg-muted/40 rounded-lg overflow-hidden">
                        <div className={`h-full ${colorClass} opacity-70 rounded-lg transition-all`} style={{ width: `${width}%` }} />
                      </div>
                      <span className="text-xs font-semibold w-16 text-right shrink-0">{formatCurrency(total)}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        );
      })()}
    </div>
  );
}

// ─── EXPENSES TAB ──────────────────────────────────────────────────────────────
function ExpensesTab({ expenses }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    amount: "",
    category: "Other",
    description: "",
  });

  const createMutation = useMutation({
    mutationFn: (data) => db.Expense.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      resetForm();
      toast.success("Expense logged");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.Expense.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expenses"] }),
  });

  const resetForm = () => {
    setOpen(false);
    setReceiptUrl(null);
    setReceiptPreview(null);
    setForm({ date: new Date().toISOString().split("T")[0], amount: "", category: "Other", description: "" });
  };

  const handlePhotoCapture = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setReceiptPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const { file_url } = await integrationsCore.UploadFile({ file });
      setReceiptUrl(file_url);
    } catch {
      toast.error("Photo upload failed — expense will save without receipt");
      setReceiptUrl(null);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSave = () => {
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error("Amount required"); return; }
    if (!form.description.trim()) { toast.error("Description required"); return; }
    createMutation.mutate({
      ...form,
      amount: parseFloat(form.amount),
      receipt_url: receiptUrl || null,
      scanned_by_ai: false,
      author_name: getUserDisplayName(user),
      author_email: user?.email || "",
    });
  };

  const total = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const byCategory = EXPENSE_CATEGORIES.map(cat => ({
    cat,
    total: expenses.filter(e => e.category === cat).reduce((s, e) => s + (e.amount || 0), 0),
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Total expenses logged</p>
          <p className="text-lg font-bold text-red-600">{formatCurrency(total)}</p>
        </div>
        <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> Add Expense
        </Button>
      </div>

      {open && (
        <Card className="p-4 space-y-3 border-primary/20">
          {/* Receipt photo — optional */}
          <div>
            <Label className="text-xs mb-1.5 block">Receipt Photo (optional)</Label>
            {receiptPreview ? (
              <div className="relative">
                <img src={receiptPreview} alt="Receipt" className="w-full max-h-40 object-contain rounded-xl border border-border bg-muted/30" />
                {uploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded-xl">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  </div>
                )}
                <button
                  onClick={() => { setReceiptUrl(null); setReceiptPreview(null); }}
                  className="absolute top-2 right-2 w-6 h-6 bg-background/80 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <label className="cursor-pointer">
                  <div className="flex flex-col items-center justify-center gap-1.5 h-16 rounded-xl border-2 border-dashed border-border hover:border-primary/40 transition-colors">
                    <Camera className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground font-medium">Camera</p>
                  </div>
                  <input type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="hidden" />
                </label>
                <label className="cursor-pointer">
                  <div className="flex flex-col items-center justify-center gap-1.5 h-16 rounded-xl border-2 border-dashed border-border hover:border-primary/40 transition-colors">
                    <ImagePlus className="w-4 h-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground font-medium">Gallery</p>
                  </div>
                  <input type="file" accept="image/*" onChange={handlePhotoCapture} className="hidden" />
                </label>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Amount ($)</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={e => setForm(f => ({...f, amount: e.target.value}))} className="mt-1" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Category</Label>
            <Select value={form.category} onValueChange={v => setForm(f => ({...f, category: v}))}>
              <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>{EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Description</Label>
            <Input placeholder="e.g. Gas for service runs" value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} className="mt-1" />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={resetForm}>Cancel</Button>
            <Button className="flex-1 rounded-xl" onClick={handleSave} disabled={createMutation.isPending || uploading}>
              {createMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : "Save Expense"}
            </Button>
          </div>
        </Card>
      )}

      {byCategory.length > 0 && (
        <Card className="p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">By Category</p>
          <div className="space-y-1.5">
            {byCategory.map(c => (
              <div key={c.cat} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{c.cat}</span>
                <span className="font-semibold">{formatCurrency(c.total)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {expenses.length === 0 ? (
        <Card className="p-8 text-center">
          <Receipt className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No expenses logged yet</p>
          <p className="text-xs text-muted-foreground mt-1">Every expense is a tax deduction — track them all</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {[...expenses].sort((a, b) => new Date(b.date) - new Date(a.date)).map(exp => (
            <Card key={exp.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  {exp.receipt_url ? (
                    <a href={exp.receipt_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      <img src={exp.receipt_url} alt="Receipt" className="w-10 h-10 rounded-lg object-cover border border-border" />
                    </a>
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Receipt className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{exp.description}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(exp.date)} · {exp.category}</p>
                    {exp.author_name && <p className="text-[10px] text-muted-foreground">{exp.author_name}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold text-red-600">{formatCurrency(exp.amount)}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8"
                    onClick={() => { if (window.confirm("Delete this expense?")) deleteMutation.mutate(exp.id); }}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MILEAGE TAB ──────────────────────────────────────────────────────────────
function MileageTab({ mileage, vehicles, customers, homeAddress, googleApiKey }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [smartOpen, setSmartOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [tripDate, setTripDate] = useState(new Date().toISOString().split("T")[0]);
  const effectiveHomeAddress = homeAddress || HOME_ADDRESS;
  const effectiveApiKey = googleApiKey || "";
  const [tripFrom, setTripFrom] = useState(effectiveHomeAddress);
  const [tripTo, setTripTo] = useState("");
  const [tripDesc, setTripDesc] = useState("");
  const [tripVehicleId, setTripVehicleId] = useState("");
  const [estimating, setEstimating] = useState(false);
  const [estimatedMiles, setEstimatedMiles] = useState(null);
  const [distanceError, setDistanceError] = useState(null);
  const [manualForm, setManualForm] = useState({
    date: new Date().toISOString().split("T")[0],
    miles: "", description: "", vehicle_id: "",
  });
  const [view, setView] = useState("week");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [expandedDays, setExpandedDays] = useState({});

  const activeVehicles = vehicles.filter(v => v.is_active !== false);

  const getDefaultVehicle = () => {
    const userName = getUserDisplayName(user)?.split(" ")[0];
    const assigned = activeVehicles.find(v => v.assigned_to_name === userName);
    return assigned?.id || activeVehicles[0]?.id || "";
  };

  const createMutation = useMutation({
    mutationFn: (data) => db.MileageLog.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mileage"] });
      setSmartOpen(false);
      setManualOpen(false);
      setTripFrom(effectiveHomeAddress);
      setTripTo(""); setTripDesc(""); setTripVehicleId("");
      setEstimatedMiles(null); setDistanceError(null);
      setManualForm({ date: new Date().toISOString().split("T")[0], miles: "", description: "", vehicle_id: "" });
      toast.success("Trip logged");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.MileageLog.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mileage"] }),
  });

  const addressOptions = [
    { label: "🏠 Home (Wharton NJ)", value: effectiveHomeAddress },
    ...(customers || [])
      .filter(c => c.address)
      .map(c => ({ label: `📍 ${c.name}`, value: c.address, customerName: c.name })),
  ];

  const getAddressShortName = (address) => {
    if (address === effectiveHomeAddress) return "Home";
    const opt = addressOptions.find(o => o.value === address);
    return opt?.customerName || address.split(",")[0];
  };

  const buildAutoDesc = (from, to) => `${getAddressShortName(from)} → ${getAddressShortName(to)}`;

  const handleFromChange = (val) => {
    setTripFrom(val); setEstimatedMiles(null); setDistanceError(null);
    if (val && tripTo) setTripDesc(buildAutoDesc(val, tripTo));
  };

  const handleToChange = (val) => {
    setTripTo(val); setEstimatedMiles(null); setDistanceError(null);
    if (tripFrom && val) setTripDesc(buildAutoDesc(tripFrom, val));
  };

  const calculateDistance = async () => {
    if (!tripFrom || !tripTo) { toast.error("Select both From and To"); return; }
    if (tripFrom === tripTo) { toast.error("From and To cannot be the same"); return; }
    setEstimating(true); setDistanceError(null); setEstimatedMiles(null);
    try {
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json` +
        `?origins=${encodeURIComponent(tripFrom)}` +
        `&destinations=${encodeURIComponent(tripTo)}` +
        `&units=imperial` +
        `&key=${effectiveApiKey}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.status !== "OK") throw new Error(`API error: ${data.status}`);
      const element = data.rows?.[0]?.elements?.[0];
      if (element?.status !== "OK") throw new Error(`Route error: ${element?.status}`);
      const miles = Math.round((element.distance.value / 1609.34) * 10) / 10;
      setEstimatedMiles(miles);
      if (!tripDesc) setTripDesc(buildAutoDesc(tripFrom, tripTo));
    } catch {
      setDistanceError("Could not calculate route — check addresses or use Manual entry");
    } finally {
      setEstimating(false);
    }
  };

  const logTrip = () => {
    if (!estimatedMiles) { toast.error("Calculate distance first"); return; }
    if (!tripDesc.trim()) { toast.error("Description required"); return; }
    const vid = tripVehicleId || getDefaultVehicle();
    createMutation.mutate({
      date: tripDate, miles: estimatedMiles, description: tripDesc.trim(),
      from_address: tripFrom, to_address: tripTo,
      vehicle_id: vid,
      vehicle_name: activeVehicles.find(v => v.id === vid)?.name || "",
      author_name: getUserDisplayName(user), author_email: user?.email || "",
    });
  };

  const now = new Date();
  const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0,0,0,0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const filtered = [...mileage]
    .filter(entry => {
      if (!entry.date) return false;
      const d = new Date(entry.date + "T12:00:00");
      if (view === "week" && d < startOfWeek) return false;
      if (view === "month" && d < startOfMonth) return false;
      if (vehicleFilter !== "all" && entry.vehicle_id !== vehicleFilter) return false;
      return true;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const filteredMiles = filtered.reduce((s, m) => s + (m.miles || 0), 0);
  const yearMiles = mileage
    .filter(m => m.date && new Date(m.date + "T12:00:00").getFullYear() === now.getFullYear())
    .reduce((s, m) => s + (m.miles || 0), 0);

  const vehicleBreakdown = activeVehicles.map(v => ({
    vehicle: v,
    yearMiles: mileage
      .filter(m => m.vehicle_id === v.id && m.date && new Date(m.date + "T12:00:00").getFullYear() === now.getFullYear())
      .reduce((s, m) => s + (m.miles || 0), 0),
  })).filter(vb => vb.yearMiles > 0);

  const byDate = filtered.reduce((acc, entry) => {
    const key = entry.date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {});
  const sortedDates = Object.keys(byDate).sort((a, b) => new Date(b) - new Date(a));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3.5 border-purple-200 bg-purple-50">
          <p className="text-xs font-semibold text-purple-700 mb-0.5">This Year</p>
          <p className="text-xl font-bold text-purple-800">{yearMiles.toFixed(1)} mi</p>
          <p className="text-xs text-purple-600 font-medium">{formatCurrency(yearMiles * IRS_RATE)} deduction</p>
        </Card>
        <Card className="p-3.5">
          <p className="text-xs font-semibold text-muted-foreground mb-0.5">
            {view === "week" ? "This Week" : view === "month" ? "This Month" : "All Time"}
            {vehicleFilter !== "all" ? ` · ${activeVehicles.find(v => v.id === vehicleFilter)?.name || ""}` : ""}
          </p>
          <p className="text-xl font-bold">{filteredMiles.toFixed(1)} mi</p>
          <p className="text-xs text-muted-foreground font-medium">{formatCurrency(filteredMiles * IRS_RATE)} deduction</p>
        </Card>
      </div>

      {vehicleBreakdown.length > 1 && (
        <Card className="p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">By Vehicle — {now.getFullYear()}</p>
          <div className="space-y-1.5">
            {vehicleBreakdown.map(({ vehicle, yearMiles: vm }) => (
              <div key={vehicle.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Truck className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground truncate max-w-[140px]">{vehicle.name}</span>
                  {vehicle.assigned_to_name && <span className="text-[10px] text-muted-foreground">({vehicle.assigned_to_name})</span>}
                </div>
                <div className="text-right">
                  <span className="font-semibold">{vm.toFixed(1)} mi</span>
                  <span className="text-xs text-purple-600 ml-1.5">{formatCurrency(vm * IRS_RATE)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2">
        {/* Smart Trip */}
        <Dialog open={smartOpen} onOpenChange={(v) => {
          setSmartOpen(v);
          if (v) { setTripVehicleId(getDefaultVehicle()); setTripDate(new Date().toISOString().split("T")[0]); }
          else { setTripFrom(effectiveHomeAddress); setTripTo(""); setTripDesc(""); setTripVehicleId(""); setEstimatedMiles(null); setDistanceError(null); }
        }}>
          <DialogTrigger asChild>
            <Button className="rounded-xl gap-1.5 h-10 text-sm"><Navigation className="w-4 h-4" /> Log Trip</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Log Trip</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Date</Label>
                  <Input type="date" value={tripDate} onChange={e => setTripDate(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Vehicle</Label>
                  <Select value={tripVehicleId} onValueChange={setTripVehicleId}>
                    <SelectTrigger className="mt-1 rounded-xl">
                      <SelectValue placeholder={activeVehicles.length === 0 ? "No vehicles" : "Select"} />
                    </SelectTrigger>
                    <SelectContent>
                      {activeVehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {activeVehicles.length === 0 && <p className="text-xs text-amber-600 mt-1">Add a vehicle in the Vehicles tab first</p>}
                </div>
              </div>
              <div>
                <Label className="text-xs">From</Label>
                <Select value={tripFrom} onValueChange={handleFromChange}>
                  <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>{addressOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Select value={tripTo} onValueChange={handleToChange}>
                  <SelectTrigger className="mt-1 rounded-xl"><SelectValue placeholder="Select destination" /></SelectTrigger>
                  <SelectContent>{addressOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {!estimatedMiles && !distanceError && (
                <Button variant="outline" className="w-full rounded-xl gap-1.5"
                  onClick={calculateDistance}
                  disabled={estimating || !tripFrom || !tripTo || tripFrom === tripTo}>
                  {estimating ? <><Loader2 className="w-4 h-4 animate-spin" /> Calculating...</> : <><Navigation className="w-4 h-4" /> Calculate Distance</>}
                </Button>
              )}
              {distanceError && (
                <Card className="p-3 border-red-200 bg-red-50">
                  <p className="text-xs text-red-700">{distanceError}</p>
                  <button className="text-xs text-red-600 underline mt-1" onClick={() => setDistanceError(null)}>Try again</button>
                </Card>
              )}
              {estimatedMiles !== null && (
                <Card className="p-3.5 border-purple-200 bg-purple-50">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-xs font-semibold text-purple-700">Driving Distance</p>
                      <p className="text-2xl font-bold text-purple-800">{estimatedMiles} miles</p>
                      <p className="text-xs text-purple-600">{formatCurrency(estimatedMiles * IRS_RATE)} deduction</p>
                    </div>
                    <button onClick={() => { setEstimatedMiles(null); setDistanceError(null); }} className="text-xs text-muted-foreground underline self-start">Recalculate</button>
                  </div>
                  <div>
                    <Label className="text-xs text-purple-700">Override if needed</Label>
                    <Input type="number" step="0.1" value={estimatedMiles} onChange={e => setEstimatedMiles(parseFloat(e.target.value) || 0)} className="mt-1 h-8 text-sm border-purple-200" />
                  </div>
                </Card>
              )}
              <div>
                <Label className="text-xs">Description</Label>
                <Input value={tripDesc} onChange={e => setTripDesc(e.target.value)} className="mt-1" placeholder="Auto-filled from addresses" />
              </div>
              <Button onClick={logTrip} className="w-full rounded-xl" disabled={!estimatedMiles || !tripDesc.trim() || createMutation.isPending}>
                {createMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Logging...</> : "Log Trip"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Manual entry */}
        <Dialog open={manualOpen} onOpenChange={setManualOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="rounded-xl gap-1.5 h-10 text-sm"><Plus className="w-4 h-4" /> Manual</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Manual Mileage Entry</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Date</Label>
                  <Input type="date" value={manualForm.date} onChange={e => setManualForm(f => ({...f, date: e.target.value}))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Miles</Label>
                  <Input type="number" step="0.1" placeholder="0.0" value={manualForm.miles} onChange={e => setManualForm(f => ({...f, miles: parseFloat(e.target.value) || 0}))} className="mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Vehicle</Label>
                <Select value={manualForm.vehicle_id} onValueChange={v => setManualForm(f => ({...f, vehicle_id: v}))}>
                  <SelectTrigger className="mt-1 rounded-xl"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                  <SelectContent>{activeVehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Input placeholder="e.g. Summit → Randolph service run" value={manualForm.description} onChange={e => setManualForm(f => ({...f, description: e.target.value}))} className="mt-1" />
              </div>
              <Button onClick={() => {
                if (!manualForm.miles || !manualForm.description) { toast.error("Miles and description required"); return; }
                const vehicle = activeVehicles.find(v => v.id === manualForm.vehicle_id);
                createMutation.mutate({ ...manualForm, vehicle_name: vehicle?.name || "", author_name: getUserDisplayName(user), author_email: user?.email || "" });
              }} className="w-full rounded-xl" disabled={createMutation.isPending}>Log Miles</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {[["week", "This Week"], ["month", "This Month"], ["all", "All Time"]].map(([key, label]) => (
          <button key={key} onClick={() => setView(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${view === key ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
            {label}
          </button>
        ))}
      </div>

      {activeVehicles.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => setVehicleFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${vehicleFilter === "all" ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
            <Truck className="w-3 h-3" /> All Vehicles
          </button>
          {activeVehicles.map(v => (
            <button key={v.id} onClick={() => setVehicleFilter(v.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${vehicleFilter === v.id ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
              {v.name.split(" ").slice(0, 2).join(" ")}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <Card className="p-8 text-center">
          <Car className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No trips logged {view !== "all" ? `this ${view}` : "yet"}</p>
          <p className="text-xs text-muted-foreground mt-1">At 72.5¢/mi, 10,000 miles = $7,250 deduction</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {sortedDates.map(date => {
            const entries = byDate[date];
            const dayMiles = entries.reduce((s, e) => s + (e.miles || 0), 0);
            const isExpanded = expandedDays[date] !== false;
            const displayDate = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
            return (
              <div key={date}>
                <button onClick={() => setExpandedDays(prev => ({...prev, [date]: !isExpanded}))}
                  className="w-full flex items-center justify-between px-1 py-1.5 hover:bg-muted/30 rounded-lg transition-colors">
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                    <p className="text-xs font-bold text-muted-foreground">{displayDate}</p>
                    <span className="text-xs text-muted-foreground">{entries.length} trip{entries.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-purple-600">{dayMiles.toFixed(1)} mi</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(dayMiles * IRS_RATE)}</p>
                  </div>
                </button>
                {isExpanded && (
                  <div className="space-y-1.5 ml-1">
                    {entries.map(entry => (
                      <Card key={entry.id} className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{entry.description}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {entry.vehicle_name && <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-0.5"><Truck className="w-2.5 h-2.5" />{entry.vehicle_name}</span>}
                              {entry.author_name && <span className="text-[10px] text-muted-foreground">{entry.author_name}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <p className="text-sm font-bold">{Number(entry.miles).toFixed(1)} mi</p>
                              <p className="text-xs text-purple-600">{formatCurrency(entry.miles * IRS_RATE)}</p>
                            </div>
                            <Button variant="ghost" size="icon" className="h-8 w-8"
                              onClick={() => { if (window.confirm("Delete this trip?")) deleteMutation.mutate(entry.id); }}>
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── TAX SUMMARY TAB ───────────────────────────────────────────────────────────
function TaxSummaryTab({ invoices, expenses, mileage }) {
  const year = new Date().getFullYear();

  const quarters = [
    { label: "Q1 (Jan–Mar)", months: [0, 1, 2] },
    { label: "Q2 (Apr–Jun)", months: [3, 4, 5] },
    { label: "Q3 (Jul–Sep)", months: [6, 7, 8] },
    { label: "Q4 (Oct–Dec)", months: [9, 10, 11] },
  ];

  const getQuarterData = (months) => {
    const qRevenue = invoices.filter(i => {
      if (i.status !== "paid" || !i.paid_date) return false;
      const d = new Date(i.paid_date);
      return d.getFullYear() === year && months.includes(d.getMonth());
    }).reduce((s, i) => s + (i.total || 0), 0);

    const qExpenses = expenses.filter(e => {
      if (!e.date) return false;
      const d = new Date(e.date);
      return d.getFullYear() === year && months.includes(d.getMonth());
    }).reduce((s, e) => s + (e.amount || 0), 0);

    const qMiles = mileage.filter(m => {
      if (!m.date) return false;
      const d = new Date(m.date);
      return d.getFullYear() === year && months.includes(d.getMonth());
    }).reduce((s, m) => s + (m.miles || 0), 0);

    const mileageDeduction = qMiles * IRS_MILEAGE_RATE;
    const netProfit = qRevenue - qExpenses - mileageDeduction;
    return { qRevenue, qExpenses, qMiles, mileageDeduction, netProfit };
  };

  const yearRevenue = invoices.filter(i => i.status === "paid" && i.paid_date && new Date(i.paid_date).getFullYear() === year).reduce((s, i) => s + (i.total || 0), 0);
  const yearExpenses = expenses.filter(e => e.date && new Date(e.date).getFullYear() === year).reduce((s, e) => s + (e.amount || 0), 0);
  const yearMiles = mileage.filter(m => m.date && new Date(m.date).getFullYear() === year).reduce((s, m) => s + (m.miles || 0), 0);
  const yearMileageDeduction = yearMiles * IRS_MILEAGE_RATE;
  const yearNetProfit = yearRevenue - yearExpenses - yearMileageDeduction;

  return (
    <div className="space-y-4">
      <Card className="p-4 border-blue-200 bg-blue-50">
        <p className="text-xs font-bold uppercase tracking-wider text-blue-800 mb-3">{year} Year-to-Date Summary</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Gross Revenue</span><span className="font-semibold text-green-600">{formatCurrency(yearRevenue)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Business Expenses</span><span className="font-semibold text-red-600">− {formatCurrency(yearExpenses)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Mileage Deduction ({yearMiles.toLocaleString()} mi)</span><span className="font-semibold text-red-600">− {formatCurrency(yearMileageDeduction)}</span></div>
          <div className="border-t pt-2 flex justify-between font-bold text-base">
            <span>Est. Net Profit</span>
            <span className={yearNetProfit >= 0 ? "text-blue-700" : "text-red-700"}>{formatCurrency(yearNetProfit)}</span>
          </div>
        </div>
      </Card>

      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Quarterly Breakdown</p>
      {quarters.map(q => {
        const data = getQuarterData(q.months);
        return (
          <Card key={q.label} className="p-3.5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold">{q.label}</p>
              <span className={`text-sm font-bold ${data.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatCurrency(data.netProfit)}
              </span>
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between"><span>Revenue</span><span className="text-green-600 font-medium">{formatCurrency(data.qRevenue)}</span></div>
              <div className="flex justify-between"><span>Expenses</span><span className="text-red-600 font-medium">− {formatCurrency(data.qExpenses)}</span></div>
              <div className="flex justify-between"><span>Mileage ({data.qMiles.toLocaleString()} mi)</span><span className="text-red-600 font-medium">− {formatCurrency(data.mileageDeduction)}</span></div>
            </div>
          </Card>
        );
      })}

      <Card className="p-3.5 border-amber-200 bg-amber-50">
        <p className="text-xs font-bold text-amber-800 mb-1">⚠ Important Note</p>
        <p className="text-xs text-amber-700 leading-relaxed">
          These figures are estimates for planning purposes only. Self-employment tax (~15.3%), deductible business expenses, and other factors will affect your actual tax liability. Share these numbers with your accountant for accurate quarterly estimated tax payments.
        </p>
      </Card>
    </div>
  );
}

// ─── MAIN FINANCE PAGE ─────────────────────────────────────────────────────────
export default function Finance() {
  const { settings = {} } = useSettings() || {};
  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => db.Invoice.list("-created_date", 500),
  });
  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses"],
    queryFn: () => db.Expense.list("-date", 500),
  });
  const { data: mileage = [] } = useQuery({
    queryKey: ["mileage"],
    queryFn: () => db.MileageLog.list("-date", 500),
  });
  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => db.Vehicle.list("name"),
  }); // still needed for MileageTab
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => db.Customer.list("name"),
  });
  const { data: financeJobs = [] } = useQuery({
    queryKey: ["jobs"],
    queryFn: () => db.Job.list("-created_date", 500),
  });

  return (
    <div>
      <PageHeader title="Finance" subtitle="Revenue, expenses & tax summary" back="/" />
      <div className="px-4 pt-3 pb-4 max-w-lg mx-auto">
        <Tabs defaultValue="overview">
          <div className="overflow-x-auto mb-4 -mx-1 px-1">
            <TabsList className="inline-flex w-max bg-muted/60 rounded-xl p-0.5 min-w-full">
              <TabsTrigger value="overview" className="text-xs rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm px-3">
                <DollarSign className="w-3 h-3 mr-1" />Overview
              </TabsTrigger>
              <TabsTrigger value="expenses" className="text-xs rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm px-3">
                <TrendingDown className="w-3 h-3 mr-1" />Expenses
              </TabsTrigger>
              <TabsTrigger value="mileage" className="text-xs rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm px-3">
                <Car className="w-3 h-3 mr-1" />Miles
              </TabsTrigger>
              <TabsTrigger value="tax" className="text-xs rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm px-3">
                <FileText className="w-3 h-3 mr-1" />Tax
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="overview"><OverviewTab invoices={invoices} expenses={expenses} mileage={mileage} jobs={financeJobs} /></TabsContent>
          <TabsContent value="expenses"><ExpensesTab expenses={expenses} /></TabsContent>
          <TabsContent value="mileage"><MileageTab mileage={mileage} vehicles={vehicles} customers={customers} homeAddress={settings.home_address} googleApiKey={settings.google_maps_api_key} /></TabsContent>
          <TabsContent value="tax"><TaxSummaryTab invoices={invoices} expenses={expenses} mileage={mileage} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}