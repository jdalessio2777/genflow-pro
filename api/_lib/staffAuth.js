import { createClient } from '@supabase/supabase-js';
import { isAllowedEmail } from '../../src/lib/allowedUsers.js';

// Browser origins allowed to call staff-only /api routes: production, this
// project's Vercel previews, and local dev. Requests without an Origin header
// (curl, server-to-server) pass this check and still need a staff token; the
// token check below is what actually authorizes a request.
const ALLOWED_ORIGIN_RE =
  /^(https:\/\/genflow-pro\.vercel\.app|https:\/\/genflow-[a-z0-9-]+-jdalessio2777s-projects\.vercel\.app|http:\/\/localhost:5173)$/;

export function isAllowedOrigin(origin) {
  return !origin || ALLOWED_ORIGIN_RE.test(origin);
}

// Reflects the Origin only when it's one of ours; anything else gets no CORS
// headers, so the browser blocks the response.
export function applyCors(req, res, methods) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGIN_RE.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
}

// Authorization: Bearer <Supabase access token of a staff user>.
// auth.getUser() asks Supabase Auth to validate the token, so forged, expired,
// and signed-out (session revoked) tokens are rejected server-side. Staff =
// the shared allow-list in src/lib/allowedUsers.js, the same list the sign-in
// gate and api/send-job-summary.js use.
// TODO(CRIT-1): once public.staff + is_staff() exist, check the staff table
// here instead of the email list.
export async function requireStaff(req, { db } = {}) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, status: 401, error: 'Missing auth token' };

  const client = db || createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return { ok: false, status: 401, error: 'Invalid session' };
  if (!isAllowedEmail(data.user.email)) return { ok: false, status: 403, error: 'Not allowed' };
  return { ok: true, user: data.user };
}
