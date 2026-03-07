import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const forbiddenServiceRole = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY

if (forbiddenServiceRole) {
  throw new Error('No expongas SUPABASE_SERVICE_ROLE_KEY en variables VITE_. Usa solo ANON/PUBLISHABLE en frontend.')
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null
