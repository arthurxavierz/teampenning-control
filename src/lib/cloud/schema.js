// Ponte entre o estado do app e as tabelas do Supabase. É usada pelo navegador
// (organização) e pela função do servidor (portal do competidor), então não
// pode depender de nada do navegador.
//
// Cada coleção do estado vira uma tabela. Os campos conhecidos têm coluna
// própria (bom para relatórios em SQL) e o que sobrar vai para a coluna
// "extra", em JSON. Assim um campo novo no app não quebra a sincronização.

const T = (table, key, cols, opts = {}) => ({ table, key, cols, ...opts })

// Tipos: t texto, n número, i inteiro, b booleano, d data, ts data e hora, j JSON
export const TABLES = [
  T('events', 'events', {
    name: 't', slug: 't', status: 't', active: 'b', date: 'd', registration_opens: 'd', registration_closes: 'd',
    venue: 't', city: 't', state: 't', description: 't', registration_price: 'n', series: 't',
    pix: 'j', limits: 'j', terms: 't', cattle: 'j', schedule: 'j', occurrences: 'j', arena: 'j', homologated: 'j'
  }),
  T('categories', 'categories', {
    event_id: 't', name: 't', max_handicap: 'n', qualifying_runs: 'i', best_times_count: 'i', finalists_count: 'i',
    final_runs: 'i', carry_qualifying: 'b', tiebreak: 't', color: 't', time_limit: 'n', max_member_handicap: 'n',
    max_age: 'i', max_age_sum: 'i', gender: 't', prize: 'j', sort_order: 'i'
  }),
  T('competitors', 'competitors', {
    name: 't', nickname: 't', cpf: 't', phone: 't', contep_code: 't', handicap: 'n', handicap_source: 't',
    birth_date: 'd', gender: 't', city: 't'
  }),
  T('registrations', 'registrations', {
    event_id: 't', category_id: 't', created_by_competitor_id: 't', status: 't', created_at: 'ts',
    terms_accepted_at: 'ts', cancelled_at: 'ts', cancel_reason: 't', channel: 't'
  }),
  T('registration_members', 'registrationMembers', {
    registration_id: 't', competitor_id: 't', position: 'i', confirmation_status: 't', payment_status: 't',
    handicap_snapshot: 'n', price: 'n', responded_at: 'ts', paid_at: 'ts'
  }),
  T('payments', 'payments', {
    event_id: 't', competitor_id: 't', amount: 'n', method: 't', status: 't', note: 't', created_at: 'ts',
    confirmed_at: 'ts', confirmed_by: 't', rejected_at: 'ts', rejected_by: 't', reject_reason: 't'
  }),
  T('runs', 'runs', {
    event_id: 't', registration_id: 't', category_id: 't', stage: 't', runoff_for: 't', round: 'i', number: 'i',
    cattle: 'i', status: 't', time: 'n', occurrence: 't', note: 't', recorded_at: 'ts', recorded_by: 't'
  }),
  T('audit_log', 'auditLog', { event_id: 't', at: 'ts', actor: 't', action: 't', summary: 't', detail: 'j' }, { appendOnly: true }),
  T('contep_records', 'contepRecords', { contep_code: 't', name: 't', cpf: 't', handicap: 'n' }),
  T('contep_imports', 'contepImports', { at: 'ts' }, { appendOnly: true })
]

export const TABLE_BY_NAME = Object.fromEntries(TABLES.map((d) => [d.table, d]))

const toSnake = (k) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
const toCamel = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())

function toColumn(type, value) {
  if (value === undefined) return null
  if (type === 't') return value == null ? null : String(value)
  if (value === '' || value == null) return null
  if (type === 'n') return Number.isFinite(Number(value)) ? Number(value) : null
  if (type === 'i') return Number.isFinite(Number(value)) ? Math.round(Number(value)) : null
  if (type === 'b') return Boolean(value)
  return value
}

export function toRow(def, obj, organizationId) {
  const row = { id: obj.id, organization_id: organizationId }
  const extra = {}
  Object.entries(obj).forEach(([key, value]) => {
    if (key === 'id' || key === 'organizationId') return
    const col = toSnake(key)
    if (def.cols[col]) row[col] = toColumn(def.cols[col], value)
    else if (value !== undefined) extra[key] = value
  })
  Object.keys(def.cols).forEach((col) => { if (!(col in row)) row[col] = null })
  row.extra = extra
  return row
}

export function fromRow(def, row) {
  const obj = { ...(row.extra || {}), id: row.id }
  Object.entries(def.cols).forEach(([col, type]) => {
    let value = row[col]
    if (value === undefined) return
    if (value == null) {
      if (type === 't') value = ''
      else if (type === 'd') value = ''
    }
    obj[toCamel(col)] = value
  })
  return obj
}

// Coleções como listas, inclusive as que moram dentro de state.contep.
export function collectionsOf(state) {
  return {
    events: state.events || [],
    categories: state.categories || [],
    competitors: state.competitors || [],
    registrations: state.registrations || [],
    registrationMembers: state.registrationMembers || [],
    payments: state.payments || [],
    runs: state.runs || [],
    auditLog: state.auditLog || [],
    contepRecords: state.contep?.records || [],
    contepImports: state.contep?.imports || []
  }
}

