import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { checkIsStaff, getConfirmedStaffId, rememberConfirmedStaff, forgetConfirmedStaff } from '@/lib/staffCheck';
import { setCalendarAccessToken } from '@/lib/calendarSync';

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

  const applySession = useCallback((sess) => {
    const nextUser = mapSupabaseUser(sess?.user ?? null);
    setSession(sess);
    setUser(nextUser);
    setIsAuthenticated(!!sess);
    setGoogleToken(sess?.provider_token ?? null);
    setCalendarAccessToken(sess?.provider_token ?? null);
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

  const signInWithGoogle = async () => {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.send',
        redirectTo: window.location.origin + '/auth/callback',
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    if (error) {
      setAuthError({ type: 'oauth_error', message: error.message });
    }
  };

  const signOut = async (shouldRedirect = true) => {
    forgetConfirmedStaff();
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setIsAuthenticated(false);
    setGoogleToken(null);
    if (shouldRedirect && typeof window !== 'undefined') {
      window.location.assign('/login');
    }
  };

  const navigateToLogin = () => {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.assign('/login');
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    const id = setInterval(async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        const refreshToken = currentSession?.provider_refresh_token;
        if (!refreshToken) return;
        const res = await fetch('/api/refresh-google-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
        const { access_token, expires_in } = await res.json();
        if (access_token) {
          setGoogleToken(access_token);
          setCalendarAccessToken(access_token);
          setGoogleTokenExpiry(Date.now() + expires_in * 1000);
        }
      } catch (e) {
        console.warn('[Auth] Token refresh failed:', e.message);
      }
    }, 45 * 60 * 1000);
    return () => clearInterval(id);
  }, [isAuthenticated]);

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
