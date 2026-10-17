import { db } from "@/lib/db";
import { removePartFromJob } from "@/lib/inventory";

// One delete path for jobs and customers (was copied in Jobs.jsx,
// Customers.jsx and CustomerDetail.jsx). Everything that would block the
// final delete is checked BEFORE anything is removed, so a delete can no
// longer stop halfway and leave invoices/jobs gone but the customer still
// there (D-13). Parts on a deleted job go back into stock with their usage
// rows removed (H-4) — only for jobs that never finished (see deleteJobRows).

async function jobBlockers(jobIds) {
  if (!jobIds.length) return [];
  const [quotes, requests] = await Promise.all([
    Promise.all(jobIds.map(id => db.Quote.filter({ resulting_job_id: id }))).then(r => r.flat()),
    Promise.all(jobIds.map(id => db.ServiceRequest.filter({ job_id: id }))).then(r => r.flat()),
  ]);
  const out = [];
  if (quotes.length) out.push(`${quotes.length} approved quote${quotes.length > 1 ? "s" : ""} point to this job`);
  if (requests.length) out.push(`${requests.length} website request${requests.length > 1 ? "s" : ""} point to this job`);
  return out;
}

// Parts on a job that never finished (scheduled / dispatched / on site) go
// back on the shelf. On a completed, invoiced or cancelled job they were
// used — or, if cancelled, already returned when it was cancelled — so the
// lines are deleted WITHOUT touching stock, and their usage rows stay (the
// database keeps them with job_id cleared), so the weekly report still
// counts them and stock still matches the log.
const FINISHED = ["completed", "invoiced", "canceled", "cancelled"];

async function deleteJobRows(jobId, status) {
  const parts = await db.JobPart.filter({ job_id: jobId });
  if (FINISHED.includes(status)) {
    await Promise.all(parts.map(p => db.JobPart.delete(p.id)));
  } else {
    for (const p of parts) await removePartFromJob(p);
  }
  const [labor, docs, photos, invoices] = await Promise.all([
    db.JobLabor.filter({ job_id: jobId }),
    db.JobDocument.filter({ job_id: jobId }),
    db.JobPhoto.filter({ job_id: jobId }),
    db.Invoice.filter({ job_id: jobId }),
  ]);
  await Promise.all([
    ...labor.map(r => db.JobLabor.delete(r.id)),
    ...docs.map(r => db.JobDocument.delete(r.id)),
    ...photos.map(r => db.JobPhoto.delete(r.id)),
    ...invoices.map(r => db.Invoice.delete(r.id)),
  ]);
  await db.Job.delete(jobId);
}

export async function deleteJobCascade(jobId) {
  const blockers = await jobBlockers([jobId]);
  if (blockers.length) throw new Error(`Not deleted — ${blockers.join("; ")}. Nothing was removed.`);
  const job = (await db.Job.filter({ id: jobId }))[0];
  await deleteJobRows(jobId, job?.status);
}

export async function deleteCustomerCascade(customerId) {
  const [jobs, quotes, requests] = await Promise.all([
    db.Job.filter({ customer_id: customerId }),
    db.Quote.filter({ customer_id: customerId }),
    db.ServiceRequest.filter({ customer_id: customerId }),
  ]);
  const blockers = await jobBlockers(jobs.map(j => j.id));
  if (quotes.length) blockers.unshift(`this customer has ${quotes.length} quote${quotes.length > 1 ? "s" : ""}`);
  if (requests.length) blockers.push(`${requests.length} website request${requests.length > 1 ? "s are" : " is"} linked to this customer`);
  if (blockers.length) throw new Error(`Not deleted — ${blockers.join("; ")}. Nothing was removed.`);

  for (const job of jobs) await deleteJobRows(job.id, job.status);
  const invoices = await db.Invoice.filter({ customer_id: customerId });
  await Promise.all(invoices.map(inv => db.Invoice.delete(inv.id)));
  await db.Customer.delete(customerId);
}
