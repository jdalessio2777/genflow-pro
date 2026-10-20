import { createBrowserRouter, Navigate, Outlet, ScrollRestoration } from "react-router-dom";
import { OfflineProvider } from "@/lib/OfflineContext";
import { useAuth } from "@/lib/AuthContext";
import UserNotRegisteredError from "@/components/UserNotRegisteredError";
import StaffCheckScreen from "@/components/StaffCheckScreen";
import PageNotFound from "./lib/PageNotFound";
import AppLayout from "./components/layout/AppLayout";
import RouteError from "./components/layout/RouteError";
import {
  ROUTE_META, recordNavigation, markNavigating, markSettled, setAppRouter,
} from "@/lib/navigation";

import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import CustomerForm from "./pages/CustomerForm";
import CustomerDetail from "./pages/CustomerDetail";
import Jobs from "./pages/Jobs";
import JobForm from "./pages/JobForm";
import JobDetail from "./pages/JobDetail";
import Invoices from "./pages/Invoices";
import InvoiceDetail from "./pages/InvoiceDetail";
import Documents from "./pages/Documents";
import QuoteBuilder from "./pages/QuoteBuilder";
import QuoteDetail from "./pages/QuoteDetail";
import DocumentTemplateForm from "./pages/DocumentTemplateForm";
import DocumentFill from "./pages/DocumentFill";
import Catalog from "./pages/Catalog";
import Schedule from "./pages/Schedule";
import RouteMap from "./pages/RouteMap";
import MembershipAgreement from "./pages/MembershipAgreement";
import Inbox from "./pages/Inbox";
import Finance from "./pages/Finance";
import InvoicePDF from "./pages/InvoicePDF";
import Settings from "./pages/Settings";
import Referrals from "./pages/Referrals";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";

function RootLayout() {
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

  return <Outlet />;
}

const PAGES = {
  "/": Dashboard,
  "/customers": Customers,
  "/customers/new": CustomerForm,
  "/customers/:id": CustomerDetail,
  "/customers/:id/edit": CustomerForm,
  "/customers/:id/membership": MembershipAgreement,
  "/jobs": Jobs,
  "/jobs/new": JobForm,
  "/jobs/:id": JobDetail,
  "/jobs/:id/edit": JobForm,
  "/invoices": Invoices,
  "/invoices/:id": InvoiceDetail,
  "/invoices/:id/send": InvoicePDF,
  "/quotes/new": QuoteBuilder,
  "/quotes/:id": QuoteDetail,
  "/documents": Documents,
  "/documents/new": DocumentTemplateForm,
  "/documents/:id/edit": DocumentTemplateForm,
  "/documents/fill/:id": DocumentFill,
  "/catalog": Catalog,
  "/catalog/documents/new": DocumentTemplateForm,
  "/catalog/documents/:id": DocumentTemplateForm,
  "/schedule": Schedule,
  "/route": RouteMap,
  "/inbox": Inbox,
  "/call-list": Inbox,
  "/finance": Finance,
  "/settings": Settings,
  "/referrals": Referrals,
};

// Each screen carries its navigation meta (logical parent + tab) as the
// route handle (src/lib/navigation.js ROUTE_META is the single table).
const appRoutes = ROUTE_META.map(({ path, parent, tab }) => {
  const Page = PAGES[path];
  return { path, element: <Page />, handle: { parent, tab } };
});

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
  return installNavigationHooks(createBrowserRouter(routes));
}
