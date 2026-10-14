import { ORG_SLUG } from '../config.js'
import { supabase } from '../supabase.js'
import { applyOp, applyRemoteRow, fromRow, loadOrgState, TABLE_BY_NAME, TABLES } from './schema.js'

// Motor de sincronização do navegador.
//
// Organização: o estado inteiro da organização fica em memória. Cada ação gera
// operações (diffState) que entram numa fila gravada no navegador e são
// enviadas em ordem. Sem internet, a fila espera e reenvia sozinha: a mesa de
// pista continua lançando tempos. O Realtime traz o que outras máquinas
// gravaram.
//
// Público: lê só o que as funções public_* devolvem e escuta a tabela
// sync_pulse para saber quando buscar de novo.

const QUEUE_KEY = 'tp-cloud-queue-v1'
const REMOTE_TABLES = TABLES.filter((d) => d.table !== 'contep_records').map((d) => d.table)

let hooks = null
let orgId = null
let scope = 'public'
let queue = readQueue()
let flushing = false
let retryTimer = null
let retryDelay = 2000
let channel = null
let remoteBuffer = []
let remoteTimer = null
let needsReload = false
const watchedEvents = new Set()
let pulseTimer = null
let lastPulse = null

function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || [] } catch { return [] }
}
function writeQueue() {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)) } catch {}
}

const syncStatus = (patch = {}) => hooks?.status({ pending: queue.length, ...patch })

export function pendingIds() {
  const map = {}
  queue.forEach(({ op }) => {
    const set = (map[op.table] ||= new Set())
    if (op.op === 'upsert') op.items.forEach((x) => set.add(x.id))
    if (op.op === 'delete') op.ids.forEach((id) => set.add(id))
  })
  return map
}

// Reaplica sobre um estado recém-carregado o que ainda está na fila, para que
// um recarregamento não apague lançamentos que ainda não subiram.
function overlayQueue(state) {
  queue.forEach(({ op }) => {
    if (op.op === 'meta') { state.contep.year = op.meta.year; state.contep.importedAt = op.meta.importedAt; return }
    const def = TABLE_BY_NAME[op.table]
    const list = def.key === 'contepRecords' ? state.contep.records : def.key === 'contepImports' ? state.contep.imports : state[def.key]
    if (op.op === 'upsert') {
      op.items.forEach((item) => {
        const i = list.findIndex((x) => x.id === item.id)
        if (i >= 0) list[i] = structuredClone(item)
        else list.push(structuredClone(item))
      })
    } else if (op.op === 'delete') {
      const ids = new Set(op.ids)
      for (let i = list.length - 1; i >= 0; i--) if (ids.has(list[i].id)) list.splice(i, 1)
    }
  })
  return state
}

export function enqueue(ops) {
  if (!ops.length) return
  ops.forEach((op) => queue.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, op }))
  writeQueue()
  syncStatus()
  flush()
}

async function flush() {
  if (flushing || !orgId || scope !== 'admin') return
  flushing = true
  clearTimeout(retryTimer)
  try {
    while (queue.length) {
      const entry = queue[0]
      try {
        await applyOp(supabase, orgId, entry.op)
        queue.shift()
        writeQueue()
        retryDelay = 2000
        syncStatus({ online: true, error: '' })
      } catch (err) {
        if (err.permanent) {
          // O banco recusou (permissão ou dado inválido). Repetir não resolve:
          // a operação sai da fila, o erro aparece e o estado é recarregado do
          // servidor para não ficar diferente dele.
          console.error('Sincronização recusada', entry.op, err)
          queue.shift()
          writeQueue()
          syncStatus({ error: `O banco recusou uma alteração (${err.message}). Os dados foram recarregados.` })
          needsReload = true
          continue
        }
        syncStatus({ online: false, error: '' })
        retryTimer = setTimeout(flush, retryDelay)
        retryDelay = Math.min(retryDelay * 2, 30000)
        break
      }
    }
  } finally {
    flushing = false
  }
  if (!queue.length && needsReload) {
    needsReload = false
    reloadAdmin()
  }
}

// Organização ---------------------------------------------------------------

export async function startAdmin(organizationId, h) {
  hooks = h
  orgId = organizationId
  scope = 'admin'
  stopChannel()
  await reloadAdmin()
  subscribeAdmin()
  flush()
}

