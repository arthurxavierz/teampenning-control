import { createClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabase } from './config.js'

// Cliente único. Retorna null quando o app está em modo local, para que
// importar este arquivo seja inofensivo enquanto o banco não está configurado.
let client = null
if (isSupabase) {
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  })
}

export const supabase = client
export const getSupabase = () => client
