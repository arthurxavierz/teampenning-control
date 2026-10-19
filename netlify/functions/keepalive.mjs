import { findOrg, serverClient, serverConfig } from '../lib/db.mjs'

// Acesso automático diário ao banco. O plano gratuito do Supabase pausa o
// projeto depois de uma semana sem uso; entre uma etapa e outra isso
// aconteceria. Todo dia às 6h (Brasília) esta função lê e grava no banco e
// deixa a data em organizations.settings.keepAliveAt, que o painel mostra em
// "Segurança dos dados".
export const config = { schedule: '0 9 * * *' }

export default async () => {
  const cfg = serverConfig()
  if (!cfg.serviceKey) {
    console.error('keepalive: falta SUPABASE_SERVICE_ROLE_KEY no Netlify')
    return new Response('sem chave', { status: 500 })
  }
  const client = serverClient(cfg)
  const org = await findOrg(client, cfg.orgSlug, 'id, settings')
  if (!org) {
    console.error('keepalive: organização não encontrada')
    return new Response('sem organização', { status: 500 })
  }
  const { count } = await client.from('events').select('id', { count: 'exact', head: true }).eq('organization_id', org.id)
  const settings = { ...(org.settings || {}), keepAliveAt: new Date().toISOString() }
  const { error } = await client.from('organizations').update({ settings }).eq('id', org.id)
  if (error) {
    console.error('keepalive:', error.message)
    return new Response('erro', { status: 500 })
  }
  console.log(`keepalive ok: ${count ?? 0} eventos`)
  return new Response('ok')
}
