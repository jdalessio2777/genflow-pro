import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { integrationsCore } from "@/lib/coreIntegrations";
import { quoteEmailHTML } from "@/lib/emailTemplates";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import PageHeader from "@/components/layout/PageHeader";
import { Search, UserPlus, X, Plus, Trash2, Send, Loader2, Package, Clock, Zap, Wrench, ChevronLeft } from "lucide-react";
import { formatCurrency } from "@/lib/utils/format";
import { toast } from "sonner";

const ITEM_FOLDERS = [
  { key: "parts", label: "Parts", icon: Package, color: "bg-blue-100 text-blue-700" },
  { key: "labor", label: "Labor Rates", icon: Clock, color: "bg-amber-100 text-amber-700" },
  { key: "flat_rates", label: "Flat Rates", icon: Zap, color: "bg-purple-100 text-purple-700" },
  { key: "maintenance", label: "Maintenance", icon: Wrench, color: "bg-green-100 text-green-700" },
];

export default function QuoteBuilder() {
  const navigate = useNavigate();

  // Customer / prospect
  const [customerId, setCustomerId] = useState(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [prospect, setProspect] = useState({ name: "", phone: "", email: "", address: "" });

  // Line items (local until sent)
  const [lineItems, setLineItems] = useState([]); // { id (local), type, description, quantity, unit_price, total_price, source_part_id, source_labor_rate_id }
  const [folder, setFolder] = useState(null);
  const [partSearch, setPartSearch] = useState("");
  const [customLine, setCustomLine] = useState({ description: "", amount: "" });
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => db.Customer.list("name"),
  });

  const { data: parts = [] } = useQuery({
    queryKey: ["parts-catalog"],
    queryFn: () => db.Part.list("name"),
  });

  const { data: rates = [] } = useQuery({
    queryKey: ["labor-rates"],
    queryFn: () => db.LaborRate.list("name"),
  });

  const selectedCustomer = customers.find(c => c.id === customerId);
  const filteredCustomers = customerSearch.trim()
    ? customers.filter(c => c.name?.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone?.includes(customerSearch))
    : [];

  const hasRecipient = selectedCustomer ? !!selectedCustomer.email : !!prospect.email;
  const recipientName = selectedCustomer?.name || prospect.name;
  const canSend = !!recipientName && hasRecipient && lineItems.length > 0;

  const addLine = (item) => setLineItems(prev => [...prev, { ...item, id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}` }]);
  const removeLine = (id) => setLineItems(prev => prev.filter(l => l.id !== id));

  const addPart = (p) => addLine({
    type: "part", description: p.name, quantity: 1, unit_price: p.price || 0, total_price: p.price || 0, source_part_id: p.id,
  });

  const addRate = (r) => {
    if (r.type === "hourly") {
      addLine({ type: "labor", description: `${r.name} (1h)`, quantity: 1, unit_price: r.rate || 0, total_price: r.rate || 0, source_labor_rate_id: r.id });
    } else {
      addLine({ type: "labor", description: r.name, quantity: 1, unit_price: r.flat_price || 0, total_price: r.flat_price || 0, source_labor_rate_id: r.id });
    }
  };

  const addCustom = () => {
    const amount = parseFloat(customLine.amount);
    if (!customLine.description.trim() || isNaN(amount)) { toast.error("Enter a description and amount"); return; }
    addLine({ type: "custom", description: customLine.description.trim(), quantity: 1, unit_price: amount, total_price: amount });
    setCustomLine({ description: "", amount: "" });
  };

  const total = lineItems.reduce((s, l) => s + (l.total_price || 0), 0);

  const hourlyRates = rates.filter(r => r.type === "hourly");
  const flatRates = rates.filter(r => r.type === "flat_rate" && r.category !== "maintenance");
  const maintenanceRates = rates.filter(r => r.type === "flat_rate" && r.category === "maintenance");
  const filteredParts = partSearch.trim()
    ? parts.filter(p => p.name?.toLowerCase().includes(partSearch.toLowerCase()) || p.part_number?.toLowerCase().includes(partSearch.toLowerCase())).slice(0, 25)
    : [];

  const sendMutation = useMutation({
    mutationFn: async () => {
      // 1. Create the quote row
      const quote = await db.Quote.create({
        customer_id: customerId || null,
        customer_name: recipientName || null,
        prospect_name: customerId ? null : prospect.name,
        prospect_phone: customerId ? null : prospect.phone,
        prospect_email: customerId ? null : prospect.email,
        prospect_address: customerId ? null : prospect.address,
        status: "draft",
        notes: notes || null,
      });

      // 2. Attach line items
      await Promise.all(lineItems.map(l => db.QuoteLineItem.create({
        quote_id: quote.id,
        type: l.type,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        total_price: l.total_price,
        source_part_id: l.source_part_id || null,
        source_labor_rate_id: l.source_labor_rate_id || null,
      })));

      // 3. Send the email — reuses the existing quote email template + Resend infra.
      // No approveUrl: this flow has no customer-facing approval link (staff mark
      // Approved/Declined manually after a call), so the template's CTA falls back
      // to a "we'll follow up" message instead of the approve button.
      const customerForEmail = selectedCustomer || {
        name: prospect.name, email: prospect.email, phone: prospect.phone, address: prospect.address,
      };
      const recipientEmail = selectedCustomer?.email || prospect.email;
      const emailLineItems = lineItems.map(l => ({
        description: l.description,
        qty: l.type === "part" ? `×${l.quantity}` : "—",
        amount: l.total_price,
      }));

      await integrationsCore.SendEmailWithRetry({
        to: recipientEmail,
        subject: `Your Service Quote — GenShield Generator Service`,
        html: quoteEmailHTML({
          customer: customerForEmail,
          job: { id: quote.id, job_type: null },
          lineItems: emailLineItems,
          subtotal: total,
          discount: 0,
          total,
          // approveUrl intentionally omitted — no approval link in this flow
        }),
      });

      const sentQuote = await db.Quote.update(quote.id, { status: "sent", sent_at: new Date().toISOString() });
      return sentQuote;
    },
    onSuccess: (quote) => {
      toast.success(`Quote sent to ${recipientName}`);
      navigate(`/quotes/${quote.id}`);
    },
    onError: (e) => {
      toast.error(`Failed to send quote: ${e.message}`);
    },
  });

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await sendMutation.mutateAsync();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="pb-28">
      <PageHeader title="New Quote" subtitle="Build a quote for an existing customer or a new prospect" back="/" />

      <div className="p-4 space-y-4 max-w-lg mx-auto">

        {/* ── Customer / Prospect ── */}
        <Card className="p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Customer</p>

          {selectedCustomer ? (
            <div className="flex items-center justify-between gap-2 bg-muted/30 rounded-xl px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{selectedCustomer.name}</p>
                <p className="text-xs text-muted-foreground truncate">{selectedCustomer.email || "No email on file"}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setCustomerId(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : showQuickAdd ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground">New Prospect</p>
                <button className="text-xs text-primary font-medium" onClick={() => setShowQuickAdd(false)}>Cancel</button>
              </div>
              <Input placeholder="Name *" value={prospect.name} onChange={e => setProspect(p => ({ ...p, name: e.target.value }))} className="rounded-xl" />
              <Input placeholder="Phone" value={prospect.phone} onChange={e => setProspect(p => ({ ...p, phone: e.target.value }))} className="rounded-xl" />
              <Input placeholder="Email *" type="email" value={prospect.email} onChange={e => setProspect(p => ({ ...p, email: e.target.value }))} className="rounded-xl" />
              <Input placeholder="Address" value={prospect.address} onChange={e => setProspect(p => ({ ...p, address: e.target.value }))} className="rounded-xl" />
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search existing customers..."
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  className="pl-9 rounded-xl"
                />
              </div>
              {filteredCustomers.length > 0 && (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {filteredCustomers.slice(0, 8).map(c => (
                    <button key={c.id} onClick={() => { setCustomerId(c.id); setCustomerSearch(""); }} className="w-full text-left">
                      <div className="px-3 py-2 rounded-xl hover:bg-muted/50 flex items-center justify-between">
                        <span className="text-sm font-medium">{c.name}</span>
                        <span className="text-xs text-muted-foreground">{c.phone}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <Button variant="outline" className="w-full rounded-xl gap-1.5" onClick={() => setShowQuickAdd(true)}>
                <UserPlus className="w-4 h-4" /> New Prospect (not a customer yet)
              </Button>
            </>
          )}
        </Card>

        {/* ── Line items ── */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Line Items</p>
            {folder && (
              <button onClick={() => setFolder(null)} className="flex items-center gap-1 text-xs text-primary font-medium">
                <ChevronLeft className="w-3.5 h-3.5" /> Back
              </button>
            )}
          </div>

          {!folder && (
            <div className="grid grid-cols-2 gap-2">
              {ITEM_FOLDERS.map(f => {
                const Icon = f.icon;
                return (
                  <button key={f.key} onClick={() => setFolder(f.key)} className="text-left">
                    <div className={`rounded-xl p-3 flex items-center gap-2 ${f.color}`}>
                      <Icon className="w-4 h-4" />
                      <span className="text-xs font-semibold">{f.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {folder === "parts" && (
            <div className="space-y-2">
              <Input placeholder="Search parts by name or #..." value={partSearch} onChange={e => setPartSearch(e.target.value)} className="rounded-xl" />
              {filteredParts.map(p => (
                <button key={p.id} onClick={() => addPart(p)} className="w-full text-left">
                  <div className="px-3 py-2 rounded-xl hover:bg-muted/50 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      {p.part_number && <p className="text-xs text-muted-foreground">#{p.part_number}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold">{formatCurrency(p.price)}</span>
                      <Plus className="w-4 h-4 text-primary" />
                    </div>
                  </div>
                </button>
              ))}
              {partSearch.trim() && filteredParts.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No matching parts</p>
              )}
            </div>
          )}

          {folder === "labor" && (
            <div className="space-y-2">
              {hourlyRates.map(r => (
                <button key={r.id} onClick={() => addRate(r)} className="w-full text-left">
                  <div className="px-3 py-2 rounded-xl hover:bg-muted/50 flex items-center justify-between">
                    <span className="text-sm font-medium">{r.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{formatCurrency(r.rate)}/hr</span>
                      <Plus className="w-4 h-4 text-primary" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {folder === "flat_rates" && (
            <div className="space-y-2">
              {flatRates.map(r => (
                <button key={r.id} onClick={() => addRate(r)} className="w-full text-left">
                  <div className="px-3 py-2 rounded-xl hover:bg-muted/50 flex items-center justify-between">
                    <span className="text-sm font-medium">{r.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{formatCurrency(r.flat_price)}</span>
                      <Plus className="w-4 h-4 text-primary" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {folder === "maintenance" && (
            <div className="space-y-2">
              {maintenanceRates.map(r => (
                <button key={r.id} onClick={() => addRate(r)} className="w-full text-left">
                  <div className="px-3 py-2 rounded-xl hover:bg-muted/50 flex items-center justify-between">
                    <span className="text-sm font-medium">{r.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{formatCurrency(r.flat_price)}</span>
                      <Plus className="w-4 h-4 text-primary" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Custom / one-off line — always available, for site-dependent install pricing */}
          <div className="pt-2 border-t border-border space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Custom line (e.g. site-dependent install)</p>
            <div className="flex gap-2">
              <Input placeholder="Description" value={customLine.description} onChange={e => setCustomLine(c => ({ ...c, description: e.target.value }))} className="rounded-xl flex-1" />
              <Input placeholder="$" type="number" step="0.01" value={customLine.amount} onChange={e => setCustomLine(c => ({ ...c, amount: e.target.value }))} className="rounded-xl w-24" />
              <Button size="icon" className="rounded-xl shrink-0" onClick={addCustom}><Plus className="w-4 h-4" /></Button>
            </div>
          </div>

          {/* Added items */}
          {lineItems.length > 0 && (
            <div className="pt-2 border-t border-border space-y-2">
              {lineItems.map(l => (
                <div key={l.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{l.description}</p>
                    <p className="text-xs text-muted-foreground capitalize">{l.type}</p>
                  </div>
                  <span className="text-sm font-semibold shrink-0">{formatCurrency(l.total_price)}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeLine(l.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 mt-1 border-t border-border">
                <span className="text-sm font-semibold">Total</span>
                <span className="text-lg font-bold text-primary">{formatCurrency(total)}</span>
              </div>
            </div>
          )}
        </Card>

        {/* ── Notes ── */}
        <Card className="p-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notes (internal)</p>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Scope of work, site conditions, anything worth remembering..." className="rounded-xl resize-none" rows={3} />
        </Card>
      </div>

      {/* Sticky send bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-xl border-t border-border p-4">
        <div className="max-w-lg mx-auto">
          {!hasRecipient && recipientName && (
            <p className="text-xs text-destructive mb-2 text-center">No email on file for {recipientName} — add one to send</p>
          )}
          <Button className="w-full rounded-xl gap-2 h-12 text-sm font-semibold" disabled={!canSend || sending} onClick={handleSend}>
            {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : <><Send className="w-4 h-4" /> Send Quote{total > 0 ? ` — ${formatCurrency(total)}` : ""}</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
