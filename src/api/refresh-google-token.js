import { supabase } from '@/lib/supabaseClient'

export async function refreshGoogleToken() {
  const { data: { session }, error } = await supabase.auth.refreshSession()
  if (error || !session) throw new Error(error?.message || 'Session refresh failed')
  return session.provider_token ?? null
}
