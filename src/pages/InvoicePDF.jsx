import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { integrationsCore } from "@/lib/coreIntegrations";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, FileText, CheckCircle2, Send, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { formatCurrency, formatDate } from "@/lib/utils/format";
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

  const buildInvoiceHTML = () => {
    const lineItemsHTML = (invoice.line_items || []).map((item, i) => `
      <tr style="background:${i % 2 === 0 ? "#f8f9fa" : "white"};">
        <td style="padding:9px 12px;font-size:13px;">${item.description}</td>
        <td style="padding:9px 12px;font-size:13px;text-align:center;">${item.quantity}</td>
        <td style="padding:9px 12px;font-size:13px;text-align:right;">${formatCurrency(item.unit_price)}</td>
        <td style="padding:9px 12px;font-size:13px;text-align:right;font-weight:600;">${formatCurrency(item.total)}</td>
      </tr>`).join("");

    const signatureHTML = invoice.customer_signature
      ? `<div style="margin-top:20px;border-top:1px solid #ddd;padding-top:14px;">
           <p style="font-size:11px;color:#888;margin:0 0 8px 0;">CUSTOMER SIGNATURE</p>
           <img src="${invoice.customer_signature}" style="max-height:56px;border:1px solid #eee;border-radius:6px;padding:4px;" />
         </div>`
      : "";

    return `<div>
      <div style="background:#1e3a5f;color:white;padding:22px 24px;border-radius:8px;margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <h1 style="font-size:20px;font-weight:bold;margin:0 0 3px 0;">AJ's Generator Service</h1>
            <p style="font-size:12px;color:#a8c4e0;margin:0;">Professional Generator Service &amp; Maintenance</p>
          </div>
          <div style="text-align:right;">
            <p style="font-size:16px;font-weight:bold;color:#a8c4e0;margin:0;">INVOICE</p>
            <p style="font-size:12px;margin:3px 0 0 0;">${invoice.invoice_number}</p>
            <p style="font-size:11px;color:#a8c4e0;margin:2px 0 0 0;">${formatDate(invoice.created_date)}</p>
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
        <div style="background:#f8f9fa;border-radius:8px;padding:14px;">
          <p style="font-size:10px;font-weight:bold;color:#888;letter-spacing:0.5px;margin:0 0 6px 0;">BILL TO</p>
          <p style="font-size:13px;font-weight:bold;margin:0 0 3px 0;">${customer?.name || invoice.customer_name}</p>
          ${customer?.address ? `<p style="font-size:12px;color:#555;margin:0 0 2px 0;">${customer.address}</p>` : ""}
          ${customer?.phone ? `<p style="font-size:12px;color:#555;margin:0;">${customer.phone}</p>` : ""}
        </div>
        <div style="background:#f8f9fa;border-radius:8px;padding:14px;">
          <p style="font-size:10px;font-weight:bold;color:#888;letter-spacing:0.5px;margin:0 0 6px 0;">GENERATOR</p>
          <p style="font-size:13px;font-weight:600;margin:0 0 3px 0;">${customer?.generator_model || "—"}</p>
          ${customer?.generator_serial ? `<p style="font-size:12px;color:#555;margin:0 0 6px 0;">S/N: ${customer.generator_serial}</p>` : ""}
          <p style="font-size:12px;font-weight:bold;margin:0;color:${invoice.paid_date ? "#16a34a" : "#d97706"};">
            ${invoice.paid_date ? `PAID — ${formatDate(invoice.paid_date)}` : "PAYMENT DUE"}
          </p>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <thead>
          <tr style="background:#1e3a5f;color:white;">
            <th style="padding:9px 12px;text-align:left;font-size:12px;">Description</th>
            <th style="padding:9px 12px;text-align:center;font-size:12px;">Qty</th>
            <th style="padding:9px 12px;text-align:right;font-size:12px;">Rate</th>
            <th style="padding:9px 12px;text-align:right;font-size:12px;">Amount</th>
          </tr>
        </thead>
        <tbody>${lineItemsHTML}</tbody>
      </table>
      <div style="display:flex;justify-content:flex-end;margin-bottom:16px;">
        <div style="min-width:200px;">
          <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px;border-bottom:1px solid #eee;"><span style="color:#555;">Parts</span><span>${formatCurrency(invoice.parts_total)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px;border-bottom:1px solid #eee;"><span style="color:#555;">Labor</span><span>${formatCurrency(invoice.labor_total)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:9px 0;font-size:15px;font-weight:bold;border-top:2px solid #1e3a5f;margin-top:3px;"><span>Total</span><span style="color:#1e3a5f;">${formatCurrency(invoice.total)}</span></div>
        </div>
      </div>
      ${invoice.notes ? `<div style="background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:16px;"><p style="font-size:10px;font-weight:bold;color:#888;margin:0 0 5px 0;">SERVICE NOTES</p><p style="font-size:13px;color:#333;margin:0;">${invoice.notes}</p></div>` : ""}
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin-bottom:16px;">
        <p style="font-size:11px;font-weight:bold;color:#166534;margin:0 0 4px 0;">PAYMENT ACCEPTED</p>
        <p style="font-size:12px;color:#15803d;margin:0;">Cash · Check payable to AJ's Generator Service · Zelle · Venmo</p>
      </div>
      ${signatureHTML}
    </div>`;
  };

  const buildChecklistHTML = (doc) => {
    const fields = doc.field_definitions || [];
    const values = doc.field_values || {};
    let rows = "";
    fields.forEach(field => {
      if (field.type === "section_header") {
        rows += `<tr><td colspan="2" style="background:#1e3a5f;color:white;font-weight:bold;font-size:11px;padding:7px 10px;letter-spacing:0.5px;">${field.label}</td></tr>`;
      } else if (field.type === "checkbox") {
        const checked = values[field.id];
        rows += `<tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:6px 10px;font-size:12px;color:#333;">${field.label}</td><td style="padding:6px 10px;text-align:center;font-size:13px;color:${checked ? "#16a34a" : "#9ca3af"};">${checked ? "✓" : "○"}</td></tr>`;
      } else if (values[field.id]) {
        rows += `<tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:6px 10px;font-size:12px;color:#555;">${field.label}</td><td style="padding:6px 10px;font-size:12px;font-weight:600;">${values[field.id]}</td></tr>`;
      }
    });
    return `<div style="margin-top:28px;border-top:2px solid #1e3a5f;padding-top:20px;">
      <h2 style="color:#1e3a5f;font-size:15px;margin:0 0 12px 0;font-family:Arial,sans-serif;">${doc.template_name}</h2>
      <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;">${rows}</table>
    </div>`;
  };

  const handleSend = async () => {
    if (!invoice || !customer?.email) { toast.error("No email on file for this customer"); return; }
    if (!includeInvoice && !Object.values(includedDocs).some(Boolean)) {
      toast.error("Select at least one item to include");
      return;
    }
    setSending(true);
    try {
      const bodyParts = [];
      if (includeInvoice) bodyParts.push(buildInvoiceHTML());
      completedDocs.forEach(doc => { if (includedDocs[doc.id]) bodyParts.push(buildChecklistHTML(doc)); });

      const fullHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial,sans-serif;color:#1a1a1a;background:white;padding:28px;max-width:700px;margin:0 auto;}</style></head><body>${bodyParts.join('<div style="height:1px;background:#e5e7eb;margin:28px 0;"></div>')}<div style="margin-top:28px;text-align:center;border-top:1px solid #eee;padding-top:14px;"><p style="font-size:11px;color:#aaa;">AJ's Generator Service · Thank you for your business</p></div></body></html>`;

      const subjectParts = [];
      if (includeInvoice) subjectParts.push(`Invoice ${invoice.invoice_number}`);
      if (Object.values(includedDocs).some(Boolean)) subjectParts.push("Service Report");
      const subject = subjectParts.join(" & ") + " — AJ's Generator Service";

      await integrationsCore.SendEmail({
        to: customer.email,
        subject,
        html: fullHTML,
        from_name: "AJ's Generator Service",
      });

      setSent(true);
      toast.success(`Email sent to ${customer.email}`);
    } catch {
      toast.error("Failed to send email");
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
                <p className="text-xs text-muted-foreground">Line items, totals, payment info · {formatCurrency(invoice.total)}</p>
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