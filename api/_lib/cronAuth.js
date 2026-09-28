import { timingSafeEqual } from 'node:crypto';

// Constant-time string compare. Returns false (never throws) for missing or
// differently-sized values; the length check leaks only the length, which is
// fixed for a given secret.
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Same rule as api/generate-report.js: a Vercel cron call is trusted ONLY if it
// carries `Authorization: Bearer <CRON_SECRET>` (Vercel sends this when the
// CRON_SECRET env var is set). x-vercel-cron-authorization is just a marker
// header, not a verified signature, and is ignored. Fails closed when
// CRON_SECRET is unset or empty.
export function isAuthorizedCron(headers = {}, env = process.env) {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  return safeEqual(headers['authorization'], `Bearer ${secret}`);
}

// Manual trigger: x-report-secret must equal REPORT_SECRET. Fails closed when
// REPORT_SECRET is unset or empty.
export function isAuthorizedManual(headers = {}, env = process.env) {
  const secret = env.REPORT_SECRET;
  if (!secret) return false;
  return safeEqual(headers['x-report-secret'], secret);
}
