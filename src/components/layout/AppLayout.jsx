import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Moon } from 'lucide-react';
import MobileNav from "./MobileNav";
import PageTransition from "./PageTransition";
import OfflineBanner from "../ui/OfflineBanner";
// NOTE: usePreferences is created by Agent 1 at src/hooks/usePreferences.js
// This import will resolve once that file is in place.
import { usePreferences } from "../../hooks/usePreferences";

export default function AppLayout() {
  const location = useLocation();
  const { keepAwake } = usePreferences();
  const wakeLockRef = useRef(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);

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
      <OfflineBanner />
      {wakeLockActive && (
        <div
          style={{
            position: 'fixed',
            top: 8,
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
      <main className="pb-28 max-w-lg mx-auto">
        <AnimatePresence mode="wait" initial={false}>
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </AnimatePresence>
      </main>
      <MobileNav />
    </div>
  );
}
