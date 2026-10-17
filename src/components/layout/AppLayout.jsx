import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from 'react';
import { Moon } from 'lucide-react';
import MobileNav from "./MobileNav";
import PageTransition from "./PageTransition";
import { usePreferences } from "../../hooks/usePreferences";
import { UnsavedChangesProvider } from "../../hooks/useUnsavedChangesGuard";
import { useKeyboardAware } from "../../hooks/useKeyboardAware";

// Pages with their own fixed bottom action bar — MobileNav (also fixed-bottom,
// same z-index) would otherwise render on top of it and cover the buttons
// with no way to scroll past a fixed element to reach them.
const HIDE_NAV_PREFIXES = ["/documents/fill/", "/quotes/new"];

export default function AppLayout() {
  const location = useLocation();
  const hideNav = HIDE_NAV_PREFIXES.some(p => location.pathname.startsWith(p));
  const { keepAwake } = usePreferences();
  const wakeLockRef = useRef(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  useKeyboardAware();

  // Acquire / release screen wake lock based on preference
  useEffect(() => {
    const acquire = async () => {
      if (!('wakeLock' in navigator)) return;
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        setWakeLockActive(true);
        wakeLockRef.current.addEventListener('release', () => {
          setWakeLockActive(false);
        });
      } catch {
        // Wake lock may be denied (e.g. page not visible)
        setWakeLockActive(false);
      }
    };

    const release = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
        } catch { /* ignore */ }
        wakeLockRef.current = null;
        setWakeLockActive(false);
      }
    };

    if (keepAwake) {
      acquire();
    } else {
      release();
    }

    // Re-acquire after tab becomes visible again (browser releases lock on hide)
    const handleVisibilityChange = async () => {
      if (keepAwake && document.visibilityState === 'visible' && !wakeLockRef.current) {
        await acquire();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      release();
    };
  }, [keepAwake]);

  return (
    <div className="min-h-screen" style={{ background: "hsl(var(--background))" }}>
      {/* Opaque band behind the status bar: nothing scrolls under the clock.
          Dark so the (white) black-translucent status bar text stays readable;
          JobDetail tints it to match its colored header. */}
      <div
        aria-hidden="true"
        data-testid="status-bar-scrim"
        style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 'var(--sat)', background: 'var(--status-bar-bg)', zIndex: 45, pointerEvents: 'none' }}
      />
      {wakeLockActive && (
        <div
          style={{
            position: 'fixed',
            top: 'calc(var(--sat) + 8px)',
            right: 8,
            zIndex: 60,
            background: 'rgba(0,0,0,0.45)',
            borderRadius: '50%',
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
          title="Screen keep-awake is active"
        >
          <Moon size={14} color="#fff" />
        </div>
      )}
      {/* Bottom padding = the measured tab bar (incl. home-indicator inset)
          + the screen's action bar, if any + a little air: nothing hides
          under them and the page doesn't scroll past its end. */}
      <main className="max-w-lg mx-auto" style={{ paddingTop: 'var(--sat)', paddingBottom: hideNav ? 'calc(6rem + var(--sab) + var(--kb-h, 0px))' : 'calc(var(--nav-h) + var(--action-h) + 16px + var(--kb-h, 0px))' }}>
        {/* Fade-in only, no exit wait: the next screen mounts at once, so
            scroll restoration and the first touch see the real page. */}
        <UnsavedChangesProvider>
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </UnsavedChangesProvider>
      </main>
      {!hideNav && <MobileNav />}
    </div>
  );
}
