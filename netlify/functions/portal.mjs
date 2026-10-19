import { applyOp, diffState, loadOrgState } from '../../src/lib/cloud/schema.js'
import { runPortal } from '../../src/lib/portal.js'
import { env, findOrg, serverClient, serverConfig } from '../lib/db.mjs'

// Portal do competidor: inscrição pelo site, convites e "já paguei".
// Roda no servidor com a chave service_role, que nunca vai para o navegador.
// As regras são as mesmas do painel (src/lib/core.js), via src/lib/portal.js.

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export default async (req) => {
  const cfg = serverConfig()
  const secret = env('PORTAL_SECRET') || cfg.serviceKey
  if (req.method !== 'POST') return json(405, { ok: false, errors: ['Use POST.'] })
  if (!cfg.serviceKey) return json(500, { ok: false, errors: ['Servidor sem a chave do banco (SUPABASE_SERVICE_ROLE_KEY no Netlify).'] })
  let body
  try { body = await req.json() } catch { return json(400, { ok: false, errors: ['Requisição inválida.'] }) }

  const client = serverClient(cfg)
  try {
    const org = await findOrg(client, cfg.orgSlug)
    if (!org) return json(500, { ok: false, errors: ['Organização não encontrada no banco.'] })
    const orgId = org.id

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
