/**
 * Legacy Base44 client stub. Data access uses `db` from `@/lib/db`;
 * auth uses Supabase in `AuthContext`; integrations use `@/lib/coreIntegrations`.
 */
export const base44 = {
  auth: {
    me: async () => {
      throw new Error('Auth is handled by Supabase — use useAuth() or supabase.auth.getUser()');
    },
    logout: () => {},
    redirectToLogin: () => {},
  },
  entities: {},
  integrations: { Core: {} },
};
