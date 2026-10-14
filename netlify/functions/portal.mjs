import { createClient } from '@supabase/supabase-js'
import { applyOp, diffState, loadOrgState } from '../../src/lib/cloud/schema.js'
import { runPortal } from '../../src/lib/portal.js'

// Portal do competidor: inscrição pelo site, convites e "já paguei".
// Roda no servidor com a chave service_role, que nunca vai para o navegador.
// As regras são as mesmas do painel (src/lib/core.js), via src/lib/portal.js.

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const orgSlug = process.env.ORG_SLUG || process.env.VITE_ORG_SLUG || ''
const secret = process.env.PORTAL_SECRET || serviceKey

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export default async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, errors: ['Use POST.'] })
  if (!url || !serviceKey) return json(500, { ok: false, errors: ['Servidor sem configuração do banco (SUPABASE_SERVICE_ROLE_KEY).'] })
  let body
  try { body = await req.json() } catch { return json(400, { ok: false, errors: ['Requisição inválida.'] }) }

  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  try {
    const orgQuery = client.from('organizations').select('id').order('created_at').limit(1)
    const { data: orgs, error: orgError } = orgSlug ? await orgQuery.eq('slug', orgSlug) : await orgQuery
    if (orgError || !orgs?.length) return json(500, { ok: false, errors: ['Organização não encontrada no banco.'] })
    const orgId = orgs[0].id

    let recentFailures = 0
    if (body?.op === 'login') {
      const since = new Date(Date.now() - 15 * 60 * 1000).toISOString()
      const cpf = String(body.cpf || '').replace(/\D/g, '')
      const { count } = await client.from('portal_attempts').select('id', { count: 'exact', head: true }).eq('cpf', cpf).eq('ok', false).gte('at', since)
      recentFailures = count || 0
    }

    const state = await loadOrgState(client, orgId, { auditLimit: 0 })
    const result = runPortal(state, body, { secret, recentFailures })

    if (result.attempt) await client.from('portal_attempts').insert({ organization_id: orgId, cpf: result.attempt.cpf, ok: result.attempt.ok })
    if (result.next) {
      for (const op of diffState(state, result.next)) await applyOp(client, orgId, op)
    }
    return json(result.status, result.body)
  } catch (err) {
    console.error(err)
    return json(500, { ok: false, errors: ['Não foi possível concluir agora. Tente de novo em instantes.'] })
  }
}
