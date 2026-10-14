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

// All usage rows of one part on one job. A return (Decision 2) is a row with
// a NEGATIVE quantity, so the sum is what the job still has out of stock.
async function usageFor(jobPart) {
  return db.PartsUsageLog.filter({ job_id: jobPart.job_id, part_id: jobPart.part_id }, "created_at");
}
const netQty = (rows) => rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);

// Remove a line from a job: delete the line, then — only if its quantity is
// still counted as used — put it back in stock and delete its usage row. If
// the part was already returned (cancelled job), stock is not touched again;
// the usage row and its return row are both removed.
export async function removePartFromJob(jobPart, progress = {}) {
  const qty = Number(jobPart.quantity) || 0;
  if (!progress.usageChecked) {
    const rows = jobPart.part_id ? await usageFor(jobPart) : [];
    const usage = rows.find(r => Number(r.quantity) === qty) || null;
    const net = netQty(rows);
    progress.usageRow = usage;
    progress.restock = !!usage && net >= qty;
    progress.returnRow = usage && !progress.restock ? rows.find(r => Number(r.quantity) === -qty) || null : null;
    progress.usageChecked = true;
  }
  if (!progress.deleted) {
    await db.JobPart.delete(jobPart.id);
    progress.deleted = true;
  }
  if (progress.restock && !progress.stock) {
    await adjustStock(jobPart.part_id, qty);
    progress.stock = true;
  }
  if (progress.usageRow && !progress.usage) {
    await db.PartsUsageLog.delete(progress.usageRow.id);
    progress.usage = true;
  }
  if (progress.returnRow && !progress.returnDeleted) {
    await db.PartsUsageLog.delete(progress.returnRow.id);
    progress.returnDeleted = true;
  }
  return progress;
}

// Decision 2: a part on a cancelled job that wasn't used goes back on the
// shelf. The job line stays (job history); stock goes up and a matching
// usage row with a negative quantity records the return. Only what is still
// counted as used can be returned (never more than the line's quantity).
// plan = { returnId } (fixed id so a Retry can't return twice).
export async function returnPartToStock(jobPart, plan, progress = {}) {
  if (!jobPart.part_id) return progress; // custom part: never in stock
  if (progress.qty === undefined) {
    const already = await db.PartsUsageLog.filter({ id: plan.returnId });
    if (already[0]) { progress.qty = -Number(already[0].quantity); progress.stock = true; progress.logged = true; return progress; }
    progress.qty = Math.max(0, Math.min(Number(jobPart.quantity) || 0, netQty(await usageFor(jobPart))));
  }
  if (progress.qty <= 0) return progress; // nothing was taken out of stock for it
  if (!progress.stock) {
    await adjustStock(jobPart.part_id, progress.qty);
    progress.stock = true;
  }
  if (!progress.logged) {
    await createOnce(db.PartsUsageLog, plan.returnId, {
      part_id: jobPart.part_id, job_id: jobPart.job_id, quantity: -progress.qty,
    });
    progress.logged = true;
  }
  return progress;
}
