import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ALLOWED_EMAILS } from '@/lib/allowedUsers';
import { captureGoogleTokens, clearGoogleTokens, onGoogleTokenChange } from '@/lib/googleTokenStore';

// B3: only what the app uses — events on the Jobs calendar + reading the
// calendar list for Settings → "Jobs calendar". (gmail.send and full
// calendar access were requested before; nothing used them.)
export const GOOGLE_SCOPES = 'email profile https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly';
export const RETURN_TO_KEY = 'genflow_auth_return_to';

const AuthContext = createContext();

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, sess) => {
      if (_event === 'SIGNED_IN' && sess?.user) {
        if (!ALLOWED_EMAILS.has(sess.user.email)) {
          await supabase.auth.signOut();
          setUser(null);
          setSession(null);
          setIsAuthenticated(false);
          setGoogleToken(null);
          setAuthError({
            type: 'access_denied',
            message: 'Access denied. This app is restricted to GenShield team members.',
          });
          setIsLoadingAuth(false);
          setIsLoadingPublicSettings(false);
          return;
        }
      }
      applySession(sess);
      setIsLoadingAuth(false);
      setIsLoadingPublicSettings(false);
    });
    return () => subscription.unsubscribe();
  }, [applySession, checkAppState]);

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

  const signOut = async (shouldRedirect = true) => {
    await supabase.auth.signOut();
    clearGoogleTokens();
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
