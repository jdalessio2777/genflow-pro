// What happens once a new job has its appointment (B1): one path for the New
// Job form and the "Schedule this job" sheet (approved quote / job screen).
//   1. draft invoice (once per job; a fixed id makes a retry find it),
//   2. "New Job" team notification,
//   3. optional appointment confirmation email to the customer,
//   4. Google Calendar sync (never throws, never blocks).
// The job passed in carries the picked estimate (jobWithEstimate) so the
// email and the calendar use it even before jobs.estimated_minutes exists.
import { db } from "@/lib/db";
import { integrationsCore } from "@/lib/coreIntegrations";
import { confirmationEmailHTML } from "@/lib/emailTemplates";
import { notifyTeam, buildTable, buildRow, buildEventBadge } from "@/lib/notifyTeam";
import { syncJobToCalendar } from "@/lib/calendarSync";
import { createOnce } from "@/lib/saveSafety";
import { formatEstimate, estimateMinutes } from "@/lib/jobDuration";
import { toast } from "sonner";

export async function ensureDraftInvoice(job, invoiceId) {
  try {
    const existing = await db.Invoice.filter({ job_id: job.id });
    if (existing?.length) return existing[0];
    return await createOnce(db.Invoice, invoiceId, {
      job_id: job.id,
      customer_id: job.customer_id,
      customer_name: job.customer_name,
      invoice_number: `INV-${Date.now().toString(36).toUpperCase()}`,
      parts_total: 0, labor_total: 0, total: 0,
      line_items: [], notes: "", status: "draft",
    });
  } catch (e) {
    // The job is saved; Collect Payment creates the invoice later if needed.
    toast.warning(`Job saved, but its draft invoice wasn't created yet: ${e.message}`);
    return null;
  }
}

export function notifyNewJob({ job, customer, triggeredBy }) {
  notifyTeam({
    subject: `New Job — ${job.title} · ${customer?.name || job.customer_name}`,
    body: `
      <p style="font-size:14px;color:#1a1a1a;margin:0 0 4px 0;">${buildEventBadge("New Job Created", "blue")}</p>
      ${buildTable([
        buildRow("Customer", customer?.name || job.customer_name),
        buildRow("Job", job.title),
        buildRow("Type", job.job_type),
        buildRow("Assigned To", job.assigned_to_name || "Unassigned"),
        buildRow("Scheduled", job.scheduled_date ? new Date(job.scheduled_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""),
        buildRow("Est. time on site", formatEstimate(estimateMinutes(job))),
      ])}
    `,
    triggeredBy,
  });
}

// Returns true when the email went out. Records the outcome on the job.
export async function sendConfirmation({ job, customer, use24h }) {
  if (!customer?.email) {
    toast.error(`No email on file for ${customer?.name || "this customer"} — confirmation not sent`);
    await db.Job.update(job.id, { confirmation_send_failed: true }).catch(() => {});
    return false;
  }
  try {
    const techFirstName = (job.assigned_to_name || "").split(" ")[0] || "our technician";
    await integrationsCore.SendEmailWithRetry({
      to: customer.email,
      subject: `Appointment Confirmed — GenShield Generator Service`,
      html: confirmationEmailHTML({ customer, job, techFirstName, use24h }),
    });
    await db.Job.update(job.id, { confirmation_sent_at: new Date().toISOString(), confirmation_send_failed: false });
    toast.success(`Confirmation sent to ${customer.name}`);
    return true;
  } catch (e) {
    toast.error(`Failed to send confirmation email: ${e.message}`);
    await db.Job.update(job.id, { confirmation_send_failed: true }).catch(() => {});
    return false;
  }
}

/**
 * afterJobScheduled({ job, customer, sendConfirmation, use24h, triggeredBy, invoiceId, isNew })
 * isNew=false skips invoice + team notification (an edit of an existing job).
 */
export async function afterJobScheduled({ job, customer, sendConfirmation: send = false, use24h = false, triggeredBy, invoiceId, isNew = true }) {
  if (isNew) {
    await ensureDraftInvoice(job, invoiceId);
    notifyNewJob({ job, customer, triggeredBy });
    if (send) await sendConfirmation({ job, customer, use24h });
  }
  await syncJobToCalendar({ job, customer });
}
