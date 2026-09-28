import { supabase } from '@/lib/supabaseClient';

// Client for /api/send-job-summary — the ONLY path that emails a customer
// their invoice/receipt + checklist/agreement PDFs for a job. The server
// picks the recipient and dedupes (atomic DB claim + Resend Idempotency-Key),
// so retrying here can never double-send.
//   kind: 'completion' | 'receipt' | 'resend'
export async function sendJobSummaryEmail({ jobId, kind = 'completion', nonce }, delays = [3000, 10000]) {
  const body = JSON.stringify({ job_id: jobId, kind, ...(nonce ? { nonce } : {}) });
  let lastError;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error('Not signed in');
      const resp = await fetch('/api/send-job-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body,
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const err = new Error(json.error || `Email failed (${resp.status})`);
        err.status = resp.status;
        throw err;
      }
      return json;
    } catch (e) {
      lastError = e;
      // 4xx (auth, bad request, too large) won't fix themselves on retry
      if (e.status && e.status >= 400 && e.status < 500) break;
      if (attempt < delays.length) await new Promise(r => setTimeout(r, delays[attempt]));
    }
  }
  throw lastError;
}

export function newResendNonce() {
  return (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9-]/g, '');
}
