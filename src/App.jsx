import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@/lib/AuthContext';
import { createAppRouter } from './router';

// Data router (feel redesign Phase 1): routes, the navigation model and
// scroll restoration live in src/router.jsx.
const router = createAppRouter();

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <RouterProvider router={router} fallbackElement={<div className="fixed inset-0 bg-background" />} />
        {/* sonner is the only toaster. (The old shadcn <Toaster /> rendered two
            empty full-width fixed divs over the top 32 px of every screen and
            swallowed taps on back/edit/New buttons — F-03.) */}
        <SonnerToaster richColors position="top-right" offset={{ top: "calc(var(--sat) + 12px)" }} mobileOffset={{ top: "calc(var(--sat) + 8px)" }} />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
