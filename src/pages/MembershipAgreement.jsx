import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { integrationsCore } from "@/lib/coreIntegrations";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { getUserDisplayName } from "@/lib/userColors";
import { notifyTeam, buildTable, buildRow, buildEventBadge } from "@/lib/notifyTeam";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, CheckCircle2, Loader2, Shield } from "lucide-react";
import { formatDate } from "@/lib/utils/format";
import { toast } from "sonner";

function SignatureCanvas({ onSave }) {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return {
      x: (touch.clientX - rect.left) * (canvas.width / rect.width),
      y: (touch.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDraw = (e) => { e.preventDefault(); isDrawing.current = true; const canvas = canvasRef.current; const ctx = canvas.getContext("2d"); const pos = getPos(e, canvas); ctx.beginPath(); ctx.moveTo(pos.x, pos.y); };
  const draw = (e) => { e.preventDefault(); if (!isDrawing.current) return; const canvas = canvasRef.current; const ctx = canvas.getContext("2d"); const pos = getPos(e, canvas); ctx.lineTo(pos.x, pos.y); ctx.stroke(); };
  const stopDraw = (e) => { e.preventDefault(); isDrawing.current = false; };
  const clear = () => { const canvas = canvasRef.current; const ctx = canvas.getContext("2d"); ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); };
  const save = () => onSave(canvasRef.current.toDataURL("image/png"));

  return (
    <div className="space-y-3">
      <div className="border-2 border-dashed border-border rounded-xl overflow-hidden bg-white">
        <canvas ref={canvasRef} width={560} height={160} className="w-full touch-none"
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw} />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 rounded-xl" onClick={clear}>Clear</Button>
        <Button className="flex-1 rounded-xl bg-green-600 hover:bg-green-700" onClick={save}>Sign & Activate</Button>
      </div>
    </div>
  );
}

const PLANS = {
  annual: {
    name: "Annual Protection Plan",
    price: 340,
    billingLabel: "$340.00 / year",
    color: "border-blue-200 bg-blue-50",
    headerColor: "bg-blue-600",
    includes: [
      "One (1) full annual maintenance service",
      "10% off all parts, labor, and repair services",
      "Priority emergency service (24-hour response)",
    ],
  },
  semi_annual: {
    name: "Semi-Annual Protection Plan",
    price: 595,
    billingLabel: "$595.00 / year",
    color: "border-emerald-200 bg-emerald-50",
    headerColor: "bg-emerald-600",
    includes: [
      "Two (2) maintenance visits per year",
      "15% off all parts, labor, and repair services",
      "Priority emergency service (24-hour response)",
      "First 30 minutes of diagnostic labor free, per visit, during normal business hours",
    ],
  },
};

const TERMS = [
  { n: "1", title: "Term & Payment", body: "This Agreement is valid for one (1) year from the date of execution. Payment is due in full at the time of signing. Annual billing only — no monthly payment option is available." },
  { n: "2", title: "Automatic Renewal", body: "If a credit card is on file, this Agreement auto-renews annually. You will be notified by email at least 30 days before renewal with the amount to be charged and the option to cancel. If no credit card is on file, you will receive an email 30 days before expiration advising that the Agreement will expire without further action." },
  { n: "3", title: "Cancellation", body: "After automatic renewal, cancellations submitted in writing within 7 days receive a full refund. Cancellations after that period and mid-term cancellations are non-refundable." },
  { n: "4", title: "Included Services", body: "Scheduled maintenance includes engine oil and filter replacement, air filtration inspection, spark plug inspection, battery and charging system check, fuel system verification, and full operational load test." },
  { n: "5", title: "Rollover Policy", body: "Unused included maintenance visits do not expire at the end of the agreement year. Any unused visit carries forward and remains available after renewal." },
  { n: "6", title: "Discount Application", body: "The member discount (10% for Annual plan; 15% for Semi-Annual plan) applies to all billable parts, hourly labor, and flat-rate services during the agreement term. Applied at time of service only — not retroactively. Does not apply to the Agreement cost itself or third-party fees." },
  { n: "7", title: "Emergency Service", body: "Agreement holders receive priority emergency scheduling. AJ's Generator Service LLC will make reasonable effort to respond within 24 hours to generators that fail to operate during or immediately following a utility power outage. Subject to technician availability — not a guaranteed response time." },
  { n: "8", title: "Unit Specificity & Transferability", body: "This Agreement is specific to the generator identified above and is not transferable to a new property owner or any third party. However, if the covered unit is replaced with a new generator at the same customer's property, this Agreement transfers to the replacement unit at no charge upon notification and verification of the new unit's information. This Agreement follows the customer, not the address." },
  { n: "9", title: "Air-Cooled Units Only", body: "This Agreement applies exclusively to air-cooled generator units rated at 26kW or less. Liquid-cooled or industrial-grade units are not covered under this Agreement." },
  { n: "10", title: "Exclusions", body: "Does not cover repairs resulting from misuse, neglect, acts of nature, flood, fire, vandalism, or damage caused by installation not performed by AJ's Generator Service LLC. Repair parts and labor are billed separately, subject to the member discount." },
  { n: "11", title: "Limitation of Liability", body: "AJ's Generator Service LLC's liability under this Agreement is limited to the cost of the Agreement. Not liable for consequential, incidental, or special damages including food spoilage, property damage, or loss of income resulting from generator failure." },
  { n: "12", title: "Governing Law", body: "This Agreement is governed by the laws of the State of New Jersey. Disputes shall be resolved in the county where service was performed." },
];

