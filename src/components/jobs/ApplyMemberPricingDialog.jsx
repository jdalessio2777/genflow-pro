import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { jobLaborQuery, jobPartsQuery, jobQuery, laborRatesQuery, partsCatalogQuery } from "@/lib/queries";
import { applyMemberRepricing, canRepriceJob, planMemberRepricing } from "@/lib/memberRepricing";
import { formatCurrency } from "@/lib/utils/format";
import { useSaveGuard, showSaveError, dismissSaveError } from "@/lib/saveSafety";
import { haptics } from "@/lib/haptics";

// "Apply member pricing to this job's existing items?" (Run 8, B5): shown
// right after an agreement is signed from a job, and from the job's own
// "Apply member pricing" action. Apply re-reads the lines, plans again and
// saves — so a second tap or a second phone can't discount anything twice.
export default function ApplyMemberPricingDialog({ open, onOpenChange, jobId, memberDiscountRate, afterSigning = false }) {
  const queryClient = useQueryClient();
  const guard = useSaveGuard();
  const enabled = open && !!jobId;
  const { data: job } = useQuery({ ...jobQuery(jobId), enabled });
  const { data: parts = [], isSuccess: partsOk } = useQuery({ ...jobPartsQuery(jobId), enabled });
  const { data: labor = [], isSuccess: laborOk } = useQuery({ ...jobLaborQuery(jobId), enabled });
  const { data: catalogParts = [], isSuccess: catOk } = useQuery({ ...partsCatalogQuery(), enabled });
  const { data: rates = [], isSuccess: ratesOk } = useQuery({ ...laborRatesQuery(), enabled });
  const loaded = partsOk && laborOk && catOk && ratesOk && !!job;
  const plan = useMemo(
    () => planMemberRepricing({ parts, labor, catalogParts, rates, memberDiscountRate }),
    [parts, labor, catalogParts, rates, memberDiscountRate],
  );
  const pct = Math.round((1 - memberDiscountRate) * 100);
  const editable = canRepriceJob(job);

  const apply = () => guard.run(async function attempt() {
    try {
      const [freshParts, freshLabor] = await Promise.all([
        db.JobPart.filter({ job_id: jobId }),
        db.JobLabor.filter({ job_id: jobId }),
      ]);
      const fresh = planMemberRepricing({ parts: freshParts, labor: freshLabor, catalogParts, rates, memberDiscountRate });
      const n = await applyMemberRepricing(db, fresh.updates);
      dismissSaveError("", { id: "member-pricing-error" });
      queryClient.invalidateQueries({ queryKey: ["job-parts", jobId] });
      queryClient.invalidateQueries({ queryKey: ["job-labor", jobId] });
      haptics.success?.();
      toast.success(n ? `Member pricing applied to ${n} item${n === 1 ? "" : "s"} — ${formatCurrency(fresh.savings)} off` : "Nothing to change — every item already has member pricing");
      onOpenChange(false);
    } catch (e) {
      haptics.error?.();
      // Lines already saved stay saved; Retry re-plans and finishes the rest.
      showSaveError("Member pricing NOT fully applied", e, attempt, { id: "member-pricing-error" });
    }
  });

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!guard.busy) onOpenChange(o); }}>
      <AlertDialogContent className="max-w-sm rounded-2xl max-h-[85dvh] overflow-y-auto" data-testid="apply-member-pricing">
        <AlertDialogHeader>
          <AlertDialogTitle>{afterSigning ? "Apply member pricing to this job's existing items?" : "Apply member pricing"}</AlertDialogTitle>
          <AlertDialogDescription>
            {!loaded ? "Checking this job's items…"
              : !editable ? "This job is already completed, so its prices can't change."
              : plan.updates.length === 0 ? "Every item on this job already has member pricing (or can't be discounted)."
              : `${pct}% member price on ${plan.updates.length} item${plan.updates.length === 1 ? "" : "s"} added before the agreement. The Service Agreement itself is never discounted.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {loaded && editable && plan.updates.length > 0 && (
          <div className="space-y-1.5 text-sm" data-testid="member-pricing-lines">
            {plan.updates.map(u => (
              <div key={u.kind + u.id} className="flex items-start justify-between gap-2">
                <span className="min-w-0 break-words">{u.name}</span>
                <span className="shrink-0 tabular-nums"><s className="text-muted-foreground">{formatCurrency(u.before)}</s> {formatCurrency(u.after)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-border font-semibold text-emerald-700 dark:text-emerald-400">
              <span>Member savings</span><span data-testid="member-pricing-savings">−{formatCurrency(plan.savings)}</span>
            </div>
            {plan.skipped.filter(s => s.reason !== "Service Agreement" && s.reason !== "Already member-priced").length > 0 && (
              <p className="text-xs text-muted-foreground pt-1">
                Unchanged: {plan.skipped.filter(s => s.reason !== "Service Agreement" && s.reason !== "Already member-priced").map(s => `${s.name} (${s.reason.toLowerCase()})`).join(", ")}
              </p>
            )}
          </div>
        )}
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel className="h-11 rounded-xl" disabled={guard.busy}>{plan.updates.length > 0 && editable ? "Not now" : "Close"}</AlertDialogCancel>
          {loaded && editable && plan.updates.length > 0 && (
            <Button className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700" data-testid="apply-member-pricing-confirm" disabled={guard.busy} onClick={apply}>
              {guard.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Apply
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
