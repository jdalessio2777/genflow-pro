import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { notifyTeam, buildTable, buildRow, buildEventBadge } from "@/lib/notifyTeam";
import { useState } from "react";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

export default function QuoteApproval() {
  const { jobId, token } = useParams();
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState(null);

  const { data: tokenCheck, isLoading: checkingToken } = useQuery({
    queryKey: ["quote-token-check", jobId, token],
    queryFn: async () => {
      const res = await fetch(`/api/validate-quote-token?job_id=${encodeURIComponent(jobId)}&token=${encodeURIComponent(token)}`);
      return res.json();
    },
    retry: false,
    staleTime: Infinity,
  });

  const tokenValid = tokenCheck?.valid === true;

  const { data: job, isLoading: loadingJob } = useQuery({
    queryKey: ["public-job", jobId],
    queryFn: async () => {
      const r = await db.Job.filter({ id: jobId });
      return r[0];
    },
    enabled: tokenValid,
  });

  const { data: parts = [] } = useQuery({
    queryKey: ["public-parts", jobId],
    queryFn: () => db.JobPart.filter({ job_id: jobId }),
    enabled: tokenValid,
  });

  const { data: labor = [] } = useQuery({
    queryKey: ["public-labor", jobId],
    queryFn: () => db.JobLabor.filter({ job_id: jobId }),
    enabled: tokenValid,
  });

  const partsTotal = parts.reduce((s, p) => s + (p.total_price || 0), 0);
  const laborTotal = labor.reduce((s, l) => s + (l.total_price || 0), 0);
  const grandTotal = partsTotal + laborTotal;

  const handleApprove = async () => {
    if (!job) return;

    if (job.status === "scheduled" && job.quote_approved_date) {
      setApproved(true);
      return;
    }

    setApproving(true);
    try {
      await db.Job.update(jobId, {
        status: "scheduled",
        quote_approved_date: new Date().toISOString(),
        quote_approved_by_customer: true,
      });
      notifyTeam({
        subject: `Quote Approved — ${job.title} · ${job.customer_name}`,
        body: `
          <p style="font-size:14px;margin:0 0 4px 0;">${buildEventBadge("Quote Approved by Customer", "green")}</p>
          <p style="font-size:13px;color:#444;margin:8px 0 0 0;">The customer has approved the quote online. Schedule their appointment.</p>
          ${buildTable([
            buildRow("Customer", job.customer_name),
            buildRow("Job", job.title),
            buildRow("Approved", new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })),
          ])}
        `,
        triggeredBy: job.customer_name + " (customer)",
      });
      setApproved(true);
    } catch {
      setError("Something went wrong. Please call us to approve.");
    } finally {
      setApproving(false);
    }
  };

  const alreadyApproved = job?.status === "scheduled" && job?.quote_approved_date;

  if (checkingToken || (tokenValid && loadingJob)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-sm w-full text-center">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-800 mb-2">Link Not Valid</h1>
          <p className="text-gray-500 text-sm">
            This approval link is invalid or has already been used. Please contact us directly.
          </p>
        </div>
      </div>
    );
  }

  if (approved || alreadyApproved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-sm w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Quote Approved!</h1>
          <p className="text-gray-500 mb-6">
            Thank you, <strong>{job.customer_name}</strong>. Your quote has been approved and we will be in touch shortly to confirm your appointment.
          </p>
          <div className="bg-white rounded-2xl border p-4 text-left">
            <p className="text-sm font-semibold text-gray-700 mb-1">{job.title}</p>
            {job.quote_notes && (
              <p className="text-xs text-gray-500 mb-2">{job.quote_notes}</p>
            )}
            <p className="text-lg font-bold text-gray-900">{formatCurrency(grandTotal)}</p>
            <p className="text-xs text-gray-400 mt-1">
              Approved {formatDate(job.quote_approved_date || new Date())}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div style={{ background: "#1e3a5f" }} className="px-6 py-5">
        <h1 className="text-white text-lg font-bold">AJ's Generator Service LLC</h1>
        <p className="text-blue-200 text-sm mt-0.5">Service Quote for {job.customer_name}</p>
      </div>

      <div className="max-w-lg mx-auto p-5 space-y-5">
        {/* Quote header */}
        <div className="bg-white rounded-2xl border p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Service Quote</p>
          <h2 className="text-xl font-bold text-gray-800">{job.title}</h2>
          {job.quote_notes && (
            <p className="text-sm text-gray-500 mt-1">{job.quote_notes}</p>
          )}
          <p className="text-xs text-gray-400 mt-2">Prepared {formatDate(job.created_date)}</p>
        </div>

        {/* Line items */}
        <div className="bg-white rounded-2xl border overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Scope of Work</p>
          </div>
          <div className="divide-y">
            {labor.map(l => (
              <div key={l.id} className="px-4 py-3 flex items-center justify-between">
                <div className="min-w-0 flex-1 mr-3">
                  <p className="text-sm font-medium text-gray-800">{l.description}</p>
                  <p className="text-xs text-gray-400">
                    {l.is_flat_rate ? "Flat rate" : `${l.hours}h @ ${formatCurrency(l.rate)}/hr`}
                  </p>
                </div>
                <span className="text-sm font-semibold text-gray-800 shrink-0">{formatCurrency(l.total_price)}</span>
              </div>
            ))}
            {parts.filter(p => p.total_price > 0).map(p => (
              <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                <div className="min-w-0 flex-1 mr-3">
                  <p className="text-sm font-medium text-gray-800">{p.name}</p>
                  <p className="text-xs text-gray-400">Qty {p.quantity}</p>
                </div>
                <span className="text-sm font-semibold text-gray-800 shrink-0">{formatCurrency(p.total_price)}</span>
              </div>
            ))}
          </div>
          <div className="px-4 py-4 bg-gray-50 border-t flex items-center justify-between">
            <span className="font-bold text-gray-800">Total Estimate</span>
            <span className="text-xl font-bold text-gray-900">{formatCurrency(grandTotal)}</span>
          </div>
        </div>

        {/* Approve button */}
        <div className="bg-white rounded-2xl border p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-gray-800">Ready to proceed?</p>
            <p className="text-xs text-gray-500 mt-1">
              Tap the button below to approve this quote. We'll contact you to confirm your appointment.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <button
            onClick={handleApprove}
            disabled={approving}
            style={{ background: approving ? "#9ca3af" : "#16a34a" }}
            className="w-full text-white font-bold py-4 rounded-2xl text-base flex items-center justify-center gap-2 transition-opacity active:opacity-80"
          >
            {approving
              ? <><Loader2 className="w-5 h-5 animate-spin" /> Approving...</>
              : <><CheckCircle2 className="w-5 h-5" /> Approve This Quote</>}
          </button>

          <p className="text-xs text-gray-400 text-center">
            By approving, you authorize the work described above at the estimated price. Final invoice may vary if additional work is required.
          </p>
        </div>

        <p className="text-xs text-gray-400 text-center pb-4">
          This quote is valid for 30 days · AJ's Generator Service LLC
        </p>
      </div>
    </div>
  );
}