export async function reloadAdmin() {
  if (!orgId) return
  try {
    const fresh = await loadOrgState(supabase, orgId)
    hooks.replace(overlayQueue(fresh))
    syncStatus({ online: true, loadedAt: new Date().toISOString() })
  } catch (err) {
    console.error(err)
    syncStatus({ online: false, error: navigator.onLine === false ? '' : `Não foi possível carregar os dados: ${err.message}` })
    throw err
  }
}

function flushRemote() {
  remoteTimer = null
  const batch = remoteBuffer
  remoteBuffer = []
  const pending = pendingIds()
  hooks.patch((state) => {
    let changed = false
    const copied = new Set()
    batch.forEach(({ table, eventType, row, old }) => {
      const id = row?.id || old?.id
      if (pending[table]?.has(id)) return
      const def = TABLE_BY_NAME[table]
      if (table === 'organizations') {
        state.contep = { ...state.contep, year: row.contep_year ?? state.contep.year, importedAt: row.contep_imported_at ?? state.contep.importedAt }
        changed = true
        return
      }
      if (!def) return
      if (!copied.has(def.key)) {
        if (def.key === 'contepImports') state.contep = { ...state.contep, imports: [...state.contep.imports] }
        else state[def.key] = [...state[def.key]]
        copied.add(def.key)
      }
      changed = applyRemoteRow(state, table, eventType, row, old) || changed
    })
    return changed
  })
}

function subscribeAdmin() {
  let wasDown = false
  channel = supabase.channel(`org-${orgId}`)
  ;[...REMOTE_TABLES, 'organizations'].forEach((table) => {
    const filter = table === 'organizations' ? `id=eq.${orgId}` : `organization_id=eq.${orgId}`
    channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, (payload) => {
      remoteBuffer.push({ table, eventType: payload.eventType, row: payload.new, old: payload.old })
      if (!remoteTimer) remoteTimer = setTimeout(flushRemote, 80)
    })
  })
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      syncStatus({ live: true })
      // Voltou depois de cair: o que mudou nesse meio tempo não chegou pelo
      // Realtime, então recarrega tudo.
      if (wasDown) { wasDown = false; reloadAdmin().catch(() => {}) }
    } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
      wasDown = true
      syncStatus({ live: false })
    }
  })
}

function stopChannel() {
  if (channel) supabase.removeChannel(channel)
  channel = null
}

export function stopAdmin() {
  stopChannel()
  orgId = null
  scope = 'public'
}

// Público -------------------------------------------------------------------

const rowsTo = (table, rows) => (rows || []).map((row) => fromRow(TABLE_BY_NAME[table], row))

export async function loadPublicBase() {
  const { data, error } = await supabase.rpc('public_base', { p_org: ORG_SLUG || null })
  if (error) throw new Error(error.message)
  if (!data?.organization) throw new Error('Organização não encontrada no banco.')
  return {
    organization: { id: data.organization.id, name: data.organization.name, slug: data.organization.slug, settings: data.organization.settings || {} },
    contepYear: data.organization.contep_year,
    events: rowsTo('events', data.events),
    categories: rowsTo('categories', data.categories).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    competitors: rowsTo('competitors', data.competitors),
    pulse: data.pulse
  }
}

export async function loadPublicEvent(slug) {
  const { data, error } = await supabase.rpc('public_event', { p_event_slug: slug, p_org: ORG_SLUG || null })
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    eventId: data.event_id,
    registrations: rowsTo('registrations', data.registrations),
    registrationMembers: rowsTo('registration_members', data.members),
    runs: rowsTo('runs', data.runs)
  }
}

export async function loadPublicContep() {
  const { data, error } = await supabase.rpc('public_contep', { p_org: ORG_SLUG || null })
  if (error) throw new Error(error.message)
  return rowsTo('contep_records', data)
}

export function watchEvent(slug) {
  watchedEvents.add(slug)
  return () => watchedEvents.delete(slug)
}
export const watchedSlugs = () => [...watchedEvents]

// O pulso muda a cada alteração pública da organização. Várias mudanças em
// sequência (uma passada lançada mexe em várias linhas) viram uma busca só.
export function subscribePulse(organizationId, onChange) {
  const ch = supabase
    .channel(`pulse-${organizationId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sync_pulse', filter: `organization_id=eq.${organizationId}` }, (payload) => {
      const version = payload.new?.version
      if (version != null && version === lastPulse) return
      lastPulse = version
      clearTimeout(pulseTimer)
      pulseTimer = setTimeout(onChange, 700)
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onChange({ resubscribed: true })
    })
  return () => supabase.removeChannel(ch)
}

export const queueSize = () => queue.length
