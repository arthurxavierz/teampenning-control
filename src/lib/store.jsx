import { useEffect, useSyncExternalStore } from 'react'
import { isSupabase } from './config.js'
import { core, fail } from './core.js'
import { createSeed, STATE_VERSION } from './seed.js'
import { supabase } from './supabase.js'
import { cleanCpf, nowIso, uid } from './utils.js'
import * as cloud from './cloud/client.js'
import { portalCall } from './cloud/portal.js'
import { diffState } from './cloud/schema.js'

// Estado do app e ações.
//
// Modo local (sem banco configurado): tudo mora no localStorage, como no
// protótipo. Serve para demonstração e para testes.
//
// Modo nuvem (VITE_DATA_MODE=supabase): a organização logada trabalha com o
// estado completo e cada ação vira operações no banco (ver cloud/client.js).
// O público vê só o que o banco libera, e o competidor fala com a função do
// servidor. As telas são as mesmas nos dois modos.

const KEY = 'team-penning-manager-v2'
const OPERATOR_KEY = 'tp-operator'
const COMPETITOR_KEY = 'tp-competitor'
const PORTAL_KEY = 'tp-portal-token'

export const mode = isSupabase ? 'cloud' : 'local'

export const emptyState = () => ({
  version: STATE_VERSION,
  organizations: [],
  events: [],
  categories: [],
  competitors: [],
  registrations: [],
  registrationMembers: [],
  payments: [],
  runs: [],
  auditLog: [],
  contep: { year: new Date().getFullYear(), importedAt: null, records: [], imports: [] }
})

// Estado salvo por versões anteriores do protótipo ganha os campos novos.
function upgrade(saved) {
  if (saved?.version === STATE_VERSION) return saved
  return null
}

function loadLocal() {
  try {
    const saved = upgrade(JSON.parse(localStorage?.getItem(KEY)))
    if (saved) return saved
  } catch {}
  return createSeed()
}

// Acesso protegido ao armazenamento do navegador (pode não existir nos testes
// ou estar bloqueado em janela anônima).
const localStorage = globalThis.localStorage ?? null
const sessionStorage = globalThis.sessionStorage ?? null
const safeGet = (store, key) => { try { return store?.getItem(key) || '' } catch { return '' } }
const safeSet = (store, key, value) => { try { value ? store.setItem(key, value) : store.removeItem(key) } catch {} }

let state = mode === 'local' ? loadLocal() : emptyState()
let session = {
  operator: safeGet(localStorage, OPERATOR_KEY),
  competitorId: mode === 'local' ? safeGet(sessionStorage, COMPETITOR_KEY) : '',
  portalToken: mode === 'cloud' ? safeGet(sessionStorage, PORTAL_KEY) : '',
  admin: null
}
let status = {
  mode,
  ready: mode === 'local',
  scope: 'public',
  error: '',
  authChecked: mode === 'local',
  sync: { pending: 0, online: true, live: false, error: '' }
}
let snapshot = { state, session, status }
const listeners = new Set()

function emit() {
  snapshot = { state, session, status }
  listeners.forEach((l) => l())
}
const setStatus = (patch) => { status = { ...status, ...patch }; emit() }
const setSession = (patch) => { session = { ...session, ...patch }; emit() }

function persist() {
  if (mode !== 'local') return
  try { localStorage?.setItem(KEY, JSON.stringify(state)) } catch {}
}

if (typeof window !== 'undefined' && mode === 'local') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return
    try {
      state = JSON.parse(e.newValue)
      emit()
    } catch {}
  })
}

const ctx = { actor: () => session.operator || session.admin?.displayName || 'Organização' }

// Toda escrita da organização passa por aqui: copia o estado, aplica, grava e
// avisa as telas. Se a ação devolver { ok: false }, nada é gravado.
function mutate(fn) {
  if (mode === 'cloud' && !session.admin) return fail('Entre na área da organização para fazer alterações.')
  const draft = structuredClone(state)
  const result = fn(draft) || { ok: true }
  if (result.ok === false) return result
  if (mode === 'cloud') cloud.enqueue(diffState(state, draft))
  state = draft
  persist()
  emit()
  return { ok: true, ...result }
}

