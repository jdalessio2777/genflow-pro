import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { useAuth } from "@/lib/AuthContext";
import { getUserDisplayName } from "@/lib/userColors";
import { notifyTeam, buildTable, buildRow, buildEventBadge } from "@/lib/notifyTeam";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import PageHeader from "@/components/layout/PageHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function CustomerForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = !!id;
  const { user } = useAuth();

  const [form, setForm] = useState({
    name: "", email: "", phone: "", address: "",
    property_notes: "", generator_model: "", generator_serial: "",
    generator_install_date: "", service_interval: "", notes: "", status: "active",
    membership_plan: "", membership_start: "", membership_expiry: "",
    membership_signed: false, credit_card_on_file: false, repeat_note: "", referred_by: "",
  });

  const { isLoading: loadingCustomer } = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const customers = await db.Customer.filter({ id });
      if (customers.length > 0) setForm(prev => ({ ...prev, ...customers[0] }));
      return customers[0];
    },
    enabled: isEdit,
  });

  const mutation = useMutation({
    mutationFn: (data) => isEdit
      ? db.Customer.update(id, data)
      : db.Customer.create(data),
    onSuccess: () => {
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
              buildRow("Generator", form.generator_model),
              buildRow("Referred By", form.referred_by),
            ])}
          `,
          triggeredBy: getUserDisplayName(user),
        });
      }
      navigate("/customers");
    },
  });

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    mutation.mutate(form);
  };

  if (loadingCustomer) return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div>
      <PageHeader title={isEdit ? "Edit Customer" : "New Customer"} back="/customers" />

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
              <Textarea value={form.property_notes} onChange={e => update("property_notes", e.target.value)} className="rounded-xl mt-1" rows={2} />
            </div>
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          <h3 className="text-sm font-semibold">Generator Info</h3>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Model</Label>
              <Input value={form.generator_model} onChange={e => update("generator_model", e.target.value)} className="rounded-xl mt-1" />
            </div>
            <div>
              <Label className="text-xs">Serial Number</Label>
              <Input value={form.generator_serial} onChange={e => update("generator_serial", e.target.value)} className="rounded-xl mt-1" />
            </div>
            <div>
              <Label className="text-xs">Install Date</Label>
              <Input value={form.generator_install_date} onChange={e => update("generator_install_date", e.target.value)} type="date" className="rounded-xl mt-1" />
            </div>
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

        <Card className="p-4 space-y-3">
          <div>
            <Label className="text-xs flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              Always-Show Note (appears on every job)
            </Label>
            <Textarea
              value={form.repeat_note || ""}
              onChange={e => update("repeat_note", e.target.value)}
              className="rounded-xl mt-1 border-amber-200 bg-amber-50/50"
              rows={2}
              placeholder="e.g. Dog in backyard · Gate code: 1234 · Generator is behind shed"
            />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={e => update("notes", e.target.value)} className="rounded-xl mt-1" rows={3} />
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

        <Button type="submit" className="w-full rounded-xl gap-2 h-12" disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isEdit ? "Save Changes" : "Create Customer"}
        </Button>
      </form>
    </div>
  );
}