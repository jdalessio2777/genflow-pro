// The one entry point every job save / reschedule / cancel / delete calls for
// Google Calendar (B1-B3). It never throws and never blocks a save; it returns
// { status: "synced" | "skipped" | "failed", reason?, eventId? }.
// INTERIM: same behaviour as the old inline JobForm code (primary calendar,
// token from the sign-in session). B3 replaces the implementation; callers
// keep this interface.
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "@/lib/googleCalendar";
import { db } from "@/lib/db";
import { toast } from "sonner";

let accessToken = null;
export function setCalendarAccessToken(token) { accessToken = token || null; }

const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

export async function syncJobToCalendar({ job, customer }) {
  if (!job?.scheduled_date) return { status: "skipped", reason: "not scheduled" };
  if (!accessToken) return { status: "skipped", reason: "no google token" };
  try {
    const eventId = await withTimeout(
      job.calendar_event_id
        ? updateCalendarEvent(job.calendar_event_id, job, customer, accessToken)
        : createCalendarEvent(job, customer, accessToken),
      5000, "Calendar sync timed out");
    await db.Job.update(job.id, { calendar_event_id: eventId, last_synced_at: new Date().toISOString() });
    toast.success("Synced to Google Calendar", { duration: 2000 });
    return { status: "synced", eventId };
  } catch (e) {
    if (e?.message?.startsWith("401")) toast.warning("Please sign out and sign back in to refresh your Google connection");
    else toast.warning("Job saved — Google Calendar sync failed");
    return { status: "failed", reason: e?.message };
  }
}

export async function removeJobFromCalendar({ job }) {
  if (!job?.calendar_event_id) return { status: "skipped", reason: "no event" };
  if (!accessToken) return { status: "skipped", reason: "no google token" };
  try {
    await withTimeout(deleteCalendarEvent(job.calendar_event_id, accessToken), 5000, "Calendar sync timed out");
    return { status: "synced" };
  } catch (e) {
    return { status: "failed", reason: e?.message };
  }
}
