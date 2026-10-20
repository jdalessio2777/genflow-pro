// Exchanges a Google refresh token for a fresh access token (B3).
// The refresh token alone is useless without GOOGLE_CLIENT_SECRET, which only
// the server has — so the browser keeps the refresh token and asks this helper
// (behind the staff-only /api/refresh-google-token route) for access tokens.
// Returns { status, body } for the route; never logs tokens.
export async function refreshGoogleAccessToken(refreshToken, { env = process.env, fetchImpl = fetch } = {}) {
  const clientId = env.GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { status: 500, body: { error: 'Google client id/secret not configured on the server', code: 'server_config' } };
  }
  let googleRes, data;
  try {
    googleRes = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    });
    data = await googleRes.json().catch(() => ({}));
  } catch (e) {
    return { status: 502, body: { error: `Google token endpoint unreachable: ${e.message}`, code: 'network' } };
  }
  if (!googleRes.ok) {
    // invalid_grant = the refresh token was revoked/expired → the user must sign in with Google again.
    // invalid_client / unauthorized_client = the server's client secret is wrong (a Vercel env fix).
    const code = data.error === 'invalid_grant' ? 'reconnect'
      : (data.error === 'invalid_client' || data.error === 'unauthorized_client') ? 'server_config' : 'google_error';
    return { status: googleRes.status, body: { error: data.error_description || data.error || 'Token refresh failed', code } };
  }
  return { status: 200, body: { access_token: data.access_token, expires_in: data.expires_in, scope: data.scope } };
}
