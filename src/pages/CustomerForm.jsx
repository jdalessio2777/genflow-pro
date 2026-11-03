import { useState, useEffect } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { goBack } from "@/hooks/useBack";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db, markServiceRequestContacted } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";
import { getUserDisplayName } from "@/lib/userColors";
import { notifyTeam, buildTable, buildRow, buildEventBadge } from "@/lib/notifyTeam";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LongTextField from "@/components/ui/LongTextField";
import { markDraftsSaved } from "@/lib/textDrafts";
import { generatorLine } from "@/lib/generatorInfo";
import { newRequestId } from "@/lib/saveSafety";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import PageHeader from "@/components/layout/PageHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import GeneratorFields from "@/components/customers/GeneratorFields";
import { Save, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const MAIN_GENERATOR_COLUMNS = {
  brand: "generator_brand", kw: "generator_kw", model: "generator_model", serial: "generator_serial",
  install_date: "generator_install_date", cooling: "generator_cooling",
};

export default function CustomerForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const isEdit = !!id;
  const { user } = useAuth();
  const leadId = searchParams.get("lead_id");

  const [form, setForm] = useState(() => ({
    name: searchParams.get("name") || "", email: searchParams.get("email") || "",
    phone: searchParams.get("phone") || "", address: searchParams.get("address") || "",
    property_notes: "", generator_brand: "", generator_kw: "", generator_model: "", generator_serial: "",
    generator_install_date: "", generator_cooling: "", extra_generators: [], service_interval: "", notes: "", status: "active",
    membership_plan: "", membership_start: "", membership_expiry: "",
    membership_signed: false, credit_card_on_file: false, repeat_note: "", referred_by: "",
  }));
  // True once the real customer record has actually been applied to `form`
  // (set in the effect below). Kept as defense-in-depth so Save can't fire
  // against blank name/phone/email/address fields even if the query's data
  // is momentarily stale/undefined after mount.
  const [customerLoaded, setCustomerLoaded] = useState(!isEdit);

  const { data: customerData, isLoading: loadingCustomer } = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const customers = await db.Customer.filter({ id });
      return customers[0];
    },
    enabled: isEdit,
  });

  // Derive form state from settled query data rather than as a side effect
  // inside queryFn — queryFn only re-runs on refetch, but `data` reflects the
  // cache immediately (including on a warm cache from another view of this
  // same customer), so this closes the gap where the form could render with
  // its blank initial state while a stale-but-loaded cache entry was present.
  useEffect(() => {
    if (customerData) {
      setForm(prev => ({ ...prev, ...customerData, referred_by: customerData.referral_source || "" }));
      setCustomerLoaded(true);
    }
  }, [customerData]);

  const cleanPayload = (data) => {
    const allowedFields = [
      'name', 'phone', 'email', 'address',
      'generator_brand', 'generator_kw', 'generator_model', 'generator_serial',
      'generator_install_date', 'generator_cooling', 'extra_generators', 'service_interval',
      'last_service_date', 'membership_plan', 'membership_start',
      'membership_expiry', 'membership_signed', 'membership_signature',
      'repeat_note', 'property_notes', 'credit_card_on_file', 'notes'
    ];
    const nullableFields = [
      'last_service_date', 'membership_start', 'membership_expiry',
      'membership_plan', 'service_interval', 'membership_signature',
      'credit_card_on_file', 'generator_brand', 'generator_kw', 'generator_install_date',
      'generator_cooling'
    ];
    const out = {};
    allowedFields.forEach(f => {
      if (data[f] !== undefined) {
        out[f] = nullableFields.includes(f) && data[f] === '' ? null : data[f];
      }
    });
    if (data.referred_by !== undefined) out.referral_source = data.referred_by || null;
    return out;
  };

  const mutation = useMutation({
    mutationFn: (data) => isEdit
      ? db.Customer.update(id, cleanPayload(data))
      : db.Customer.create(cleanPayload(data)),
    onError: (err) => {
      console.error("Customer save failed:", err);
      toast.error(err?.message ?? "Failed to save customer");
    },
    onSuccess: (result) => {
      markDraftsSaved(draftPrefix);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success(isEdit ? "Customer updated" : "Customer created");
      if (!isEdit) {
        notifyTeam({
          subject: `New Customer — ${form.name}`,
          body: `
            <p style="font-size:14px;color:#1a1a1a;margin:0 0 4px 0;">${buildEventBadge("New Customer", "green")}</p>
            <p style="font-size:13px;color:#444;margin:8px 0 0 0;">A new customer has been added to GenFlow Pro.</p>
            ${buildTable([
              buildRow("Name", form.name),
              buildRow("Phone", form.phone),
              buildRow("Address", form.address),
              buildRow("Generator", generatorLine(form)),
              buildRow("Referred By", form.referred_by),
            ])}
          `,
          triggeredBy: getUserDisplayName(user),
        });
        if (leadId) {
          markServiceRequestContacted(leadId)
            .then(() => queryClient.invalidateQueries({ queryKey: ["service-requests-inbox"] }))
            .catch((err) => console.warn("Failed to mark lead as contacted:", err));
        }
        // Replace: the finished form never reappears on back (F-06).
        navigate(`/customers/${result.id}`, { replace: true });
      } else {
        goBack(navigate, location, `/customers/${id}`);
      }
    },
  });

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  const setExtra = (fn) => setForm(prev => ({ ...prev, extra_generators: fn(prev.extra_generators || []) }));
  const updateExtra = (genId, key, value) => setExtra(extras => extras.map(g => (g.id === genId ? { ...g, [key]: value } : g)));
  // Local drafts of the long text fields (Run 8, A4), per customer.
  const draftPrefix = isEdit ? `customer:${id}:` : "customer:new:";
  const savedText = (field) => (isEdit ? customerData?.[field] ?? "" : "");
  const longText = (field, title, extra = {}) => (
    <LongTextField
      value={form[field] || ""}
      onChange={v => update(field, v)}
      savedValue={savedText(field)}
      draftKey={`${draftPrefix}${field}`}
      ready={customerLoaded}
      title={title}
      rows={5}
      {...extra}
    />
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!customerLoaded) { toast.error("Still loading customer data — please wait a moment and try again"); return; }
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    mutation.mutate(form);
  };

  if (loadingCustomer) return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div>
      <PageHeader title={isEdit ? "Edit Customer" : "New Customer"} back />

      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <Card className="p-4 space-y-4">
          <h3 className="text-sm font-semibold">Contact Info</h3>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name *</Label>
              <Input value={form.name} onChange={e => update("name", e.target.value)} className="rounded-xl mt-1" />
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input value={form.phone} onChange={e => update("phone", e.target.value)} type="tel" className="rounded-xl mt-1" />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input value={form.email} onChange={e => update("email", e.target.value)} type="email" className="rounded-xl mt-1" />
            </div>
            <div>
              <Label className="text-xs">Address</Label>
              <Input value={form.address} onChange={e => update("address", e.target.value)} className="rounded-xl mt-1" />
            </div>
            <div>
              <Label className="text-xs">Property Notes</Label>
              <div className="mt-1">{longText("property_notes", "Property Notes")}</div>
            </div>
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          <h3 className="text-sm font-semibold">Generator Info</h3>
          <div className="space-y-3">
            <GeneratorFields
              value={{ brand: form.generator_brand, kw: form.generator_kw, model: form.generator_model, serial: form.generator_serial, install_date: form.generator_install_date, cooling: form.generator_cooling }}
              onChange={(key, v) => update(MAIN_GENERATOR_COLUMNS[key], v)}
            />
            <div>
              <Label className="text-xs">Service Interval</Label>
              <Select value={form.service_interval || ""} onValueChange={v => update("service_interval", v)}>
                <SelectTrigger className="rounded-xl mt-1">
                  <SelectValue placeholder="Select interval..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="6_months">Every 6 Months</SelectItem>
                  <SelectItem value="12_months">Every 12 Months (Annual)</SelectItem>
                  <SelectItem value="24_months">Every 24 Months</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* A customer with a second generator (A4): each visit then picks which one it's for. */}
        {(form.extra_generators || []).map((gen, i) => (
          <Card key={gen.id} className="p-4 space-y-4" data-testid={`extra-generator-${i}`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Generator {i + 2}</h3>
              <button type="button" aria-label={`Remove generator ${i + 2}`} className="min-h-11 min-w-11 flex items-center justify-center text-muted-foreground"
                onClick={() => { if (window.confirm(`Remove generator ${i + 2} from this customer?`)) setExtra(extras => extras.filter(g => g.id !== gen.id)); }}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div>
              <Label className="text-xs">Name (shown when picking it for a visit)</Label>
              <Input value={gen.label || ""} placeholder="e.g. Pool house" onChange={e => updateExtra(gen.id, "label", e.target.value)} className="rounded-xl mt-1" />
            </div>
            <GeneratorFields value={gen} onChange={(key, v) => updateExtra(gen.id, key, v)} testPrefix={`gen${i + 2}`} />
          </Card>
        ))}
        <Button type="button" variant="outline" className="w-full rounded-xl gap-2" data-testid="add-generator"
          onClick={() => setExtra(extras => [...extras, { id: newRequestId(), label: "" }])}>
          <Plus className="w-4 h-4" /> Add another generator
        </Button>

        <Card className="p-4 space-y-3">
          <div>
            <Label className="text-xs flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              Always-Show Note (appears on every job)
            </Label>
            <div className="mt-1">{longText("repeat_note", "Always-Show Note", { className: "border-amber-200 bg-amber-50/50", placeholder: "e.g. Dog in backyard · Gate code: 1234 · Generator is behind shed" })}</div>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <div className="mt-1">{longText("notes", "Notes")}</div>
          </div>
          <div>
            <Label className="text-xs">Referred By</Label>
            <Input
              value={form.referred_by || ""}
              onChange={e => update("referred_by", e.target.value)}
              className="rounded-xl mt-1"
              placeholder="e.g. Don Grennon, Google Search, Door hanger, Facebook"
            />
            <p className="text-xs text-muted-foreground mt-1">How did this customer find us?</p>
          </div>
        </Card>

        <Button type="submit" className="w-full rounded-xl gap-2 h-12" disabled={mutation.isPending || !customerLoaded}>
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isEdit ? "Save Changes" : "Create Customer"}
        </Button>
      </form>
    </div>
  );
}