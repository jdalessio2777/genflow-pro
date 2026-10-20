import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { checkIsStaff, getConfirmedStaffId, rememberConfirmedStaff, forgetConfirmedStaff } from '@/lib/staffCheck';
import { captureGoogleTokens, clearGoogleTokens, onGoogleTokenChange } from '@/lib/googleTokenStore';
import { clearDeviceData } from '@/lib/signOutDevice';

// B3: only what the app uses — events on the Jobs calendar + reading the
// calendar list for Settings → "Jobs calendar". (gmail.send and full
// calendar access were requested before; nothing used them.)
export const GOOGLE_SCOPES = 'email profile https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly';
export const RETURN_TO_KEY = 'genflow_auth_return_to';

const AuthContext = createContext();

const ACCESS_DENIED = {
  type: 'access_denied',
  message: 'Access denied. This app is restricted to GenShield team members.',
};

function mapSupabaseUser(supabaseUser) {
  if (!supabaseUser) return null;
  const meta = supabaseUser.user_metadata || {};
  return {
    id: supabaseUser.id,
    email: supabaseUser.email,
    full_name: meta.full_name || meta.name,
    name: meta.name || meta.full_name,
    role: meta.role ?? supabaseUser.app_metadata?.role,
  };
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);
  const [googleToken, setGoogleToken] = useState(null);
  const [googleTokenExpiry, setGoogleTokenExpiry] = useState(null);
  const deniedRef = useRef(false); // B6: signed out because the staff check said no
  const signedOutRef = useRef(false); // this page ran Sign out

  const applySession = useCallback((sess) => {
    const nextUser = mapSupabaseUser(sess?.user ?? null);
    setSession(sess);
    setUser(nextUser);
    setIsAuthenticated(!!sess);
    // B3: keep the Google tokens Supabase hands out only right after the
    // Google redirect (they vanish from the session at its next refresh).
    const google = captureGoogleTokens(sess);
    setGoogleToken(google?.accessToken ?? null);
    if (sess) {
      setAuthError(null);
    } else {
      setAuthError({ type: 'auth_required', message: 'Authentication required' });
    }
  }, []);

  const checkAppState = useCallback(async () => {
    setIsLoadingAuth(true);
    setIsLoadingPublicSettings(true);
    setAuthError(null);
    try {
      const { data: { session: sess }, error } = await supabase.auth.getSession();
      if (error) throw error;
      applySession(sess);
    } catch (e) {
      console.error('Auth state check failed:', e);
      setAuthError({ type: 'unknown', message: e.message || 'Failed to load session' });
      setUser(null);
      setSession(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
      setIsLoadingPublicSettings(false);
    }
  }, [applySession]);

  useEffect(() => {
    checkAppState();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      // Staff check (B6) runs in the effect below, not here: supabase calls
      // awaited inside this callback can deadlock the auth lock.
      if (sess) deniedRef.current = false;
      applySession(sess);
      // Signed out because the staff check said no: keep "Access denied"
      // instead of the generic "Authentication required".
      if (!sess && deniedRef.current) setAuthError(ACCESS_DENIED);
      setIsLoadingAuth(false);
      setIsLoadingPublicSettings(false);
    });
    return () => subscription.unsubscribe();
  }, [applySession, checkAppState]);

  // ── Staff gate (B6) ──────────────────────────────────────────────────────
  // public.staff via is_staff() is the only list. 'checking' | 'staff' |
  // 'error' while signed in; 'idle' otherwise. A user this device already
  // confirmed renders immediately while the check re-runs in the background;
  // a definite "not staff" signs out with "Access denied"; a failed check
  // with no prior confirmation shows a Retry screen — never a sign-out.
  const [staffStatus, setStaffStatus] = useState('idle');
  const [staffCheckError, setStaffCheckError] = useState(null);
  const [staffCheckRun, setStaffCheckRun] = useState(0);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) { setStaffStatus('idle'); return undefined; }
    let cancelled = false;
    const confirmedBefore = getConfirmedStaffId() === userId;
    setStaffStatus(confirmedBefore ? 'staff' : 'checking');
    setStaffCheckError(null);
    checkIsStaff(supabase).then(async (isStaff) => {
      if (cancelled) return;
      if (isStaff) {
        rememberConfirmedStaff(userId);
        setStaffStatus('staff');
        return;
      }
      forgetConfirmedStaff();
      deniedRef.current = true;
      setStaffStatus('denied');
      setAuthError(ACCESS_DENIED);
      try { await supabase.auth.signOut(); } catch (e) { console.warn('[Auth] sign-out after denial failed:', e.message); }
      setUser(null);
      setSession(null);
      setIsAuthenticated(false);
      clearGoogleTokens();
      setGoogleToken(null);
      setAuthError(ACCESS_DENIED);
    }).catch((e) => {
      if (cancelled) return;
      console.warn('[Auth] staff check failed:', e.message);
      if (confirmedBefore) return; // keep working; the database still enforces staff-only access
      setStaffCheckError(e.message || 'The access check failed');
      setStaffStatus('error');
    });
    return () => { cancelled = true; };
  }, [userId, staffCheckRun]);

  const retryStaffCheck = useCallback(() => setStaffCheckRun((n) => n + 1), []);
  // Before the effect's first run for a new user, a device-confirmed user is
  // already 'staff' (no one-frame spinner flash).
  const effectiveStaffStatus = staffStatus === 'idle' && userId
    ? (getConfirmedStaffId() === userId ? 'staff' : 'checking')
    : staffStatus;

  // returnTo: where AuthCallback lands afterwards (Reconnect Google from any screen).
  const signInWithGoogle = async ({ returnTo } = {}) => {
    setAuthError(null);
    try {
      if (returnTo) sessionStorage.setItem(RETURN_TO_KEY, returnTo);
      else sessionStorage.removeItem(RETURN_TO_KEY);
    } catch { /* ignore */ }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: GOOGLE_SCOPES,
        redirectTo: window.location.origin + '/auth/callback',
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    if (error) {
      setAuthError({ type: 'oauth_error', message: error.message });
    }
  };

  // Settings → Sign out (and the staff-check screen). This device only
  // (scope 'local': the tech's other devices stay signed in). Clears the
  // device's Google tokens, calendar choice and cached data
  // (signOutDevice.js), then loads /login as a NEW page that REPLACES the
  // current history entry. Back / swipe can't return: every earlier entry is
  // a staff-only screen, which now redirects to /login (navigateToLogin), and
  // a page restored from the back-forward cache is sent to /login too.
  const signOut = async (shouldRedirect = true) => {
    signedOutRef.current = true;
    forgetConfirmedStaff();
    // Clear first: Supabase's SIGNED_OUT event can already send AuthGate to
    // /login while signOut() is still running.
    clearDeviceData({ keepSession: true });
    try { await supabase.auth.signOut({ scope: 'local' }); } catch (e) { console.warn('[Auth] sign-out failed:', e.message); }
    clearDeviceData();
    setUser(null);
    setSession(null);
    setIsAuthenticated(false);
    setGoogleToken(null);
    if (shouldRedirect && typeof window !== 'undefined') {
      // Blank the old page first, so a back-forward cache snapshot shows nothing.
      document.body.style.visibility = 'hidden';
      window.location.replace('/login');
      // A same-page history step (e.g. a closing dialog's entry) cancels a
      // page load in progress: if we're still here, go again.
      setTimeout(() => window.location.replace('/login'), 2500);
    }
  };

  useEffect(() => {
    const onPageShow = (e) => {
      if (e.persisted && signedOutRef.current) window.location.replace('/login');
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  // replace, not assign: a back press from the sign-in screen lands on the
  // previous entry, which redirects here again instead of piling up entries.
  const navigateToLogin = () => {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.replace('/login');
    }
  };

  // Google access tokens are refreshed on demand by googleTokenStore (via the
  // staff-only /api/refresh-google-token); mirror the current one here.
  useEffect(() => onGoogleTokenChange(rec => {
    setGoogleToken(rec?.accessToken ?? null);
    setGoogleTokenExpiry(rec?.expiresAt ?? null);
  }), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isAuthenticated,
        isLoadingAuth,
        loading: isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        appPublicSettings,
        googleToken,
        googleTokenExpiry,
        signInWithGoogle,
        signOut,
        logout: signOut,
        navigateToLogin,
        checkAppState,
        staffStatus: effectiveStaffStatus,
        staffCheckError,
        retryStaffCheck,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
