import { createClient } from '@supabase/supabase-js'
import { markAllStale } from '@/lib/query-client'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Every successful database write (insert/update/upsert/delete, via db.js or
// a direct supabase.from() call) marks the React Query cache stale, so the
// next screen shown refetches instead of serving pre-save data from the
// 30 s cache (see src/lib/query-client.js).
const isWrite = (method) => method && method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD'
async function fetchWithWriteTracking(input, init) {
  const res = await fetch(input, init)
  try {
    const url = typeof input === 'string' ? input : input?.url
    const method = init?.method || (typeof input === 'object' ? input?.method : 'GET')
    if (res.ok && isWrite(method) && /\/rest\/v1\//.test(url || '')) markAllStale()
  } catch { /* never break a request over cache bookkeeping */ }
  return res
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithWriteTracking },
})
