// Staff accounts allowed into GenFlow Pro. Plain ESM shared by the client
// (AuthContext sign-in gate) and Vercel functions that must verify the caller
// (api/send-job-summary.js) — one list so the two can't drift.
export const ALLOWED_EMAILS = new Set([
  'jeremy.dalessio@genshieldservice.com',
  'alex.russo@genshieldservice.com',
  'derek.j.sainz@gmail.com',
  'seanmch12@gmail.com',
  'genflow-qa-test@genshieldservice.com',
]);

export function isAllowedEmail(email) {
  return !!email && ALLOWED_EMAILS.has(String(email).toLowerCase());
}
