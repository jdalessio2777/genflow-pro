import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { sendConfirmationEmail } from '@/lib/gmail';

import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import CustomerForm from './pages/CustomerForm';
import CustomerDetail from './pages/CustomerDetail';
import Jobs from './pages/Jobs';
import JobForm from './pages/JobForm';
import JobDetail from './pages/JobDetail';
import Parts from './pages/Parts';
import Invoices from './pages/Invoices';
import InvoiceDetail from './pages/InvoiceDetail';
import Documents from './pages/Documents';
import DocumentTemplateForm from './pages/DocumentTemplateForm';
import DocumentFill from './pages/DocumentFill';
import Catalog from './pages/Catalog';
import QuotePDF from './pages/QuotePDF';
import QuoteApproval from './pages/QuoteApproval';
import Schedule from './pages/Schedule';
import RouteMap from './pages/RouteMap';
import MembershipAgreement from './pages/MembershipAgreement';
import Inbox from './pages/Inbox';
import Finance from './pages/Finance';
import InvoicePDF from './pages/InvoicePDF';
import Settings from './pages/Settings';
import Referrals from './pages/Referrals';
import Login from './pages/Login';
import AuthCallback from './pages/AuthCallback';
import { OfflineProvider } from '@/lib/OfflineContext';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, user, googleToken } = useAuth();

  useEffect(() => {
    if (!googleToken || !user) return;
    let cancelled = false;

    async function sendPendingConfirmations() {
      try {
        const { data: pendingJobs } = await supabase
          .from('jobs')
          .select('*')
          .eq('pending_confirmation', true)
          .is('confirmation_sent_at', null);

        if (!pendingJobs?.length || cancelled) return;

        for (const job of pendingJobs) {
          if (cancelled) break;
          try {
            const { data: customers } = await supabase
              .from('customers')
              .select('*')
              .eq('id', job.customer_id);
            const customer = customers?.[0];
            if (!customer?.email) continue;

            const techFirstName = (job.assigned_to_name || '').split(' ')[0] || 'our technician';
            await sendConfirmationEmail({ customer, job, techFirstName, accessToken: googleToken });

            await supabase
              .from('jobs')
              .update({ pending_confirmation: false, confirmation_sent_at: new Date().toISOString() })
              .eq('id', job.id);

            toast.success(`Confirmation sent to ${customer.name}`);
          } catch (e) {
            console.warn('[AutoConfirm] Failed for job', job.id, e.message);
          }
        }
      } catch (e) {
        console.warn('[AutoConfirm] Failed to fetch pending jobs', e.message);
      }
    }

    sendPendingConfirmations();
    return () => { cancelled = true; };
  }, [googleToken, user]);

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
    }
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/new" element={<CustomerForm />} />
        <Route path="/customers/:id" element={<CustomerDetail />} />
        <Route path="/customers/:id/edit" element={<CustomerForm />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/jobs/new" element={<JobForm />} />
        <Route path="/jobs/:id" element={<JobDetail />} />
        <Route path="/jobs/:id/edit" element={<JobForm />} />
        <Route path="/jobs/:id/quote" element={<QuotePDF />} />
        <Route path="/parts" element={<Parts />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/invoices/:id" element={<InvoiceDetail />} />
        <Route path="/invoices/:id/send" element={<InvoicePDF />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/documents/new" element={<DocumentTemplateForm />} />
        <Route path="/documents/:id/edit" element={<DocumentTemplateForm />} />
        <Route path="/documents/fill/:id" element={<DocumentFill />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/catalog/documents/new" element={<DocumentTemplateForm />} />
        <Route path="/catalog/documents/:id" element={<DocumentTemplateForm />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/route" element={<RouteMap />} />
        <Route path="/customers/:id/membership" element={<MembershipAgreement />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/call-list" element={<Inbox />} />
        <Route path="/finance" element={<Finance />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/referrals" element={<Referrals />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <OfflineProvider>
            <Routes>
              {/* PUBLIC routes — no auth needed */}
              <Route path="/approve-quote/:jobId/:token" element={<QuoteApproval />} />
              <Route path="/login" element={<Login />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              {/* All authenticated routes */}
              <Route path="/*" element={<AuthenticatedApp />} />
            </Routes>
          </OfflineProvider>
        </Router>
        <Toaster />
        <SonnerToaster richColors position="top-right" />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App