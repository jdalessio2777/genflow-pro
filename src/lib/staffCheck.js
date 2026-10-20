// Staff check for the sign-in gate (B6). The database is the only list:
// public.is_staff() is called with the signed-in user's own session, so adding
// or removing someone in public.staff is the only step.
//
// Results:
//   true  → staff
//   false → definitely not staff (sign out, show "Access denied")
//   throw → couldn't check (network, timeout, Supabase down) — the caller
//           shows a Retry screen, or keeps going if this device already
//           confirmed this user before. Never a sign-out.

const CONFIRMED_KEY = 'genflow.staffConfirmedUserId';
export const STAFF_CHECK_TIMEOUT_MS = 10000;

export async function checkIsStaff(client, { timeoutMs = STAFF_CHECK_TIMEOUT_MS } = {}) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('The access check took too long')), timeoutMs);
  });
  try {
    const { data, error } = await Promise.race([client.rpc('is_staff'), timeout]);
    if (error) throw new Error(error.message || 'The access check failed');
    if (typeof data !== 'boolean') throw new Error('The access check returned no answer');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// The last user id this device confirmed as staff. Not a secret and not an
// authorization — the database still enforces staff-only access on every
// query; this only lets the app render while the check re-runs.
export function getConfirmedStaffId() {
  try { return window.localStorage.getItem(CONFIRMED_KEY); } catch { return null; }
}

export function rememberConfirmedStaff(userId) {
  try { window.localStorage.setItem(CONFIRMED_KEY, userId); } catch { /* private mode */ }
}

export function forgetConfirmedStaff() {
  try { window.localStorage.removeItem(CONFIRMED_KEY); } catch { /* private mode */ }
}
