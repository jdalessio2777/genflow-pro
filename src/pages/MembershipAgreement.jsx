import { useParams } from "react-router-dom";
import { useBack } from "@/hooks/useBack";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { supabase } from "@/lib/supabaseClient";
import { integrationsCore } from "@/lib/coreIntegrations";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { getUserDisplayName } from "@/lib/userColors";
import { notifyTeam, buildTable, buildRow, buildEventBadge } from "@/lib/notifyTeam";
import { escapeHtml } from "@/lib/utils/escapeHtml";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, CheckCircle2, Loader2, Shield } from "lucide-react";
import { formatDate } from "@/lib/utils/format";
import { toast } from "sonner";
import { haptics } from "@/lib/haptics";
import { PLANS, TERMS, UNIT_TYPE_LABEL, PLAN_TAX_NOTE } from "@/lib/agreementTerms";
import { agreementTerm } from "@/lib/utils/membershipTerm";
import SignaturePad from "@/components/signature/SignaturePad";

export default function MembershipAgreement() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const urlParams = new URLSearchParams(window.location.search);
  const fromJobId = urlParams.get("from_job");
  // Back from a job-linked signing returns to that job when opened directly.
  const goBack = useBack(fromJobId ? `/jobs/${fromJobId}` : undefined);
  const planParam = urlParams.get("plan");
  const [selectedPlan, setSelectedPlan] = useState(PLANS[planParam] ? planParam : "annual");
  // Signed from inside a job: the contract is linked to that job
  // (job_agreements) and its PDF rides on the job's completion email instead
  // of a separate "Protection Plan Active" email.
  const [linkedToJob, setLinkedToJob] = useState(false);
  const [step, setStep] = useState("plan"); // "plan" | "terms" | "sign" | "done"
  // Active members see a summary card first; "Renew or Change Plan" (or
  // arriving from a job to sign) opens the plan -> terms -> sign flow.
  const [renewing, setRenewing] = useState(!!fromJobId);
  const [agreed, setAgreed] = useState(false);

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => { const r = await db.Customer.filter({ id }); return r[0]; },
  });

  // Agreement already signed on this job (re-sign keeps its term — B5a).
  const { data: jobAgreement = null } = useQuery({
    queryKey: ["job-agreement", fromJobId],
    enabled: !!fromJobId,
    queryFn: async () => {
      try { const r = await db.JobAgreement.filter({ job_id: fromJobId }); return r[0] || null; }
      catch { return null; }
    },
  });

  // "Renew or Change Plan" starts on the customer's current plan, not always
  // Annual (audit D-06). A plan in the URL (from a job's agreement line) wins.
  const planTouched = useRef(!!PLANS[planParam]);
  useEffect(() => {
    if (!planTouched.current && PLANS[customer?.membership_plan]) {
      planTouched.current = true;
      setSelectedPlan(customer.membership_plan);
    }
  }, [customer?.membership_plan]);

  const updateCustomer = useMutation({
    mutationFn: (data) => db.Customer.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customer", id] }),
  });

  const handleSign = async (dataUrl) => {
    haptics.success();
    // One membership per customer: this updates the customer row (B5a).
    const { start, expiry, kind } = agreementTerm({ customer, plan: selectedPlan, jobAgreement });
    const signedAt = new Date();

    // Log prior agreement to history before overwriting (skip on first-time
    // signup, and on a re-sign of this job's agreement — same term).
    if (customer.membership_expiry && kind !== "resign") {
      try {
        await db.MembershipRenewal.create({
          customer_id: customer.id,
          plan: customer.membership_plan,
          start_date: customer.membership_start,
          expiry_date: customer.membership_expiry,
          renewed_by: user?.email ?? null,
        });
      } catch {
        // non-fatal — history log failure should not block signing
      }
    }

    await updateCustomer.mutateAsync({
      membership_plan: selectedPlan,
      membership_start: start.toISOString(),
      membership_expiry: expiry.toISOString(),
      membership_signed: true,
      membership_signature: dataUrl,
      membership_visits_used: 0,
      renewal_reminder_30_sent_at: null,
      renewal_reminder_7_sent_at: null,
      renewal_expired_reminder_sent_at: null,
    });

    let jobLinked = false;
    if (fromJobId) {
      const plan = PLANS[selectedPlan];
      const { error } = await supabase.from("job_agreements").upsert({
        job_id: fromJobId,
        customer_id: customer.id,
        plan: selectedPlan,
        plan_name: plan.name,
        price: plan.price,
        start_date: start.toISOString(),
        expiry_date: expiry.toISOString(),
        signature: dataUrl,
        signed_at: signedAt.toISOString(),
        signed_by: user?.email ?? null,
        snapshot: {
          customer: { name: customer.name, address: customer.address || null, email: customer.email || null, phone: customer.phone || null },
          generator: { model: customer.generator_model || null, serial: customer.generator_serial || null },
          unit_type: UNIT_TYPE_LABEL,
          plan: { key: selectedPlan, name: plan.name, price: plan.price, billingLabel: plan.billingLabel, includes: plan.includes },
          terms: TERMS,
        },
      }, { onConflict: "job_id" });
      if (error) {
        // Fall back to the standalone confirmation email so the customer
        // still receives their plan details.
        toast.error(`Couldn't link the agreement to this job: ${error.message}`);
      } else {
        jobLinked = true;
        queryClient.invalidateQueries({ queryKey: ["job-agreement", fromJobId] });
      }
    }
    setLinkedToJob(jobLinked);

    if (customer?.email && !jobLinked) {
      const plan = PLANS[selectedPlan];
      const planName = selectedPlan === "semi_annual" ? "Sentinel Plan (Semi-Annual $575/yr plus NJ sales tax)" : "Guardian Plan (Annual $325/yr plus NJ sales tax)";
      const expiryStr = expiry.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      const startStr = start.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      try {
        await integrationsCore.SendEmailWithRetry({
          to: customer.email,
          subject: `Your Protection Plan is Active — ${planName}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="background:#0D1014;padding:22px 24px;border-radius:8px 8px 0 0;">
              <h1 style="color:white;margin:0;font-size:18px;">GEN<span style="color:#E03010;">SHIELD</span></h1>
              <p style="color:#A8B4C4;margin:3px 0 0 0;font-size:12px;">Protection Plan Active</p>
            </div>
            <div style="background:#f8f9fa;padding:22px 24px;border-radius:0 0 8px 8px;">
              <p style="font-size:14px;color:#1a1a1a;">Hi ${escapeHtml(customer.name)},</p>
              <p style="font-size:13px;color:#444;margin-top:8px;">Thank you for signing up for the <strong>${escapeHtml(planName)}</strong>. Your agreement is now active.</p>
              <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin:14px 0;">
                <p style="margin:0 0 6px 0;font-size:13px;"><strong>Plan:</strong> ${escapeHtml(planName)}</p>
                <p style="margin:0 0 6px 0;font-size:13px;"><strong>Start Date:</strong> ${startStr}</p>
                <p style="margin:0 0 6px 0;font-size:13px;"><strong>Expiration:</strong> ${expiryStr}</p>
                <p style="margin:0 0 8px 0;font-size:13px;"><strong>Generator:</strong> ${escapeHtml(customer.generator_model || "Your generator")}${customer.generator_serial ? ` (S/N: ${escapeHtml(customer.generator_serial)})` : ""}</p>
                <p style="margin:0 0 4px 0;font-size:13px;font-weight:bold;">What's included:</p>
                <ul style="margin:0;padding-left:18px;font-size:13px;color:#444;">${plan.includes.map(i => `<li style="margin-bottom:3px;">${i}</li>`).join("")}</ul>
              </div>
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:11px;margin-bottom:14px;">
                <p style="margin:0;font-size:13px;color:#166534;">✓ Your ${selectedPlan === "semi_annual" ? "15%" : "10%"} member discount will be automatically applied to all qualifying services.</p>
              </div>
              <p style="font-size:13px;color:#444;">Your first 30 minutes of diagnostic labor are free on service calls during normal business hours, during the agreement term (not on emergency or after-hours calls).</p>
              <p style="font-size:12px;color:#666;margin-top:16px;">Thank you for choosing GenShield.</p>
            </div>
          </div>`,
        });
        await db.Customer.update(customer.id, { membership_send_failed: false });
      } catch (e) {
        toast.error(`Membership activated, but confirmation email failed to send: ${e.message}`);
        await db.Customer.update(customer.id, { membership_send_failed: true }).catch(() => {});
      }
    }

    const planName = selectedPlan === "semi_annual" ? "Sentinel Plan (Semi-Annual $575/yr plus NJ sales tax)" : "Guardian Plan (Annual $325/yr plus NJ sales tax)";
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
  const longDate = (d) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const term = agreementTerm({ customer, plan: selectedPlan, jobAgreement });
  const today = longDate(term.start);
  const expiryStr = longDate(term.expiry);
  const termNote = term.kind === "renewal"
    ? `Renewal — the current plan runs to ${longDate(term.start)}; the new year starts then.`
    : term.kind === "change" ? "Plan change — the new plan starts today." : null;

  // Already a member
  if (customer.membership_plan && customer.membership_signed && step !== "done" && !renewing) {
    return (
      <div>
        <div className="flex items-center gap-3 p-4 border-b sticky top-[var(--sat)] bg-background/90 backdrop-blur-xl z-40">
          <button onClick={() => goBack()} aria-label="Back" data-testid="back-button" className="touch-target flex items-center justify-center w-9 h-9 rounded-xl hover:bg-muted">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <p className="text-sm font-semibold">Membership Agreement</p>
            <p className="text-xs text-muted-foreground">{customer.name}</p>
          </div>
        </div>
        <div className="p-4 space-y-4 max-w-lg mx-auto">
          <Card className="p-5 border-emerald-200 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/20">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">Active Member</p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">{PLANS[customer.membership_plan]?.name}</p>
              </div>
            </div>
            <div className="text-sm space-y-1 text-emerald-800 dark:text-emerald-200">
              <p><span className="font-medium">{customer.membership_start && new Date(customer.membership_start) > new Date() ? "Renewed — new term starts:" : "Started:"}</span> {formatDate(customer.membership_start)}</p>
              <p><span className="font-medium">Expires:</span> {formatDate(customer.membership_expiry)}</p>
            </div>
          </Card>
          <Button variant="outline" className="w-full rounded-xl" onClick={() => { setStep("plan"); setRenewing(true); }}>
            Renew or Change Plan
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 p-4 border-b sticky top-[var(--sat)] bg-background/90 backdrop-blur-xl z-40">
        <button
          onClick={() => { if (step === "terms") setStep("plan"); else if (step === "sign") setStep("terms"); else if (renewing && !fromJobId) setRenewing(false); else goBack(); }}
          aria-label="Back" data-testid="back-button"
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
                <Card className={`p-4 border-2 transition-all ${selectedPlan === key ? (key === "annual" ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20") : "border-border"}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-bold">{p.name}</p>
                      <p className="text-xl font-bold mt-0.5">{p.priceLabel} <span className="text-xs font-medium text-muted-foreground">{PLAN_TAX_NOTE}</span></p>
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
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">GenShield LLC</p>
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
              {termNote && <p data-testid="term-note" className="text-xs text-muted-foreground mt-2">{termNote}</p>}
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
              <SignaturePad onSave={handleSign} />
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
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto dark:bg-green-900">
              <Shield className="w-10 h-10 text-green-600 dark:text-green-300" />
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
              <p className="text-xs text-muted-foreground">
                {linkedToJob
                  ? `The signed agreement (PDF) will be emailed to ${customer.email} with the job summary when the job is completed.`
                  : `A confirmation email has been sent to ${customer.email}`}
              </p>
            )}
            <Button className="w-full rounded-xl h-12" onClick={() => goBack()}>
              {fromJobId ? "Back to Job" : "Back to Customer"}
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}