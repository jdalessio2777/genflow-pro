import { createClient } from '@supabase/supabase-js';

const PRODUCTION_ORIGIN = 'https://genflow-pro.vercel.app';

// Browser origins allowed to call staff-only /api routes, matched exactly (no
// wildcards): production, plus this deployment's own URLs from Vercel's system
// env vars, so a preview only accepts itself. A pattern like
// genflow-*.vercel.app would also match other people's projects. Local dev is
// allowed only outside production. Requests without an Origin header (curl,
// server-to-server) pass this check and still need a staff token; the token
// check below is what actually authorizes a request.
export function allowedOrigins(env = process.env) {
  const origins = new Set([PRODUCTION_ORIGIN]);
  for (const host of [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (host) origins.add(`https://${host}`);
  }
  if (env.VERCEL_ENV !== 'production') origins.add('http://localhost:5173');
  return origins;
}

export function isAllowedOrigin(origin, env = process.env) {
  return !origin || allowedOrigins(env).has(origin);
}

// Reflects the Origin only when it's one of ours; anything else gets no CORS
// headers, so the browser blocks the response.
export function applyCors(req, res, methods) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins().has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
}

// Staff = a row in public.staff, asked of the database itself: public.is_staff()
// is called AS THE CALLER (anon key + the caller's own access token), so it
// answers for auth.uid() of that token. Adding or removing someone in
// public.staff is the only step; there is no second list to keep in sync.
// Throws when the check itself fails (network, Supabase down, missing config)
// so callers can tell "not staff" (403) apart from "couldn't check" (503).
export async function isStaffToken(token, { env = process.env, timeoutMs = 8000 } = {}) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Staff check not configured (Supabase URL / anon key missing)');
  const asCaller = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Staff check timed out')), timeoutMs);
  });
  try {
    const { data, error } = await Promise.race([asCaller.rpc('is_staff'), timeout]);
    if (error) throw new Error(error.message || 'is_staff failed');
    return data === true;
  } finally {
    clearTimeout(timer);
  }
}

// Authorization: Bearer <Supabase access token of a staff user>.
// auth.getUser() asks Supabase Auth to validate the token, so forged, expired,
// and signed-out (session revoked) tokens are rejected server-side (401).
// Then is_staff() decides: not staff → 403; the check failing → 503 (never
// treated as staff).
export async function requireStaff(req, { db, staffCheck = isStaffToken } = {}) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, status: 401, error: 'Missing auth token' };

  const client = db || createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return { ok: false, status: 401, error: 'Invalid session' };
  let staff;
  try {
    staff = await staffCheck(token, data.user);
  } catch (e) {
    console.error('[staffAuth] staff check failed:', e.message);
    return { ok: false, status: 503, error: 'Staff check failed, try again' };
  }
  if (!staff) return { ok: false, status: 403, error: 'Not allowed' };
  return { ok: true, user: data.user };
}