export const actions = {}
Object.keys(core).forEach((name) => {
  actions[name] = (...args) => mutate((draft) => core[name](draft, ctx, ...args))
})

// Ações do competidor no modo nuvem: vão para a função do servidor, que
// confere quem é e aplica as mesmas regras.
const portalActions = {
  async createRegistration(payload) {
    const res = await portalCall('register', { payload })
    if (res.ok) await refreshPublic()
    return res
  },
  async respondInvite(memberId, value) {
    const res = await portalCall('respond', { token: session.portalToken, memberId, status: value })
    if (res.ok) await refreshPortal(res)
    return res
  },
  async reportPayment(payload) {
    const res = await portalCall('report', { token: session.portalToken, eventId: payload.eventId, amount: payload.amount, note: payload.note })
    if (res.ok) await refreshPortal(res)
    return res
  }
}
if (mode === 'cloud') {
  Object.entries(portalActions).forEach(([name, fn]) => {
    const local = actions[name]
    actions[name] = (...args) => (session.admin ? local(...args) : fn(...args))
  })
}

Object.assign(actions, {
  reset() {
    if (mode !== 'local') return fail('A demonstração só existe no modo local.')
    state = createSeed()
    persist()
    emit()
    return { ok: true }
  },

  // Backup completo em JSON. No modo nuvem serve como cópia de segurança.
  exportBackup() {
    return JSON.stringify({ app: 'team-penning', exportedAt: nowIso(), state }, null, 2)
  },

  // Local: substitui tudo. Nuvem: soma ao banco (nada é apagado), útil para
  // levar ao banco o que foi feito no protótipo.
  importBackup(text) {
    let data
    try { data = JSON.parse(text) } catch { return fail('O arquivo não é um backup válido.') }
    const next = data?.state
    // 'achilles-team-penning' é o nome usado pelas cópias antigas.
    if (!['team-penning', 'achilles-team-penning'].includes(data?.app) || !next) return fail('Este arquivo não é um backup do Team Penning.')
    const required = ['events', 'categories', 'competitors', 'registrations', 'registrationMembers', 'payments', 'runs', 'auditLog', 'contep']
    if (required.some((k) => !next[k])) return fail('O backup está incompleto.')
    next.contep.records = (next.contep.records || []).map((r) => (r.id ? r : { ...r, id: uid('ctp') }))
    next.contep.imports = next.contep.imports || []
    if (mode === 'local') {
      state = { ...next, version: STATE_VERSION }
      persist()
      emit()
      return { ok: true, events: next.events.length }
    }
    return mutate((draft) => {
      const merge = (list, incoming) => {
        const byId = new Map(list.map((x, i) => [x.id, i]))
        incoming.forEach((item) => {
          if (byId.has(item.id)) list[byId.get(item.id)] = item
          else list.push(item)
        })
      }
      ;['events', 'categories', 'competitors', 'registrations', 'registrationMembers', 'payments', 'runs', 'auditLog'].forEach((k) => merge(draft[k], next[k]))
      merge(draft.contep.records, next.contep.records)
      merge(draft.contep.imports, next.contep.imports)
      return { events: next.events.length }
    })
  },

  setOperator(name) {
    setSession({ operator: name.trim() })
    safeSet(localStorage, OPERATOR_KEY, session.operator)
  },

  // Competidor. Local: CPF mais os quatro últimos dígitos do celular. Nuvem: a
  // mesma conferência é feita no servidor, que devolve um token assinado.
  loginCompetitor(cpf, phoneEnd) {
    if (mode === 'cloud') return loginPortal(cpf, phoneEnd)
    const c = state.competitors.find((x) => cleanCpf(x.cpf) && cleanCpf(x.cpf) === cleanCpf(cpf))
    if (!c) return fail('CPF não encontrado. Faça uma inscrição ou confira o número.')
    if (String(c.phone || '').replace(/\D/g, '').slice(-4) !== String(phoneEnd).replace(/\D/g, '')) {
      return fail('Os dígitos do telefone não conferem com o cadastro.')
    }
    setSession({ competitorId: c.id })
    safeSet(sessionStorage, COMPETITOR_KEY, c.id)
    return { ok: true }
  },

  logoutCompetitor() {
    setSession({ competitorId: '', portalToken: '' })
    safeSet(sessionStorage, COMPETITOR_KEY, '')
    safeSet(sessionStorage, PORTAL_KEY, '')
    portalSlice = null
    if (mode === 'cloud') rebuildPublic()
  },

  // Organização (modo nuvem)
  async signIn(email, password) {
    if (mode !== 'cloud') return fail('O login só existe com o banco ligado.')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) return fail(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message)
    return startSession()
  },

  async signOut() {
    if (mode !== 'cloud') return { ok: true }
    if (cloud.queueSize() > 0 && !window.confirm('Há lançamentos que ainda não subiram para o banco. Sair agora pode perdê-los. Sair mesmo assim?')) return { ok: false, errors: [] }
    await supabase.auth.signOut()
    cloud.stopAdmin()
    setSession({ admin: null })
    setStatus({ scope: 'public', ready: false })
    await startPublic()
    return { ok: true }
  },

  async changePassword(password) {
    if (String(password).length < 8) return fail('Use pelo menos 8 caracteres.')
    const { error } = await supabase.auth.updateUser({ password })
    return error ? fail(error.message) : { ok: true }
  },

  async reloadFromServer() {
    if (mode !== 'cloud') return { ok: true }
    try {
      if (session.admin) await cloud.reloadAdmin()
      else await refreshPublic()
      return { ok: true }
    } catch (err) {
      return fail(err.message)
    }
  },

  // Equipe da organização: e-mails autorizados a entrar no painel.
  async listTeam() {
    if (!session.admin) return []
    const { data } = await supabase.from('organization_members').select('*').eq('organization_id', session.admin.organizationId).order('created_at')
    return data || []
  },

  async addTeamMember(email, role = 'admin', displayName = '') {
    if (!session.admin) return fail('Sem permissão.')
    const clean = String(email).trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return fail('E-mail inválido.')
    const { error } = await supabase.from('organization_members').insert({ organization_id: session.admin.organizationId, email: clean, role, display_name: displayName || null })
    return error ? fail(error.code === '23505' ? 'Este e-mail já está na equipe.' : error.message) : { ok: true }
  },

  async removeTeamMember(id) {
    if (!session.admin) return fail('Sem permissão.')
    const { error } = await supabase.from('organization_members').delete().eq('id', id)
    return error ? fail(error.message) : { ok: true }
  }
})

