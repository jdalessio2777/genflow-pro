import { useEffect } from "react";
import { createBrowserRouter, Navigate, Outlet, ScrollRestoration } from "react-router-dom";
import { installPageMotion, setNavDirection } from "@/lib/pageMotion";
import { OfflineProvider } from "@/lib/OfflineContext";
import { useAuth } from "@/lib/AuthContext";
import UserNotRegisteredError from "@/components/UserNotRegisteredError";
import StaffCheckScreen from "@/components/StaffCheckScreen";
import PageNotFound from "./lib/PageNotFound";
import AppLayout from "./components/layout/AppLayout";
import RouteError from "./components/layout/RouteError";
import {
  ROUTE_META, recordNavigation, markNavigating, markSettled, setAppRouter, isTabSwitchPending,
} from "@/lib/navigation";

import { lazyRoute, hasPage, preloadLikelyPages } from "@/lib/lazyPages";
import { loaderFor, shouldRevalidate, setLoadersReady } from "@/lib/routeLoaders";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";

function RootLayout() {
  // Warm the likely next screens' code while the phone is idle.
  useEffect(() => { preloadLikelyPages(); }, []);
  return (
    <OfflineProvider>
      {/* One scroll position per history entry: back lands where you were. */}
      <ScrollRestoration getKey={(location) => location.key} />
      <Outlet />
    </OfflineProvider>
  );
}

function AuthGate() {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, isAuthenticated, staffStatus, staffCheckError, retryStaffCheck, signOut } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    } else if (authError.type === 'access_denied') {
      // B6: not staff — the login screen shows the message (router navigation,
      // not a reload, so the message survives).
      return <Navigate to="/login" replace />;
    }
  }

  // B6: staff check (is_staff()) still pending on first sign-in, or failed.
  if (isAuthenticated && staffStatus !== 'staff') {
    return <StaffCheckScreen status={staffStatus} error={staffCheckError} onRetry={retryStaffCheck} onSignOut={() => signOut(true)} />;
  }

  setLoadersReady(true);
  return <Outlet />;
}


// Each screen carries its navigation meta (logical parent + tab) as the
// route handle (src/lib/navigation.js ROUTE_META is the single table).
// Every screen is code-split (src/lib/lazyPages.js); the router loads its
// chunk — and, for the main screens, its first data (src/lib/routeLoaders.js,
// at most 350 ms) — before committing the navigation, so the old screen
// stays up until the new one can render with content.
const appRoutes = ROUTE_META.filter(({ path }) => hasPage(path)).map(({ path, parent, tab }) => (
  loaderFor(path)
    ? { path, lazy: lazyRoute(path), loader: loaderFor(path), shouldRevalidate, handle: { parent, tab } }
    : { path, lazy: lazyRoute(path), handle: { parent, tab } }
));

export const routes = [
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      { path: "/login", element: <Login /> },
      { path: "/auth/callback", element: <AuthCallback /> },
      {
        element: <AuthGate />,
        children: [
          { element: <AppLayout />, children: appRoutes },
          { path: "*", element: <PageNotFound /> },
        ],
      },
    ],
  },
];

// Wraps router.navigate (which every <Link>, useNavigate() and navigate(-1)
// goes through):
// - marks a navigation in flight (history.go is async) for the sheet logic;
// - a navigation started while a sheet's history entry is current REPLACES
//   that entry, so a closed sheet never leaves a dead entry behind.
export function installNavigationHooks(router) {
  const navigate = router.navigate.bind(router);
  router.navigate = (to, opts) => {
    markNavigating();
    if (typeof to !== "number" && router.state.location.state?.__sheet && !opts?.state?.__sheet) {
      opts = { ...opts, replace: true };
    }
    // Page motion (lib/pageMotion.js): a new screen slides in; back slides
    // out. Not for tab switches, sheet entries or same-screen URL changes.
    if (typeof to === "number") {
      setNavDirection(to < 0 ? "back" : "push");
    } else if (!opts?.state?.__sheet && !isTabSwitchPending()) {
      const path = typeof to === "string" ? to.split(/[?#]/)[0] : to?.pathname;
      if (path && path !== router.state.location.pathname) {
        setNavDirection("push");
        opts = { ...opts, viewTransition: true };
      }
    }
    return navigate(to, opts);
  };
  let lastKey = router.state.location.key;
  recordNavigation("POP", router.state.location);
  router.subscribe((state) => {
    if (state.navigation.state !== "idle" || state.location.key === lastKey) return;
    lastKey = state.location.key;
    recordNavigation(state.historyAction, state.location);
    markSettled();
  });
  setAppRouter(router);
  return router;
}

export function createAppRouter() {
  installPageMotion();
  return installNavigationHooks(createBrowserRouter(routes));
}
