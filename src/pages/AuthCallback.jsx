import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, RETURN_TO_KEY } from '@/lib/AuthContext';

// Where to land after Google sign-in: the screen "Reconnect Google" was tapped
// on (same-origin paths only), else Home.
export function takeReturnTo() {
  let to = null;
  try { to = sessionStorage.getItem(RETURN_TO_KEY); sessionStorage.removeItem(RETURN_TO_KEY); } catch { /* ignore */ }
  return to && to.startsWith('/') && !to.startsWith('//') && !to.startsWith('/auth') ? to : '/';
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoadingAuth, authError } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      // The Google tokens were captured from this session by AuthContext
      // (googleTokenStore) before we get here.
      navigate(takeReturnTo(), { replace: true });
      return;
    }
    // Non-auth-required error (e.g. access_denied) — go to login to show the message
    if (!isLoadingAuth && authError && authError.type !== 'auth_required') {
      navigate('/login', { replace: true });
    }
  }, [isAuthenticated, isLoadingAuth, authError, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      </div>
    </div>
  );
}