// Público e competidor no modo nuvem ----------------------------------------

let publicBase = null
const publicEvents = {}
let portalSlice = null
let stopPulse = null
let firstPulse = true

const mergeById = (base, extra) => {
  const map = new Map(base.map((x) => [x.id, x]))
  extra.forEach((x) => map.set(x.id, { ...map.get(x.id), ...x }))
  return [...map.values()]
}

// Monta o estado público: base (eventos, categorias, competidores), os
// eventos abertos na tela e, se houver competidor logado, a parte dele.
function rebuildPublic() {
  if (session.admin || !publicBase) return
  const next = emptyState()
  next.organizations = [publicBase.organization]
  next.events = publicBase.events
  next.categories = publicBase.categories
  next.competitors = publicBase.competitors
  next.contep.year = publicBase.contepYear || next.contep.year
  next.contep.records = publicBase.contepRecords || []
  Object.values(publicEvents).forEach((ev) => {
    if (!ev) return
    next.registrations.push(...ev.registrations)
    next.registrationMembers.push(...ev.registrationMembers)
    next.runs.push(...ev.runs)
  })
  if (portalSlice) {
    next.events = mergeById(next.events, portalSlice.events || [])
    next.categories = mergeById(next.categories, portalSlice.categories || [])
    next.competitors = mergeById(next.competitors, portalSlice.competitors || [])
    next.registrations = mergeById(next.registrations, portalSlice.registrations || [])
    next.registrationMembers = mergeById(next.registrationMembers, portalSlice.registrationMembers || [])
    next.runs = mergeById(next.runs, portalSlice.runs || [])
    next.payments = portalSlice.payments || []
  }
  state = next
  emit()
}

async function refreshPublic() {
  const contepRecords = publicBase?.contepRecords
  publicBase = await cloud.loadPublicBase()
  if (contepRecords) publicBase.contepRecords = contepRecords
  await Promise.all(cloud.watchedSlugs().map(async (slug) => { publicEvents[slug] = await cloud.loadPublicEvent(slug) }))
  if (session.portalToken) await refreshPortal()
  rebuildPublic()
}

