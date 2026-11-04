// @ts-nocheck
// GenFlow connector for Claude (Run 12, Part B). Deploy with JWT verification OFF:
// the function checks the token itself and must answer 401 with the sign-in pointer.
// See .qa-scratch/run12/connector-design.md.
import { createHandler } from './server.js';

const env = (k: string) => Deno.env.get(k);
Deno.serve(createHandler({
  supabaseUrl: env('SUPABASE_URL'),
  anonKey: env('SUPABASE_ANON_KEY'),
  publicUrl: `${env('SUPABASE_URL')}/functions/v1/genflow-mcp`,
  appUrl: env('GENFLOW_APP_URL') || 'https://genflow-pro.vercel.app',
  oauthClientId: env('GENFLOW_MCP_CLIENT_ID'),
  disabled: env('GENFLOW_MCP_DISABLED') === '1',
}));
