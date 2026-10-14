import { createHmac, timingSafeEqual } from 'node:crypto'
import { core } from './core.js'
import { cleanCpf, cleanPhone } from './utils.js'

// Regras do portal do competidor, executadas no servidor (função Netlify).
// Recebe o estado da organização já carregado e devolve a resposta e, quando
// a ação grava algo, o estado novo. Não fala com o banco: isso fica na função.

const TOKEN_HOURS = 12
export const MAX_FAILURES = 8

const b64 = (s) => Buffer.from(s).toString('base64url')
const unb64 = (s) => Buffer.from(s, 'base64url').toString()

export function signToken(payload, secret) {
  const body = b64(JSON.stringify(payload))
  const sig = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyToken(token, secret, now = Date.now()) {
  const [body, sig] = String(token || '').split('.')
  if (!body || !sig) return null
  const expected = createHmac('sha256', secret).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(unb64(body))
    if (!payload.exp || payload.exp < now) return null
    return payload
  } catch {
    return null
  }
}

const publicCompetitor = (c) => ({ id: c.id, name: c.name, nickname: c.nickname, contepCode: c.contepCode, handicap: c.handicap, handicapSource: c.handicapSource })

// Tudo o que o competidor precisa ver na área dele, e nada além disso.
export function competitorSlice(state, competitorId) {
  const self = state.competitors.find((c) => c.id === competitorId)
  const mine = state.registrationMembers.filter((m) => m.competitorId === competitorId)
  const regIds = new Set(mine.map((m) => m.registrationId))
  const registrations = state.registrations.filter((r) => regIds.has(r.id))
  const registrationMembers = state.registrationMembers.filter((m) => regIds.has(m.registrationId))
  const eventIds = new Set(registrations.map((r) => r.eventId))
  const payments = state.payments.filter((p) => p.competitorId === competitorId)
  payments.forEach((p) => eventIds.add(p.eventId))
  const peopleIds = new Set(registrationMembers.map((m) => m.competitorId))
  return {
    competitorId,
    events: state.events.filter((e) => eventIds.has(e.id)),
    categories: state.categories.filter((c) => eventIds.has(c.eventId)),
    competitors: state.competitors
      .filter((c) => peopleIds.has(c.id) || c.id === competitorId)
      .map((c) => (c.id === competitorId ? { ...publicCompetitor(c), cpf: self.cpf, phone: self.phone, birthDate: self.birthDate, gender: self.gender } : publicCompetitor(c))),
    registrations,
    registrationMembers,
    payments,
    runs: state.runs.filter((r) => regIds.has(r.registrationId))
  }
}

const PERSON_FIELDS = ['competitorId', 'cpf', 'name', 'nickname', 'phone', 'contepCode', 'handicap', 'birthDate', 'gender', 'city']
const cleanPerson = (p) => Object.fromEntries(PERSON_FIELDS.filter((k) => p?.[k] !== undefined).map((k) => [k, typeof p[k] === 'string' ? p[k].slice(0, 120) : p[k]]))

const ok = (body) => ({ status: 200, body: { ok: true, ...body } })
const no = (status, ...errors) => ({ status, body: { ok: false, errors } })

// recentFailures: tentativas erradas recentes para o CPF (só no login).
export function runPortal(state, body, { secret, now = Date.now(), recentFailures = 0 } = {}) {
  const op = body?.op
  const ctxFor = (name) => ({ actor: () => (name ? `${name} (site)` : 'Site') })

  if (op === 'login') {
    const cpf = cleanCpf(body.cpf)
    if (cpf.length !== 11) return no(400, 'Informe o CPF completo.')
    if (recentFailures >= MAX_FAILURES) return { ...no(429, 'Muitas tentativas. Aguarde 15 minutos e tente de novo.'), attempt: { cpf, ok: false } }
    const c = state.competitors.find((x) => cleanCpf(x.cpf) === cpf)
    const end = cleanPhone(body.phoneEnd)
    if (!c || end.length !== 4 || cleanPhone(c.phone).slice(-4) !== end) {
      return { ...no(401, 'CPF ou dígitos do celular não conferem com o cadastro.'), attempt: { cpf, ok: false } }
    }
    const token = signToken({ c: c.id, o: state.organizations[0]?.id, exp: now + TOKEN_HOURS * 3600 * 1000 }, secret)
    return { ...ok({ token, slice: competitorSlice(state, c.id) }), attempt: { cpf, ok: true } }
  }

  if (op === 'register') {
    const p = body.payload || {}
    if (!Array.isArray(p.people) || p.people.length !== 3) return no(400, 'O trio precisa ter exatamente três competidores.')
    const draft = structuredClone(state)
    const creator = Number(p.creatorIndex) || 0
    const creatorName = p.people[creator]?.name || draft.competitors.find((c) => c.id === p.people[creator]?.competitorId)?.name
    const res = core.createRegistration(draft, ctxFor(creatorName), {
      eventId: String(p.eventId || ''),
      categoryId: String(p.categoryId || ''),
      people: p.people.map(cleanPerson),
      creatorIndex: Math.min(2, Math.max(0, creator)),
      termsAccepted: Boolean(p.termsAccepted),
      byOrganization: false,
      copies: 1
    })
    if (res?.ok === false) return no(422, ...res.errors)
    return { ...ok({ registrationId: res.registrationId }), next: draft }
  }

  const session = verifyToken(body.token, secret, now)
  if (!session || (state.organizations[0] && session.o !== state.organizations[0].id)) return { status: 401, body: { ok: false, expired: true, errors: ['Sua sessão expirou. Entre de novo.'] } }
  const competitorId = session.c
  const me = state.competitors.find((c) => c.id === competitorId)
  if (!me) return { status: 401, body: { ok: false, expired: true, errors: ['Cadastro não encontrado.'] } }

  if (op === 'me') return ok({ slice: competitorSlice(state, competitorId) })

  if (op === 'respond') {
    const draft = structuredClone(state)
    const res = core.respondInvite(draft, ctxFor(me.name), String(body.memberId || ''), body.status === 'accepted' ? 'accepted' : 'declined', { competitorId })
    if (res?.ok === false) return no(422, ...res.errors)
    return { ...ok({ slice: competitorSlice(draft, competitorId) }), next: draft }
  }

  if (op === 'report') {
    const draft = structuredClone(state)
    const takesPart = draft.registrationMembers.some((m) => m.competitorId === competitorId && draft.registrations.find((r) => r.id === m.registrationId)?.eventId === body.eventId)
    if (!takesPart) return no(403, 'Você não tem inscrição neste evento.')
    const res = core.reportPayment(draft, ctxFor(me.name), { eventId: String(body.eventId), competitorId, amount: Number(body.amount), note: String(body.note || '') })
    if (res?.ok === false) return no(422, ...res.errors)
    return { ...ok({ slice: competitorSlice(draft, competitorId) }), next: draft }
  }

  return no(400, 'Operação desconhecida.')
}
