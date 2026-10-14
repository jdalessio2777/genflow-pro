import { sendEmail } from './_lib/sendEmail.js';
import { applyCors, isAllowedOrigin, requireStaff } from './_lib/staffAuth.js';

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

// Staff-only: requires a signed-in staff user's Supabase access token
// (Authorization: Bearer). From and Reply-To are fixed in _lib/sendEmail.js
// and are never read from the request.
export default async function handler(req, res) {
  applyCors(req, res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(isAllowedOrigin(req.headers.origin) ? 204 : 403).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAllowedOrigin(req.headers.origin)) return res.status(403).json({ error: 'Origin not allowed' });

  const auth = await requireStaff(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const { to, subject, html, internal } = await readJsonBody(req);
  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'to, subject, and html are required' });
  }

  try {
    const result = await sendEmail({ to, subject, html, internal: internal === true });
    console.log('[send-email] sent', result.id, 'by', auth.user.email);
    return res.status(200).json({ ok: true, id: result.id });
  } catch (err) {
    console.error('[send-email]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
