import { createClient } from '@supabase/supabase-js'

//const url = import.meta.env.VITE_SUPABASE_URL
//const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

//if (!url || !anonKey) {
 // console.warn('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — check your .env')
//}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      storageKey: 'ledger-auth',
      storage: window.localStorage,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    }
  })

