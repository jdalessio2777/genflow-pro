import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { integrationsCore } from "@/lib/coreIntegrations";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Download, Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { toast } from "sonner";


export default function QuotePDF() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [htmlContent, setHtmlContent] = useState(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const { data: job, refetch: refetchJob } = useQuery({
    queryKey: ["job", id],
    queryFn: async () => { const r = await db.Job.filter({ id }); return r[0]; },
  });

  const { data: parts = [] } = useQuery({
    queryKey: ["job-parts", id],
    queryFn: () => db.JobPart.filter({ job_id: id }),
    enabled: !!id,
  });

  const { data: labor = [] } = useQuery({
    queryKey: ["job-labor", id],
    queryFn: () => db.JobLabor.filter({ job_id: id }),
    enabled: !!id,
  });

  const { data: customer } = useQuery({
    queryKey: ["customer", job?.customer_id],
    queryFn: async () => { const r = await db.Customer.filter({ id: job.customer_id }); return r[0]; },
    enabled: !!job?.customer_id,
  });

  const updateJob = useMutation({
    mutationFn: (data) => db.Job.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job", id] });
      refetchJob();
    },
  });

  const partsTotal = parts.reduce((s, p) => s + (p.total_price || 0), 0);
  const laborTotal = labor.reduce((s, l) => s + (l.total_price || 0), 0);
  const grandTotal = partsTotal + laborTotal;

  const generateQuote = async () => {
    setGenerating(true);
    try {
      const lineItemsText = [
        ...labor.map(l => `- ${l.description}: ${l.is_flat_rate ? formatCurrency(l.flat_rate_amount) : `${l.hours}h @ ${formatCurrency(l.rate)}/hr`} = ${formatCurrency(l.total_price)}`),
        ...parts.filter(p => p.total_price > 0).map(p => `- ${p.name} (x${p.quantity}) @ ${formatCurrency(p.price)} = ${formatCurrency(p.total_price)}`),
      ].join("\n");

      const prompt = `Generate a professional service quote as a complete, self-contained HTML page for a generator service company.

Customer: ${customer?.name || job?.customer_name}
Address: ${customer?.address || ""}
Generator Model: ${customer?.generator_model || ""}
Serial Number: ${customer?.generator_serial || ""}
Quote Date: ${formatDate(new Date())}
Quote Title: ${job?.title || "Service Quote"}
Quote Description: ${job?.quote_notes || ""}

Line Items:
${lineItemsText}

Parts Subtotal: ${formatCurrency(partsTotal)}
Labor Subtotal: ${formatCurrency(laborTotal)}
TOTAL: ${formatCurrency(grandTotal)}

Design requirements:
- Professional, clean layout suitable for printing and viewing on mobile
- Company name "AJ's Generator Service LLC" at top with a deep blue (#1e3a5f) header
- Customer info and generator info in a clean info block
- Line items in a table with Description and Amount columns
- Totals section with clear grand total
- A prominent approval CTA box: "To approve this quote, call (973) 787-2431 or reply to this email"
  Style it like a green bordered box with the phone number prominent
- Footer: "This quote is valid for 30 days from ${formatDate(new Date())}"
- A print signature line: "Customer Acceptance: ___________________ Date: _______"
- Color scheme: deep blue (#1e3a5f) header, white body, light gray (#f8f9fa) table alternating rows
- Font: system sans-serif, readable on mobile
- Include print stylesheet
- Fully self-contained, no external dependencies

Return ONLY the complete HTML document, nothing else.`;

      const result = await integrationsCore.InvokeLLM({
        prompt,
        model: "claude_sonnet_4_6",
      });

      setHtmlContent(result);
      toast.success("Quote generated");
    } catch {
      toast.error("Failed to generate quote");
    } finally {
      setGenerating(false);
    }
  };

  const handlePrint = () => {
    const win = window.open("", "_blank");
    win.document.write(htmlContent);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  const handleEmail = async () => {
    if (!customer?.email) { toast.error("No email on file for this customer"); return; }
    if (!htmlContent) { toast.error("Generate the quote first"); return; }
    setSending(true);
    try {
      await integrationsCore.SendEmail({
        to: customer.email,
        subject: `Service Quote — ${job?.title} · AJ's Generator Service`,
        html: htmlContent,
        from_name: "AJ's Generator Service",
      });
      updateJob.mutate({ status: "quote_sent", quote_sent_date: new Date().toISOString() });
      setSent(true);
      toast.success(`Quote sent to ${customer.email}`);
    } catch {
      toast.error("Failed to send — check Base44 SendEmail integration is enabled");
    } finally {
      setSending(false);
    }
  };

  if (!job) return (
    <div className="flex items-center justify-center h-40">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  );

  const alreadyApproved = job.status === "scheduled" && job.quote_approved_date;

  return (
    <div>
      <div className="flex items-center gap-3 p-4 border-b">
        <Link to={`/jobs/${id}`}>
          <Button variant="ghost" size="icon" className="rounded-xl h-9 w-9">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{job.title}</p>
          <p className="text-xs text-muted-foreground">{job.customer_name}</p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {alreadyApproved && (
          <Card className="p-4 border-green-200 bg-green-50">
            <p className="text-sm font-bold text-green-800">✓ Quote Approved</p>
            <p className="text-xs text-green-700 mt-0.5">
              Approved {formatDate(job.quote_approved_date)} — job is scheduled
            </p>
          </Card>
        )}

        {/* Quote summary */}
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Quote Summary</p>
          <div className="space-y-1.5 text-sm">
            {labor.map(l => (
              <div key={l.id} className="flex justify-between">
                <span className="text-muted-foreground truncate mr-2">{l.description}</span>
                <span className="font-medium shrink-0">{formatCurrency(l.total_price)}</span>
              </div>
            ))}
            {parts.filter(p => p.total_price > 0).map(p => (
              <div key={p.id} className="flex justify-between">
                <span className="text-muted-foreground truncate mr-2">{p.name} ×{p.quantity}</span>
                <span className="font-medium shrink-0">{formatCurrency(p.total_price)}</span>
              </div>
            ))}
          </div>
          <div className="border-t mt-3 pt-3 flex justify-between font-bold text-base">
            <span>Estimated Total</span>
            <span>{formatCurrency(grandTotal)}</span>
          </div>
        </Card>

        {/* Action buttons */}
        {!htmlContent ? (
          <Button className="w-full rounded-xl h-12 gap-2" onClick={generateQuote} disabled={generating}>
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating Quote PDF...</>
              : <><Download className="w-4 h-4" /> Generate Quote PDF</>}
          </Button>
        ) : (
          <div className="space-y-2">
            <Card className="p-3 bg-green-50 border-green-200">
              <p className="text-sm font-semibold text-green-800">Quote PDF Ready ✓</p>
              <p className="text-xs text-green-700 mt-0.5">Includes one-tap approval button for the customer</p>
            </Card>
            <div className="flex gap-2">
              <Button className="flex-1 rounded-xl h-11 gap-1.5" onClick={handlePrint}>
                <Download className="w-4 h-4" /> Print / Save PDF
              </Button>
              <Button
                variant="outline"
                className={`flex-1 rounded-xl h-11 gap-1.5 ${sent ? "border-green-300 bg-green-50 text-green-700" : ""}`}
                onClick={handleEmail}
                disabled={!customer?.email || sending || !htmlContent}
              >
                {sending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
                  : sent
                  ? <><CheckCircle2 className="w-4 h-4" /> Sent to {customer?.email?.split("@")[0]}</>
                  : <><Mail className="w-4 h-4" /> Email to Customer</>
                }
              </Button>
            </div>
            <Button variant="ghost" className="w-full rounded-xl h-9 text-xs text-muted-foreground"
              onClick={() => { setHtmlContent(null); generateQuote(); }}>
              Regenerate
            </Button>
          </div>
        )}

        {htmlContent && (
          <Card className="overflow-hidden">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3 pt-3 pb-2">Preview</p>
            <div className="border-t">
              <iframe srcDoc={htmlContent} className="w-full h-96 border-0" title="Quote Preview" />
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}