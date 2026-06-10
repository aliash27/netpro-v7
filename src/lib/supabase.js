import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://fvtrwovquavoyakiczrv.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2dHJ3b3ZxdWF2b3lha2ljenJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzOTY3NzgsImV4cCI6MjA5NDk3Mjc3OH0.OJY14qw4tg63IontUgE15OhpVPKFLJI4aOPqU-Z5Vj4'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
})
