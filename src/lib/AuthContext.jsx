import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

const ALLOWED_EMAILS = new Set([
  'jeremy.dalessio@genshieldservice.com',
  'alex.russo@genshieldservice.com',
  'derek.j.sainz@gmail.com',
  'seanmch12@gmail.com',
]);

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

  const applySession = useCallback((sess) => {
    const nextUser = mapSupabaseUser(sess?.user ?? null);
    setSession(sess);
    setUser(nextUser);
    setIsAuthenticated(!!sess);
    setGoogleToken(sess?.provider_token ?? null);
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
        const { access_token } = await res.json();
        if (access_token) setGoogleToken(access_token);
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