// Diferença entre dois estados em operações de banco. A ordem respeita as
// dependências: primeiro o que é referenciado (evento, categoria, competidor),
// depois o que referencia. Exclusões vêm por último, na ordem inversa.
export function diffState(prev, next) {
  const a = collectionsOf(prev)
  const b = collectionsOf(next)
  const upserts = []
  const deletes = []
  TABLES.forEach((def) => {
    const before = new Map(a[def.key].map((x) => [x.id, x]))
    const changed = []
    b[def.key].forEach((item) => {
      const old = before.get(item.id)
      if (!old) changed.push(item)
      else if (!def.appendOnly && old !== item && JSON.stringify(old) !== JSON.stringify(item)) changed.push(item)
      before.delete(item.id)
    })
    if (changed.length) upserts.push({ table: def.table, op: 'upsert', items: changed })
    if (!def.appendOnly && before.size) deletes.unshift({ table: def.table, op: 'delete', ids: [...before.keys()] })
  })
  const ops = [...upserts, ...deletes]
  const metaBefore = { year: prev.contep?.year, importedAt: prev.contep?.importedAt }
  const metaAfter = { year: next.contep?.year, importedAt: next.contep?.importedAt }
  if (JSON.stringify(metaBefore) !== JSON.stringify(metaAfter)) ops.push({ table: 'organizations', op: 'meta', meta: metaAfter })
  return ops
}

const chunk = (list, size) => {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

// Executa uma operação no banco. Lança erro com .permanent quando repetir não
// adianta (permissão, dado inválido).
export async function applyOp(client, organizationId, op) {
  const check = (res) => {
    if (res.error) {
      const err = new Error(res.error.message || 'Erro no banco')
      const status = Number(res.status || 0)
      err.permanent = status >= 400 && status < 500 && status !== 408 && status !== 429
      err.code = res.error.code
      throw err
    }
  }
  if (op.op === 'meta') {
    check(await client.from('organizations').update({ contep_year: op.meta.year ?? null, contep_imported_at: op.meta.importedAt || null }).eq('id', organizationId))
    return
  }
  const def = TABLE_BY_NAME[op.table]
  if (op.op === 'upsert') {
    for (const part of chunk(op.items, 400)) {
      check(await client.from(op.table).upsert(part.map((x) => toRow(def, x, organizationId)), { onConflict: 'id' }))
    }
  } else if (op.op === 'delete') {
    for (const part of chunk(op.ids, 80)) {
      check(await client.from(op.table).delete().eq('organization_id', organizationId).in('id', part))
    }
  }
}

async function fetchAll(client, table, organizationId, { order = 'id', ascending = true, limit = Infinity } = {}) {
  const out = []
  const page = 1000
  for (let from = 0; out.length < limit; from += page) {
    const res = await client.from(table).select('*').eq('organization_id', organizationId).order(order, { ascending }).range(from, from + page - 1)
    if (res.error) throw new Error(`${table}: ${res.error.message}`)
    out.push(...res.data)
    if (res.data.length < page) break
  }
  return out
}

export const STATE_VERSION_CLOUD = 2

// Carrega tudo da organização no formato do estado do app.
export async function loadOrgState(client, organizationId, { auditLimit = 3000 } = {}) {
  const orgRes = await client.from('organizations').select('*').eq('id', organizationId).single()
  if (orgRes.error) throw new Error(`organizations: ${orgRes.error.message}`)
  const org = orgRes.data
  const data = {}
  await Promise.all(TABLES.map(async (def) => {
    const opts = def.table === 'audit_log' ? { order: 'at', ascending: false, limit: auditLimit } : def.table === 'contep_imports' ? { order: 'at', ascending: false } : {}
    data[def.key] = (await fetchAll(client, def.table, organizationId, opts)).map((row) => fromRow(def, row))
  }))
  return {
    version: STATE_VERSION_CLOUD,
    organizations: [{ id: org.id, name: org.name, slug: org.slug, settings: org.settings || {} }],
    events: data.events,
    categories: data.categories.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    competitors: data.competitors,
    registrations: data.registrations,
    registrationMembers: data.registrationMembers,
    payments: data.payments,
    runs: data.runs,
    auditLog: data.auditLog,
    contep: { year: org.contep_year || new Date().getFullYear(), importedAt: org.contep_imported_at || null, records: data.contepRecords, imports: data.contepImports }
  }
}

// Aplica uma linha recebida pelo Realtime no estado (mutável).
export function applyRemoteRow(state, table, eventType, row, oldRow) {
  const def = TABLE_BY_NAME[table]
  if (!def) return false
  const list = def.key === 'contepRecords' ? state.contep.records : def.key === 'contepImports' ? state.contep.imports : state[def.key]
  if (eventType === 'DELETE') {
    const id = oldRow?.id
    const i = list.findIndex((x) => x.id === id)
    if (i < 0) return false
    list.splice(i, 1)
    return true
  }
  const obj = fromRow(def, row)
  const i = list.findIndex((x) => x.id === obj.id)
  if (i >= 0) list[i] = obj
  else if (def.key === 'auditLog') list.unshift(obj)
  else list.push(obj)
  return true
}
