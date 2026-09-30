// Configuração de ambiente.
// URL e chave anon do Supabase são públicas por natureza: vão no bundle do
// navegador. A chave service_role NUNCA entra aqui nem em variável VITE_.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// O modo só vira 'supabase' quando as duas variáveis existem E o build pediu
// explicitamente. Sem isso, o app roda em 'local' (localStorage), como no
// protótipo. Assim, publicar sem as variáveis não quebra nada.
export const DATA_MODE =
  import.meta.env.VITE_DATA_MODE === 'supabase' && SUPABASE_URL && SUPABASE_ANON_KEY ? 'supabase' : 'local'

export const isSupabase = DATA_MODE === 'supabase'
