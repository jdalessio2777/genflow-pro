import { useQueries } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { db } from "@/lib/db";
import { REFERENCE_STALE_MS } from "@/lib/queries";

// Every row the finance numbers need (Overview + Insights share one cache).
// The business is small (hundreds of rows), so all of it is loaded once and
// the shared module (lib/finance/core.js) slices it by date range on the
// phone — switching ranges is instant and never refetches.
const select = (table, cols) => async () => {
  const { data, error } = await supabase.from(table).select(cols);
  if (error) throw error;
  return data || [];
};
export const warrantyClaimsQuery = () => ({
  queryKey: ["warranty-claims"],
  queryFn: () => db.WarrantyClaim.list("-date_paid"),
});
export const financeQueries = {
  invoices: { queryKey: ["finance", "invoices"], queryFn: select("invoices", "id,status,job_id,customer_id,customer_name,invoice_number,total,tax_amount,surcharge_amount,payment_method,paid_date,created_at,line_items") },
  expenses: { queryKey: ["expenses"], queryFn: () => db.Expense.list("-date") },
  jobs: { queryKey: ["finance", "jobs"], queryFn: select("jobs", "id,job_type,status,assigned_to_name,completed_date,customer_id,created_at") },
  jobParts: { queryKey: ["finance", "job-parts"], queryFn: select("job_parts", "job_id,cost,quantity,total_cost") },
  customers: { queryKey: ["finance", "customers"], queryFn: select("customers", "id,created_at,membership_signed,membership_start,membership_expiry"), staleTime: REFERENCE_STALE_MS },
  warrantyClaims: warrantyClaimsQuery(),
};

const KEYS = Object.keys(financeQueries);
export function useFinanceData() {
  const results = useQueries({ queries: KEYS.map(k => financeQueries[k]) });
  const data = Object.fromEntries(KEYS.map((k, i) => [k, results[i].data || []]));
  const isLoading = results.some(r => r.isLoading);
  const warrantyError = results[KEYS.indexOf("warrantyClaims")].error;
  return { data, isLoading, warrantyError };
}
