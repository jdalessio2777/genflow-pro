import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  const applySession = useCallback((session) => {
    const nextUser = mapSupabaseUser(session?.user ?? null);
    setUser(nextUser);
    setIsAuthenticated(!!session);
    if (session) {
      setAuthError(null);
    } else {
      setAuthError({
        type: 'auth_required',
        message: 'Authentication required',
      });
    }
  }, []);

  const checkAppState = useCallback(async () => {
    setIsLoadingAuth(true);
    setIsLoadingPublicSettings(true);
    setAuthError(null);
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      applySession(session);
    } catch (e) {
      console.error('Auth state check failed:', e);
      setAuthError({
        type: 'unknown',
        message: e.message || 'Failed to load session',
      });
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
      setIsLoadingPublicSettings(false);
    }
  }, [applySession]);

  useEffect(() => {
    checkAppState();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
      setIsLoadingAuth(false);
      setIsLoadingPublicSettings(false);
    });
    return () => subscription.unsubscribe();
  }, [applySession, checkAppState]);

  const logout = async (shouldRedirect = true) => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAuthenticated(false);
    if (shouldRedirect && typeof window !== 'undefined') {
      window.location.assign('/login');
    }
  };

  const navigateToLogin = () => {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.assign('/login');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        appPublicSettings,
        logout,
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
