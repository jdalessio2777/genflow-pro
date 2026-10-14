import { supabase } from "@/lib/supabaseClient";
import { db } from "@/lib/db";
import { createOnce } from "@/lib/saveSafety";

// Inventory ledger rules (H-4 / C-2, C-3, C-8):
// - A catalog part's stock goes DOWN by qty exactly when a parts_usage_log
//   row (qty) is written for it, and goes back UP exactly when that usage
//   row is removed. Stock and the usage log therefore always agree.
// - Stock is changed from the database's current count, never from a cached
//   count in the browser (compare-and-swap: the write only lands if the count
//   is still what we read; otherwise re-read and try again). A second add of
//   the same part, or another phone adding it at the same time, can't lose a
//   decrement.
// - Counts may go below zero ("used more than we thought we had"): clamping
//   at 0 hid the shortfall (C-5). Zero or below flags the part for reorder.
// - Each step reports progress, so a Retry after a failed step continues
//   where it stopped and never applies a step twice.
// A database function doing all of this in one transaction is written for
// review in .qa-scratch/fixes/ (not applied).

export async function adjustStock(partId, delta, { attempts = 6 } = {}) {
  for (let i = 0; i < attempts; i++) {
    const { data: row, error } = await supabase
      .from("parts").select("id, in_stock, reorder_flagged").eq("id", partId).maybeSingle();
    if (error) throw error;
    if (!row) return null; // part no longer in the catalog — nothing to count
    const current = row.in_stock ?? 0;
    const next = current + delta;
    const patch = { in_stock: next };
    if (delta < 0 && next <= 0) patch.reorder_flagged = true;
    let q = supabase.from("parts").update(patch).eq("id", partId);
    q = row.in_stock == null ? q.is("in_stock", null) : q.eq("in_stock", current);
    const { data: updated, error: updateError } = await q.select("id, in_stock, reorder_flagged");
    if (updateError) throw updateError;
    if (updated?.length) return updated[0];
  }
  throw new Error("The stock count kept changing on another device — try again");
}

// Add a line to a job. plan = { jobPartId, usageId, jobPart, stockPartId, qty }
// stockPartId: the catalog part whose stock this line uses (null for a
// one-off custom part that isn't stocked). progress is mutated as steps
// finish; pass the same object to a Retry.
export async function addPartToJob(plan, progress = {}) {
  if (!progress.jobPart) progress.jobPart = await createOnce(db.JobPart, plan.jobPartId, plan.jobPart);
  if (plan.stockPartId && !progress.stock) {
    progress.stockRow = await adjustStock(plan.stockPartId, -plan.qty);
    progress.stock = true;
  }
  if (plan.stockPartId && progress.stockRow && !progress.usage) {
    await createOnce(db.PartsUsageLog, plan.usageId, {
      part_id: plan.stockPartId, job_id: plan.jobPart.job_id, quantity: plan.qty,
    });
    progress.usage = true;
  }
  return progress;
}

// The usage row that belongs to a job line: same job, part and quantity
// (oldest first). Lines added before the usage log existed have none.
async function findUsageRow(jobPart) {
  const rows = await db.PartsUsageLog.filter({ job_id: jobPart.job_id, part_id: jobPart.part_id }, "created_at");
  return rows.find(r => Number(r.quantity) === Number(jobPart.quantity)) || null;
}

// Remove a line from a job: delete the line, then — only if it has a usage
// row — put its quantity back in stock and delete that usage row.
export async function removePartFromJob(jobPart, progress = {}) {
  if (!progress.usageChecked) {
    progress.usageRow = jobPart.part_id ? await findUsageRow(jobPart) : null;
    progress.usageChecked = true;
  }
  if (!progress.deleted) {
    await db.JobPart.delete(jobPart.id);
    progress.deleted = true;
  }
  if (progress.usageRow && !progress.stock) {
    await adjustStock(jobPart.part_id, Number(jobPart.quantity) || 0);
    progress.stock = true;
  }
  if (progress.usageRow && !progress.usage) {
    await db.PartsUsageLog.delete(progress.usageRow.id);
    progress.usage = true;
  }
  return progress;
}
