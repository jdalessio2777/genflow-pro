import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Download, Mail, ArrowLeft, Link2, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { toast } from "sonner";

function generateToken() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export default function QuotePDF() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [htmlContent, setHtmlContent] = useState(null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const { data: job, refetch: refetchJob } = useQuery({
    queryKey: ["job", id],
    queryFn: async () => { const r = await base44.entities.Job.filter({ id }); return r[0]; },
  });

  const { data: parts = [] } = useQuery({
    queryKey: ["job-parts", id],
    queryFn: () => base44.entities.JobPart.filter({ job_id: id }),
    enabled: !!id,
  });

  const { data: labor = [] } = useQuery({
    queryKey: ["job-labor", id],
    queryFn: () => base44.entities.JobLabor.filter({ job_id: id }),
    enabled: !!id,
  });

  const { data: customer } = useQuery({
    queryKey: ["customer", job?.customer_id],
    queryFn: async () => { const r = await base44.entities.Customer.filter({ id: job.customer_id }); return r[0]; },
    enabled: !!job?.customer_id,
  });

  const updateJob = useMutation({
    mutationFn: (data) => base44.entities.Job.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job", id] });
      refetchJob();
    },
  });

  const partsTotal = parts.reduce((s, p) => s + (p.total_price || 0), 0);
  const laborTotal = labor.reduce((s, l) => s + (l.total_price || 0), 0);
  const grandTotal = partsTotal + laborTotal;

  const getApprovalToken = async () => {
    if (job?.quote_approval_token) return job.quote_approval_token;
    const token = generateToken();
    await base44.entities.Job.update(id, { quote_approval_token: token });
    await refetchJob();
    return token;
  };

  const getApprovalUrl = (token) => {
    return `${window.location.origin}/approve-quote/${id}/${token}`;
  };

  const generateQuote = async () => {
    setGenerating(true);
    try {
      const token = await getApprovalToken();
      const approvalUrl = getApprovalUrl(token);

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

Approval Link: ${approvalUrl}

Design requirements:
- Professional, clean layout suitable for printing and viewing on mobile
- Company name "GenFlow Pro Services" at top with a deep blue (#1e3a5f) header
- Customer info and generator info in a clean info block
- Line items in a table with Description and Amount columns
- Totals section with clear grand total
- A prominent green "Approve This Quote Online" button linking to: ${approvalUrl}
  Style it like: <a href="${approvalUrl}" style="display:block;background:#16a34a;color:white;text-align:center;padding:14px 24px;border-radius:10px;font-size:16px;font-weight:600;text-decoration:none;margin:24px 0;">✓ Approve This Quote Online</a>
- Below the button, smaller text: "Or reply to this email to discuss any changes"
- Footer: "This quote is valid for 30 days from ${formatDate(new Date())}"
- A print signature line: "Customer Acceptance: ___________________ Date: _______"
- Color scheme: deep blue (#1e3a5f) header, white body, light gray (#f8f9fa) table alternating rows
- Font: system sans-serif, readable on mobile
- Include print stylesheet
- Fully self-contained, no external dependencies

Return ONLY the complete HTML document, nothing else.`;

      const result = await base44.integrations.Core.InvokeLLM({
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
      const token = await getApprovalToken();
      const approvalUrl = getApprovalUrl(token);

      const emailHtml = htmlContent.replace(
        "</body>",
        `<div style="background:#f0fdf4;border:2px solid #16a34a;border-radius:12px;padding:20px;margin:24px 0;text-align:center;">
          <p style="font-size:14px;color:#166534;font-weight:600;margin-bottom:12px;">Ready to proceed? Approve this quote online:</p>
          <a href="${approvalUrl}" style="display:inline-block;background:#16a34a;color:white;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:700;text-decoration:none;">✓ Approve This Quote</a>
          <p style="font-size:11px;color:#6b7280;margin-top:10px;">One tap — no login required</p>
        </div></body>`
      );

      await base44.integrations.Core.SendEmail({
        to: customer.email,
        subject: `Service Quote — ${job?.title} · AJ's Generator Service`,
        html: emailHtml,
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

  const handleCopyLink = async () => {
    const token = await getApprovalToken();
    const url = getApprovalUrl(token);
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Approval link copied");
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

        {/* Approval link card */}
        <Card className="p-4 border-blue-200 bg-blue-50">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-800 mb-1">Customer Approval Link</p>
          <p className="text-xs text-blue-700 mb-3">
            Share this link with {customer?.name || "the customer"} — one tap to approve, no login needed
          </p>
          <Button
            variant="outline"
            className="w-full rounded-xl h-10 gap-1.5 border-blue-300 bg-white text-blue-700 hover:bg-blue-100 text-sm"
            onClick={handleCopyLink}
          >
            <Link2 className="w-4 h-4" />
            {copied ? "Link Copied!" : "Copy Approval Link"}
          </Button>
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