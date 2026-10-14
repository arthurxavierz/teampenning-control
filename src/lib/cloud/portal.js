import { PORTAL_URL } from '../config.js'

// Chamada à função do servidor que atende o competidor. Devolve sempre
// { ok, errors, ... }, inclusive quando a internet falha.
export async function portalCall(op, payload = {}) {
  try {
    const res = await fetch(PORTAL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op, ...payload })
    })
    const data = await res.json().catch(() => null)
    if (!data) return { ok: false, errors: ['O servidor não respondeu. Tente de novo em instantes.'] }
    return data
  } catch {
    return { ok: false, errors: ['Sem conexão com a internet. Tente de novo.'] }
  }
}
