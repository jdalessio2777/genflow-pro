import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { integrationsCore } from "@/lib/coreIntegrations";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, FileText, CheckCircle2, Send, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { formatCurrency } from "@/lib/utils/format";
import { invoiceSummaryHTML, checklistSummaryHTML, combineEmailSections } from "@/lib/emailTemplates";
import { toast } from "sonner";

export default function InvoicePDF() {
  const { id } = useParams();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [includeInvoice, setIncludeInvoice] = useState(true);
  const [includedDocs, setIncludedDocs] = useState({});

  const { data: invoice } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => { const r = await db.Invoice.filter({ id }); return r[0]; },
  });

  const { data: customer } = useQuery({
    queryKey: ["customer", invoice?.customer_id],
    queryFn: async () => { const r = await db.Customer.filter({ id: invoice.customer_id }); return r[0]; },
    enabled: !!invoice?.customer_id,
  });

  const { data: jobDocs = [] } = useQuery({
    queryKey: ["job-docs-for-invoice", invoice?.job_id],
    queryFn: () => db.JobDocument.filter({ job_id: invoice.job_id }),
    enabled: !!invoice?.job_id,
  });

  const completedDocs = jobDocs.filter(d => d.status === "completed");

  const handleSend = async () => {
    if (!invoice || !customer?.email) { toast.error("No email on file for this customer"); return; }
    if (!includeInvoice && !Object.values(includedDocs).some(Boolean)) {
      toast.error("Select at least one item to include");
      return;
    }
    setSending(true);
    try {
      const bodyParts = [];
      if (includeInvoice) bodyParts.push(invoiceSummaryHTML({ invoice, customer }));
      completedDocs.forEach(doc => { if (includedDocs[doc.id]) bodyParts.push(checklistSummaryHTML(doc)); });

      const fullHTML = combineEmailSections(bodyParts);

      const subjectParts = [];
      if (includeInvoice) subjectParts.push(`Invoice ${invoice.invoice_number}`);
      if (Object.values(includedDocs).some(Boolean)) subjectParts.push("Service Report");
      const subject = subjectParts.join(" & ") + " — GenShield";

      await integrationsCore.SendEmail({
        to: customer.email,
        subject,
        html: fullHTML,
      });

      setSent(true);
      toast.success(`Email sent to ${customer.email}`);
    } catch (e) {
      toast.error(e.message || "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  if (!invoice) return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const nothingSelected = !includeInvoice && !Object.values(includedDocs).some(Boolean);

  return (
    <div>
      <div className="flex items-center gap-3 p-4 border-b sticky top-0 bg-background/90 backdrop-blur-xl z-40">
        <Link to={`/invoices/${id}`}>
          <Button variant="ghost" size="icon" className="rounded-xl h-9 w-9"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{invoice.invoice_number}</p>
          <p className="text-xs text-muted-foreground">{invoice.customer_name}</p>
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">What to include</p>
          <div className="space-y-2">
            <button onClick={() => setIncludeInvoice(!includeInvoice)}
              className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-colors text-left ${includeInvoice ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${includeInvoice ? "border-primary bg-primary" : "border-muted-foreground"}`}>
                {includeInvoice && <CheckCircle2 className="w-3 h-3 text-white" />}
              </div>
              <div>
                <p className="text-sm font-semibold">Invoice</p>
                <p className="text-xs text-muted-foreground">Line items, totals, payment info · {formatCurrency((invoice.parts_total || 0) + (invoice.labor_total || 0) + (invoice.tax_amount || 0) + (invoice.surcharge_amount || 0))}</p>
              </div>
            </button>

            {completedDocs.map(doc => (
              <button key={doc.id}
                onClick={() => setIncludedDocs(prev => ({ ...prev, [doc.id]: !prev[doc.id] }))}
                className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-colors text-left ${includedDocs[doc.id] ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${includedDocs[doc.id] ? "border-primary bg-primary" : "border-muted-foreground"}`}>
                  {includedDocs[doc.id] && <CheckCircle2 className="w-3 h-3 text-white" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <p className="text-sm font-semibold truncate">{doc.template_name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground ml-5">Completed service checklist</p>
                </div>
              </button>
            ))}

            {completedDocs.length === 0 && (
              <p className="text-xs text-muted-foreground px-1">No completed service documents for this job</p>
            )}
          </div>
        </div>

        {customer?.email ? (
          <Card className="p-3 bg-muted/30">
            <p className="text-xs text-muted-foreground">Sending to</p>
            <p className="text-sm font-semibold">{customer.email}</p>
          </Card>
        ) : (
          <Card className="p-3 border-amber-200 bg-amber-50">
            <p className="text-xs font-semibold text-amber-800">⚠ No email on file</p>
            <p className="text-xs text-amber-700 mt-0.5">Add an email address to the customer record first</p>
          </Card>
        )}

        {!sent ? (
          <Button className="w-full rounded-xl h-12 gap-2" onClick={handleSend} disabled={sending || nothingSelected || !customer?.email}>
            {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : <><Send className="w-4 h-4" /> Send Email</>}
          </Button>
        ) : (
          <div className="space-y-2">
            <Card className="p-4 border-green-200 bg-green-50">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <div>
                  <p className="text-sm font-bold text-green-800">Email Sent</p>
                  <p className="text-xs text-green-700">{customer?.email}</p>
                </div>
              </div>
            </Card>
            <Button variant="outline" className="w-full rounded-xl h-10 text-sm" onClick={() => { setSent(false); handleSend(); }}>
              Resend
            </Button>
          </div>
        )}

        {nothingSelected && !sent && (
          <p className="text-xs text-muted-foreground text-center">Select at least one item above to send</p>
        )}
      </div>
    </div>
  );
}