export default function MembershipAgreement() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const urlParams = new URLSearchParams(window.location.search);
  const fromJobId = urlParams.get("from_job");
  const [selectedPlan, setSelectedPlan] = useState("annual");
  const [step, setStep] = useState("plan"); // "plan" | "terms" | "sign" | "done"
  const [agreed, setAgreed] = useState(false);

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => { const r = await db.Customer.filter({ id }); return r[0]; },
  });

  const updateCustomer = useMutation({
    mutationFn: (data) => db.Customer.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customer", id] }),
  });

  const handleSign = async (dataUrl) => {
    const start = new Date();
    const expiry = new Date(start);
    expiry.setFullYear(expiry.getFullYear() + 1);

    await updateCustomer.mutateAsync({
      membership_plan: selectedPlan,
      membership_start: start.toISOString(),
      membership_expiry: expiry.toISOString(),
      membership_signed: true,
      membership_signature: dataUrl,
    });

    if (customer?.email) {
      const plan = PLANS[selectedPlan];
      const planName = selectedPlan === "semi_annual" ? "Semi-Annual Protection Plan ($595/yr)" : "Annual Protection Plan ($340/yr)";
      const expiryStr = expiry.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      const startStr = start.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      try {
        await integrationsCore.SendEmail({
          to: customer.email,
          from_name: "AJ's Generator Service",
          subject: `Your Protection Plan is Active — ${planName}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#1e3a5f;padding:22px 24px;border-radius:8px 8px 0 0;">
              <h1 style="color:white;margin:0;font-size:18px;">AJ's Generator Service</h1>
              <p style="color:#a8c4e0;margin:3px 0 0 0;font-size:12px;">Protection Plan Active</p>
            </div>
            <div style="background:#f8f9fa;padding:22px 24px;border-radius:0 0 8px 8px;">
              <p style="font-size:14px;color:#1a1a1a;">Hi ${customer.name},</p>
              <p style="font-size:13px;color:#444;margin-top:8px;">Thank you for signing up for the <strong>${planName}</strong>. Your agreement is now active.</p>
              <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin:14px 0;">
                <p style="margin:0 0 6px 0;font-size:13px;"><strong>Plan:</strong> ${planName}</p>
                <p style="margin:0 0 6px 0;font-size:13px;"><strong>Start Date:</strong> ${startStr}</p>
                <p style="margin:0 0 6px 0;font-size:13px;"><strong>Expiration:</strong> ${expiryStr}</p>
                <p style="margin:0 0 8px 0;font-size:13px;"><strong>Generator:</strong> ${customer.generator_model || "Your generator"}${customer.generator_serial ? ` (S/N: ${customer.generator_serial})` : ""}</p>
                <p style="margin:0 0 4px 0;font-size:13px;font-weight:bold;">What's included:</p>
                <ul style="margin:0;padding-left:18px;font-size:13px;color:#444;">${plan.includes.map(i => `<li style="margin-bottom:3px;">${i}</li>`).join("")}</ul>
              </div>
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:11px;margin-bottom:14px;">
                <p style="margin:0;font-size:13px;color:#166534;">✓ Your {selectedPlan === "semi_annual" ? "15%" : "10%"} member discount will be automatically applied to all qualifying services.</p>
              </div>
              ${selectedPlan === "semi_annual" ? `<p style="font-size:13px;color:#444;">Your first 30 minutes of diagnostic labor are complimentary on each visit.</p>` : ""}
              <p style="font-size:12px;color:#666;margin-top:16px;">Thank you for choosing AJ's Generator Service.</p>
            </div>
          </div>`,
        });
      } catch {
        // silently fail — membership is already activated
      }
    }

    const planName = selectedPlan === "semi_annual" ? "Semi-Annual ($595/yr)" : "Annual ($340/yr)";
    notifyTeam({
      subject: `Membership Signed — ${customer.name} · ${planName}`,
      body: `
        <p style="font-size:14px;margin:0 0 4px 0;">${buildEventBadge("Protection Plan Signed", "purple")}</p>
        ${buildTable([
          buildRow("Customer", customer.name),
          buildRow("Plan", planName),
          buildRow("Generator", customer.generator_model),
          buildRow("Address", customer.address),
          buildRow("Expires", expiry.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })),
        ])}
      `,
      triggeredBy: getUserDisplayName(user),
    });

    setStep("done");
    toast.success("Membership activated!");
    if (fromJobId) {
      queryClient.invalidateQueries({ queryKey: ["job-customer"] });
      toast.success("Discount active — applies to new items added from here");
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!customer) return <div className="p-4 text-center">Customer not found</div>;

  const plan = PLANS[selectedPlan];
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const expiryDate = new Date(); expiryDate.setFullYear(expiryDate.getFullYear() + 1);
  const expiryStr = expiryDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  // Already a member
  if (customer.membership_plan && customer.membership_signed && step !== "done") {
    return (
      <div>
        <div className="flex items-center gap-3 p-4 border-b sticky top-0 bg-background/90 backdrop-blur-xl z-40">
          <button onClick={() => navigate(-1)} className="touch-target flex items-center justify-center w-9 h-9 rounded-xl hover:bg-muted">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <p className="text-sm font-semibold">Membership Agreement</p>
            <p className="text-xs text-muted-foreground">{customer.name}</p>
          </div>
        </div>
        <div className="p-4 space-y-4 max-w-lg mx-auto">
          <Card className="p-5 border-emerald-200 bg-emerald-50">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-900">Active Member</p>
                <p className="text-xs text-emerald-700">{PLANS[customer.membership_plan]?.name}</p>
              </div>
            </div>
            <div className="text-sm space-y-1 text-emerald-800">
              <p><span className="font-medium">Started:</span> {formatDate(customer.membership_start)}</p>
              <p><span className="font-medium">Expires:</span> {formatDate(customer.membership_expiry)}</p>
            </div>
          </Card>
          <Button variant="outline" className="w-full rounded-xl" onClick={() => setStep("plan")}>
            Renew or Change Plan
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 p-4 border-b sticky top-0 bg-background/90 backdrop-blur-xl z-40">
        <button
          onClick={() => { if (step === "terms") setStep("plan"); else if (step === "sign") setStep("terms"); else navigate(-1); }}
          className="touch-target flex items-center justify-center w-9 h-9 rounded-xl hover:bg-muted"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Maintenance Agreement</p>
          <p className="text-xs text-muted-foreground">{customer.name}</p>
        </div>
        <div className="flex gap-1">
          {["plan", "terms", "sign"].map((s, i) => (
            <div key={s} className={`w-2 h-2 rounded-full ${step === s ? "bg-primary" : ["plan","terms","sign"].indexOf(step) > i ? "bg-primary/40" : "bg-muted"}`} />
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto pb-8">

        {/* STEP 1 — PLAN SELECTION */}
        {step === "plan" && (
          <>
            <div>
              <h2 className="text-lg font-bold">Select a Plan</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Choose the protection plan that fits your needs</p>
              <p className="text-xs text-muted-foreground mt-1 px-2.5 py-1.5 bg-muted/50 rounded-lg border border-border/60">
                ⚠ For air-cooled generators 26kW or less only
              </p>
            </div>

            {Object.entries(PLANS).map(([key, p]) => (
              <button key={key} onClick={() => setSelectedPlan(key)} className="w-full text-left">
                <Card className={`p-4 border-2 transition-all ${selectedPlan === key ? (key === "annual" ? "border-blue-500 bg-blue-50" : "border-emerald-500 bg-emerald-50") : "border-border"}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-bold">{p.name}</p>
                      <p className="text-xl font-bold mt-0.5">{p.billingLabel}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${selectedPlan === key ? (key === "annual" ? "border-blue-500 bg-blue-500" : "border-emerald-500 bg-emerald-500") : "border-border"}`}>
                      {selectedPlan === key && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </div>
                  <ul className="space-y-1.5">
                    {p.includes.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0 mt-0.5" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </Card>
              </button>
            ))}

            <Button className="w-full rounded-xl h-12 gap-2" onClick={() => setStep("terms")}>
              Continue with {plan.name} <ArrowLeft className="w-4 h-4 rotate-180" />
            </Button>
          </>
        )}

        {/* STEP 2 — TERMS */}
        {step === "terms" && (
          <>
            <div>
              <h2 className="text-lg font-bold">Agreement Terms</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Please review all terms before signing</p>
            </div>

            {/* Agreement header */}
            <Card className="p-4 bg-muted/30">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">AJ's Generator Service LLC</p>
              <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                <span className="text-muted-foreground">Customer</span><span className="font-medium">{customer.name}</span>
                <span className="text-muted-foreground">Address</span><span className="font-medium">{customer.address || "—"}</span>
                <span className="text-muted-foreground">Generator</span><span className="font-medium">{customer.generator_model || "—"}</span>
                <span className="text-muted-foreground">Serial No.</span><span className="font-medium font-mono">{customer.generator_serial || "—"}</span>
                <span className="text-muted-foreground">Unit Type</span><span className="font-medium">Air-cooled, 26kW or less</span>
                <span className="text-muted-foreground">Plan</span><span className="font-medium">{plan.name}</span>
                <span className="text-muted-foreground">Amount</span><span className="font-bold">{plan.billingLabel}</span>
                <span className="text-muted-foreground">Start Date</span><span className="font-medium">{today}</span>
                <span className="text-muted-foreground">Expires</span><span className="font-medium">{expiryStr}</span>
              </div>
            </Card>

            {/* Terms list */}
            <div className="space-y-3">
              {TERMS.map(t => (
                <Card key={t.n} className="p-3">
                  <p className="text-xs font-bold text-foreground mb-1">{t.n}. {t.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{t.body}</p>
                </Card>
              ))}
            </div>

            {/* Agree checkbox */}
            <button
              onClick={() => setAgreed(!agreed)}
              className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-colors ${agreed ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${agreed ? "border-primary bg-primary" : "border-muted-foreground"}`}>
                {agreed && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
              </div>
              <p className="text-sm font-medium text-left">I have read and agree to all terms and conditions</p>
            </button>

            <Button className="w-full rounded-xl h-12" disabled={!agreed} onClick={() => setStep("sign")}>
              Proceed to Signature
            </Button>
          </>
        )}

        {/* STEP 3 — SIGNATURE */}
        {step === "sign" && (
          <>
            <div>
              <h2 className="text-lg font-bold">Customer Signature</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Sign below to activate your {plan.name}</p>
            </div>

            <Card className="p-4 bg-muted/30">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Plan</span>
                <span className="font-semibold">{plan.name}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-bold text-primary">{plan.billingLabel}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-muted-foreground">Expires</span>
                <span className="font-medium">{expiryStr}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-muted-foreground">Unit</span>
                <span className="font-medium">Air-cooled, 26kW or less</span>
              </div>
            </Card>

            <div>
              <p className="text-xs text-muted-foreground mb-2 text-center italic">
                By signing, {customer.name} agrees to the terms and conditions reviewed above
              </p>
              <SignatureCanvas onSave={handleSign} />
            </div>

            {updateCustomer.isPending && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Activating membership...
              </div>
            )}
          </>
        )}

        {/* DONE */}
        {step === "done" && (
          <div className="text-center py-8 space-y-4">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <Shield className="w-10 h-10 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Membership Active!</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {customer.name} is now enrolled in the {plan.name}
              </p>
            </div>
            <Card className="p-4 text-left space-y-2">
              {plan.includes.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  {item}
                </div>
              ))}
            </Card>
            {customer.email && (
              <p className="text-xs text-muted-foreground">A confirmation email has been sent to {customer.email}</p>
            )}
            <Button className="w-full rounded-xl h-12" onClick={() => fromJobId ? navigate(`/jobs/${fromJobId}`) : navigate(`/customers/${id}`)}>
              {fromJobId ? "Back to Job" : "Back to Customer"}
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}