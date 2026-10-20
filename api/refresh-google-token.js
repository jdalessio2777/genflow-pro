import { applyCors, isAllowedOrigin, requireStaff } from './_lib/staffAuth.js';
import { refreshGoogleAccessToken } from './_lib/googleToken.js';

// Staff-only (B3): a signed-in staff user's Supabase access token is required
// (Authorization: Bearer). Body: { refresh_token } — the Google refresh token
// the browser captured at Google sign-in. Returns { access_token, expires_in }
// or { error, code } where code "reconnect" means sign in with Google again and
// "server_config" means GOOGLE_CLIENT_SECRET on Vercel is wrong.
export default async function handler(req, res) {
  applyCors(req, res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(isAllowedOrigin(req.headers?.origin) ? 204 : 403).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAllowedOrigin(req.headers?.origin)) return res.status(403).json({ error: 'Origin not allowed' });

  const auth = await requireStaff(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const refresh_token = req.body?.refresh_token;
  if (!refresh_token) return res.status(400).json({ error: 'refresh_token is required' });

  const { status, body } = await refreshGoogleAccessToken(refresh_token);
  if (status !== 200) console.warn('[refresh-google-token]', status, body.code, 'for', auth.user.email);
  return res.status(status).json(body);
}
