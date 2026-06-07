export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { refresh_token } = req.body;
  if (!refresh_token) {
    return res.status(400).json({ error: 'refresh_token is required' });
  }

  const params = new URLSearchParams({
    client_id: process.env.VITE_GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token,
    grant_type: 'refresh_token',
  });

  const googleRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  const data = await googleRes.json();

  if (!googleRes.ok) {
    return res.status(googleRes.status).json({ error: data.error_description || data.error || 'Token refresh failed' });
  }

  return res.status(200).json({ access_token: data.access_token, expires_in: data.expires_in });
}