async function refreshPortal(response) {
  const res = response?.slice ? response : await portalCall('me', { token: session.portalToken })
  if (!res.ok) {
    if (res.expired) actions.logoutCompetitor()
    return
  }
  portalSlice = res.slice
  setSession({ competitorId: res.slice.competitorId })
  rebuildPublic()
}

async function loginPortal(cpf, phoneEnd) {
  const res = await portalCall('login', { cpf, phoneEnd })
  if (!res.ok) return res
  safeSet(sessionStorage, PORTAL_KEY, res.token)
  session = { ...session, portalToken: res.token }
  await refreshPortal(res)
  return { ok: true }
}

async function startPublic() {
  try {
    publicBase = await cloud.loadPublicBase()
    if (session.portalToken) await refreshPortal()
    rebuildPublic()
    setStatus({ ready: true, scope: 'public', error: '' })
    if (stopPulse) stopPulse()
    firstPulse = true
    stopPulse = cloud.subscribePulse(publicBase.organization.id, (info) => {
      if (info?.resubscribed && firstPulse) { firstPulse = false; return }
      if (!session.admin) refreshPublic().catch(() => {})
    })
  } catch (err) {
    setStatus({ ready: true, error: `Não foi possível carregar os dados. ${err.message}` })
  }
}

// Abre a sessão da organização: assume os convites do e-mail e carrega tudo.
async function startSession() {
  const { data, error } = await supabase.rpc('claim_membership')
  if (error) return fail(error.message)
  const membership = (data || [])[0]
  if (!membership) {
    await supabase.auth.signOut()
    return fail('Este e-mail não faz parte da equipe da organização. Peça para ser adicionado.')
  }
  const { data: userData } = await supabase.auth.getUser()
  const email = userData?.user?.email || membership.email
  if (stopPulse) { stopPulse(); stopPulse = null }
  setSession({ admin: { organizationId: membership.organization_id, role: membership.role, email, displayName: membership.display_name || email.split('@')[0] } })
  setStatus({ ready: false, scope: 'admin' })
  try {
    await cloud.startAdmin(membership.organization_id, {
      replace: (next) => { state = next; emit() },
      patch: (fn) => {
        const next = { ...state }
        if (fn(next)) { state = next; emit() }
      },
      status: (patch) => setStatus({ sync: { ...status.sync, ...patch } })
    })
    setStatus({ ready: true, error: '' })
    return { ok: true }
  } catch (err) {
    setStatus({ ready: true, error: `Não foi possível carregar os dados. ${err.message}` })
    return fail(err.message)
  }
}

async function bootCloud() {
  const { data } = await supabase.auth.getSession()
  if (data?.session) {
    const res = await startSession()
    if (res.ok) { setStatus({ authChecked: true }); return }
  }
  setStatus({ authChecked: true })
  await startPublic()
}

if (mode === 'cloud' && typeof window !== 'undefined') {
  bootCloud()
  window.addEventListener('online', () => actions.reloadFromServer())
}

// Mantém os dados de um evento público carregados e ao vivo enquanto a tela
// estiver aberta. No modo local e para a organização não faz nada.
export function usePublicEvent(slug) {
  useEffect(() => {
    if (mode !== 'cloud' || !slug) return undefined
    const unwatch = cloud.watchEvent(slug)
    if (!session.admin && publicEvents[slug] === undefined) {
      cloud.loadPublicEvent(slug).then((ev) => { publicEvents[slug] = ev; rebuildPublic() }).catch(() => {})
    }
    return unwatch
  }, [slug])
}

// A base CONTEP pública só é buscada por quem está se inscrevendo.
export function usePublicContep() {
  useEffect(() => {
    if (mode !== 'cloud' || session.admin || publicBase?.contepRecords) return
    cloud.loadPublicContep().then((records) => {
      if (publicBase) publicBase.contepRecords = records
      rebuildPublic()
    }).catch(() => {})
  }, [])
}

const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useStore() {
  const snap = useSyncExternalStore(subscribe, () => snapshot)
  return { state: snap.state, session: snap.session, status: snap.status, actions }
}

export const getState = () => state
