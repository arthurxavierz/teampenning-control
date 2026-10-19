import { createClient } from '@supabase/supabase-js'

// Acesso ao banco pelas funções do servidor, com a chave service_role.
// As variáveis de [build.environment] do netlify.toml só existem no build. Em
// execução, a função enxerga só as variáveis cadastradas no painel do
// Netlify. Por isso a URL do banco e a organização (públicas) têm um padrão
// aqui; a chave secreta vem obrigatoriamente do painel.
const DEFAULT_URL = 'https://pqtxzpnbpfsjswhqvixu.supabase.co'
const DEFAULT_ORG = 'ctm'
export const env = (name) => globalThis.Netlify?.env?.get?.(name) || process.env[name] || ''

export function serverConfig() {
  return {
    url: env('SUPABASE_URL') || env('VITE_SUPABASE_URL') || DEFAULT_URL,
    serviceKey: env('SUPABASE_SERVICE_ROLE_KEY'),
    orgSlug: env('ORG_SLUG') || env('VITE_ORG_SLUG') || DEFAULT_ORG
  }
}

export const serverClient = ({ url, serviceKey }) =>
  createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

// Organização desta instalação (pelo slug, ou a primeira cadastrada).
export async function findOrg(client, orgSlug, columns = 'id') {
  const query = client.from('organizations').select(columns).order('created_at').limit(1)
  const { data, error } = orgSlug ? await query.eq('slug', orgSlug) : await query
  if (error || !data?.length) return null
  return data[0]
}
