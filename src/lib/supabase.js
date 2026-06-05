import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://fvtrwovquavoyakiczrv.supabase.co'
const SUPABASE_KEY = 'sb_publishable_lELYDMRcDddwfiruCyKxCg_uHAhdhBb'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
})
