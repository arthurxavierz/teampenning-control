import { useSyncExternalStore } from 'react'
import { contepRecordFor } from './contepBase.js'
import { defaultCategories, defaultEventSettings } from './defaults.js'
import { allocatePayments } from './finance.js'
import { buildFinalRuns, qualifyingComplete } from './ranking.js'
import { isActiveRegistration, membersOf, recomputeRegistrationStatus, resolveMembers, validateRegistration } from './rules.js'
import { buildSchedule, eventRuns, nextRunNumber } from './schedule.js'
import { createSeed, STATE_VERSION } from './seed.js'
import { cleanCpf, isValidCpf, newSeed, nowIso, parseTime, slugify, uid } from './utils.js'

const KEY = 'team-penning-manager-v2'
const OPERATOR_KEY = 'tp-operator'
const COMPETITOR_KEY = 'tp-competitor'

// Protótipo sem backend: o estado inteiro mora no localStorage e as abas do
// mesmo navegador conversam pelo evento "storage". Em produção, cada ação
// abaixo vira uma chamada ao Supabase com a mesma assinatura.
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY))
    if (saved?.version === STATE_VERSION) return saved
  } catch {}
  return createSeed()
}

function readSession() {
  let operator = ''
  let competitorId = ''
  try { operator = localStorage.getItem(OPERATOR_KEY) || '' } catch {}
  try { competitorId = sessionStorage.getItem(COMPETITOR_KEY) || '' } catch {}
  return { operator, competitorId }
}

let state = load()
let session = readSession()
let snapshot = { state, session }
const listeners = new Set()

function emit() {
  snapshot = { state, session }
  listeners.forEach((l) => l())
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {}
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return
    try {
      state = JSON.parse(e.newValue)
      emit()
    } catch {}
  })
}

const actor = () => session.operator || 'Organização'

function log(draft, eventId, action, summary, detail) {
  draft.auditLog.unshift({ id: uid('log'), at: nowIso(), eventId, actor: actor(), action, summary, detail })
  if (draft.auditLog.length > 2000) draft.auditLog.length = 2000
}

// Toda escrita passa por aqui: copia o estado, aplica, grava e avisa as telas.
// Se a função devolver { ok: false }, nada é gravado.
function mutate(fn) {
  const draft = structuredClone(state)
  const result = fn(draft) || { ok: true }
  if (result.ok === false) return result
  state = draft
  persist()
  emit()
  return { ok: true, ...result }
}

const fail = (...errors) => ({ ok: false, errors })
const findEvent = (draft, id) => draft.events.find((e) => e.id === id)

function competitorsInRegistration(draft, registrationId) {
  return membersOf(draft, registrationId).map((m) => m.competitorId)
}

function reallocate(draft, eventId, competitorIds) {
  new Set(competitorIds).forEach((id) => allocatePayments(draft, eventId, id))
}

export const actions = {
  reset() {
    state = createSeed()
    persist()
    emit()
  },

  // Backup do protótipo. Como tudo mora no navegador, é o jeito de levar os
  // dados de um computador para outro até o Supabase entrar.
  exportBackup() {
    return JSON.stringify({ app: 'achilles-team-penning', exportedAt: nowIso(), state }, null, 2)
  },

  importBackup(text) {
    let data
    try { data = JSON.parse(text) } catch { return fail('O arquivo não é um backup válido.') }
    const next = data?.state
    if (data?.app !== 'achilles-team-penning' || !next) return fail('Este arquivo não é um backup do Team Penning.')
    if (next.version !== STATE_VERSION) return fail('O backup é de outra versão do sistema.')
    const required = ['events', 'categories', 'competitors', 'registrations', 'registrationMembers', 'payments', 'runs', 'auditLog', 'contep']
    if (required.some((k) => !next[k])) return fail('O backup está incompleto.')
    state = next
    persist()
    emit()
    return { ok: true, events: next.events.length }
  },

  setOperator(name) {
    session = { ...session, operator: name.trim() }
    try { localStorage.setItem(OPERATOR_KEY, session.operator) } catch {}
    emit()
  },

  // Acesso do competidor no protótipo: CPF mais os quatro últimos dígitos do
  // telefone cadastrado. Na versão Supabase vira login com código por SMS ou
  // e-mail.
  loginCompetitor(cpf, phoneEnd) {
    const c = state.competitors.find((x) => cleanCpf(x.cpf) === cleanCpf(cpf))
    if (!c) return fail('CPF não encontrado. Faça uma inscrição ou confira o número.')
    if (String(c.phone || '').replace(/\D/g, '').slice(-4) !== String(phoneEnd).replace(/\D/g, '')) {
      return fail('Os dígitos do telefone não conferem com o cadastro.')
    }
    session = { ...session, competitorId: c.id }
    try { sessionStorage.setItem(COMPETITOR_KEY, c.id) } catch {}
    emit()
    return { ok: true }
  },

  logoutCompetitor() {
    session = { ...session, competitorId: '' }
    try { sessionStorage.removeItem(COMPETITOR_KEY) } catch {}
    emit()
  },

  // Eventos
  createEvent(payload, templateEventId) {
    return mutate((draft) => {
      const id = uid('evt')
      const template = templateEventId && findEvent(draft, templateEventId)
      let slug = slugify(payload.slug || payload.name)
      if (draft.events.some((e) => e.slug === slug)) slug = `${slug}-${draft.events.length + 1}`
      const settings = template
        ? structuredClone({
            limits: template.limits, terms: template.terms, cattle: template.cattle, occurrences: template.occurrences,
            arena: { ...template.arena, intermission: false },
            schedule: { ...template.schedule, seed: null, generatedAt: null, publishedAt: null },
            pix: template.pix, registrationPrice: template.registrationPrice, venue: template.venue, city: template.city, state: template.state
          })
        : {}
      const event = {
        organizationId: 'org_1',
        ...defaultEventSettings(),
        pix: { key: '', name: '', city: '' },
        ...settings,
        ...payload,
        homologated: {},
        id,
        slug,
        active: false,
        status: 'draft'
      }
      draft.events.push(event)
      const cats = template
        ? draft.categories.filter((c) => c.eventId === template.id).map((c) => ({ ...c, id: uid('cat'), eventId: id }))
        : defaultCategories(id)
      draft.categories.push(...cats)
      log(draft, id, 'event.create', template ? `Evento criado a partir de ${template.name}.` : 'Evento criado.')
      return { eventId: id }
    })
  },

  updateEvent(id, patch, summary = 'Configurações do evento atualizadas.') {
    return mutate((draft) => {
      const event = findEvent(draft, id)
      if (!event) return fail('Evento não encontrado.')
      if (patch.slug !== undefined) {
        patch.slug = slugify(patch.slug)
        if (!patch.slug) return fail('O endereço do evento não pode ficar vazio.')
        if (draft.events.some((e) => e.id !== id && e.slug === patch.slug)) return fail('Já existe outro evento com este endereço.')
      }
      Object.assign(event, patch)
      log(draft, id, 'event.update', summary)
    })
  },

  setActiveEvent(id) {
    return mutate((draft) => {
      draft.events.forEach((e) => { e.active = e.id === id })
      log(draft, id, 'event.activate', 'Evento definido como ativo.')
    })
  },

  saveCategory(eventId, category) {
    return mutate((draft) => {
      if (!String(category.name || '').trim()) return fail('Dê um nome para a categoria.')
      const numbers = ['maxHandicap', 'qualifyingRuns', 'bestTimesCount', 'finalistsCount', 'finalRuns']
      const clean = { ...category }
      numbers.forEach((k) => { clean[k] = Number(clean[k] ?? 0) })
      if (clean.bestTimesCount > clean.qualifyingRuns) return fail('Os tempos considerados não podem passar da quantidade de passadas.')
      if (clean.qualifyingRuns < 1) return fail('A categoria precisa de pelo menos uma passada.')
      const existing = draft.categories.find((c) => c.id === clean.id)
      if (existing) Object.assign(existing, clean)
      else draft.categories.push({ ...clean, id: uid('cat'), eventId })
      log(draft, eventId, 'category.save', `Categoria ${clean.name} ${existing ? 'atualizada' : 'criada'}.`)
    })
  },

  removeCategory(categoryId) {
    return mutate((draft) => {
      const cat = draft.categories.find((c) => c.id === categoryId)
      if (!cat) return fail('Categoria não encontrada.')
      if (draft.registrations.some((r) => r.categoryId === categoryId)) return fail('Esta categoria já tem inscrições e não pode ser removida.')
      draft.categories = draft.categories.filter((c) => c.id !== categoryId)
      log(draft, cat.eventId, 'category.remove', `Categoria ${cat.name} removida.`)
    })
  },

  updateCompetitor(id, patch, reason) {
    return mutate((draft) => {
      const c = draft.competitors.find((x) => x.id === id)
      if (!c) return fail('Competidor não encontrado.')
      const before = { handicap: c.handicap, contepCode: c.contepCode, name: c.name, phone: c.phone }
      if (patch.handicap !== undefined && Number(patch.handicap) !== Number(c.handicap)) {
        if (!String(reason || '').trim()) return fail('Informe o motivo da alteração de handicap.')
        patch = { ...patch, handicap: Number(patch.handicap), handicapSource: 'admin' }
      }
      Object.assign(c, patch)
      log(draft, null, 'competitor.update', `Cadastro de ${c.name} alterado.${reason ? ` Motivo: ${reason}` : ''}`, { before, after: patch })
    })
  },

  // Inscrições
  createRegistration({ eventId, categoryId, people, creatorIndex = 0, termsAccepted }) {
    return mutate((draft) => {
      const errors = validateRegistration(draft, { eventId, categoryId, people, termsAccepted })
      if (errors.length) return fail(...errors)
      const event = findEvent(draft, eventId)
      const resolved = resolveMembers(draft, people).map((p) => {
        if (p.known) return p.known
        const record = contepRecordFor(draft, { cpf: p.cpf, contepCode: p.contepCode })
        const name = String(p.name || record?.name || '').trim()
        const competitor = {
          id: uid('cmp'),
          name,
          nickname: name.split(' ')[0],
          cpf: p.cpf,
          phone: String(p.phone || '').replace(/\D/g, ''),
          contepCode: record?.contepCode || String(p.contepCode || '').trim().toUpperCase(),
          handicap: record ? Number(record.handicap) : Number(p.handicap || 0),
          handicapSource: record ? 'contep' : 'declared'
        }
        draft.competitors.push(competitor)
        return competitor
      })
      const at = nowIso()
      const reg = {
        id: uid('reg'),
        eventId,
        categoryId,
        createdByCompetitorId: resolved[creatorIndex]?.id || resolved[0].id,
        status: 'awaiting_confirmation',
        createdAt: at,
        termsAcceptedAt: termsAccepted ? at : null
      }
      draft.registrations.push(reg)
      resolved.forEach((c, i) => {
        draft.registrationMembers.push({
          id: uid('mem'),
          registrationId: reg.id,
          competitorId: c.id,
          confirmationStatus: i === creatorIndex ? 'accepted' : 'pending',
          paymentStatus: 'pending',
          handicapSnapshot: Number(c.handicap || 0),
          price: Number(event.registrationPrice || 0),
          respondedAt: i === creatorIndex ? at : null
        })
      })
      reallocate(draft, eventId, [resolved[creatorIndex]?.id])
      recomputeRegistrationStatus(draft, reg.id)
      log(draft, eventId, 'registration.create', `Trio criado por ${resolved[creatorIndex]?.name}.`, { registrationId: reg.id })
      return { registrationId: reg.id }
    })
  },

  respondInvite(memberId, status) {
    return mutate((draft) => {
      const member = draft.registrationMembers.find((m) => m.id === memberId)
      if (!member) return fail('Convite não encontrado.')
      if (member.confirmationStatus !== 'pending') return fail('Este convite já foi respondido.')
      const reg = draft.registrations.find((r) => r.id === member.registrationId)
      if (!isActiveRegistration(reg)) return fail('Este trio não está mais ativo.')
      member.confirmationStatus = status
      member.respondedAt = nowIso()
      recomputeRegistrationStatus(draft, reg.id)
      reallocate(draft, reg.eventId, competitorsInRegistration(draft, reg.id))
      const name = draft.competitors.find((c) => c.id === member.competitorId)?.name
      log(draft, reg.eventId, 'registration.respond', `${name} ${status === 'accepted' ? 'aceitou' : 'recusou'} o convite.`, { registrationId: reg.id })
    })
  },

  cancelRegistration(registrationId, reason) {
    return mutate((draft) => {
      const reg = draft.registrations.find((r) => r.id === registrationId)
      if (!reg) return fail('Inscrição não encontrada.')
      if (!String(reason || '').trim()) return fail('Informe o motivo do cancelamento.')
      if (draft.runs.some((r) => r.registrationId === registrationId && r.status === 'done')) return fail('O trio já correu. Cancele pela correção de resultados.')
      reg.status = 'cancelled'
      reg.cancelledAt = nowIso()
      reg.cancelReason = reason
      draft.runs = draft.runs.filter((r) => !(r.registrationId === registrationId && r.status === 'pending'))
      reallocate(draft, reg.eventId, competitorsInRegistration(draft, reg.id))
      log(draft, reg.eventId, 'registration.cancel', `Trio cancelado. Motivo: ${reason}`, { registrationId })
    })
  },

  // Troca um integrante. O novo entra aguardando aceite e o trio volta a
  // depender da confirmação dele. Quem saiu recebe de volta o valor como
  // crédito no evento.
  substituteMember(memberId, person, reason) {
    return mutate((draft) => {
      const member = draft.registrationMembers.find((m) => m.id === memberId)
      if (!member) return fail('Integrante não encontrado.')
      const reg = draft.registrations.find((r) => r.id === member.registrationId)
      if (reg.status === 'cancelled') return fail('O trio está cancelado.')
      if (draft.runs.some((r) => r.registrationId === reg.id && r.status === 'done')) return fail('O trio já correu e não pode trocar integrante.')
      if (!String(reason || '').trim()) return fail('Informe o motivo da substituição.')
      const cpf = cleanCpf(person.cpf)
      let comp = draft.competitors.find((c) => cleanCpf(c.cpf) === cpf)
      if (!comp) {
        if (!isValidCpf(cpf)) return fail('CPF inválido.')
        if (!String(person.name || '').trim()) return fail('Informe o nome do novo integrante.')
        const record = contepRecordFor(draft, { cpf, contepCode: person.contepCode })
        comp = {
          id: uid('cmp'), name: person.name.trim(), nickname: person.name.trim().split(' ')[0], cpf,
          phone: String(person.phone || '').replace(/\D/g, ''), contepCode: record?.contepCode || person.contepCode || '',
          handicap: record ? Number(record.handicap) : Number(person.handicap || 0), handicapSource: record ? 'contep' : 'declared'
        }
        draft.competitors.push(comp)
      }
      const others = membersOf(draft, reg.id).filter((m) => m.id !== memberId)
      if (others.some((m) => m.competitorId === comp.id)) return fail('Este competidor já está no trio.')
      const cat = draft.categories.find((c) => c.id === reg.categoryId)
      const sum = others.reduce((s, m) => s + Number(m.handicapSnapshot || 0), 0) + Number(comp.handicap || 0)
      if (sum > Number(cat.maxHandicap)) return fail(`Com a troca, a soma do trio fica ${sum}. A categoria permite até ${cat.maxHandicap}.`)
      const outgoing = member.competitorId
      const outName = draft.competitors.find((c) => c.id === outgoing)?.name
      member.competitorId = comp.id
      member.confirmationStatus = 'pending'
      member.paymentStatus = 'pending'
      member.handicapSnapshot = Number(comp.handicap || 0)
      member.respondedAt = null
      if (reg.status === 'declined') reg.status = 'awaiting_confirmation'
      recomputeRegistrationStatus(draft, reg.id)
      reallocate(draft, reg.eventId, [outgoing, comp.id])
      log(draft, reg.eventId, 'registration.substitute', `${outName} substituído por ${comp.name}. Motivo: ${reason}`, { registrationId: reg.id })
    })
  },

  // Financeiro
  reportPayment({ eventId, competitorId, amount, note }) {
    return mutate((draft) => {
      if (!(Number(amount) > 0)) return fail('Informe o valor pago.')
      const existing = draft.payments.find((p) => p.eventId === eventId && p.competitorId === competitorId && p.status === 'reported')
      if (existing) Object.assign(existing, { amount: Number(amount), note: note || existing.note, createdAt: nowIso() })
      else draft.payments.push({ id: uid('pay'), eventId, competitorId, amount: Number(amount), method: 'pix', status: 'reported', note: note || '', createdAt: nowIso() })
      const name = draft.competitors.find((c) => c.id === competitorId)?.name
      log(draft, eventId, 'payment.report', `${name} informou pagamento.`)
    })
  },

  confirmPayment({ eventId, competitorId, amount, paymentId, method = 'pix' }) {
    return mutate((draft) => {
      const value = Number(amount)
      if (!(value > 0)) return fail('Informe o valor recebido.')
      const at = nowIso()
      const reported = paymentId && draft.payments.find((p) => p.id === paymentId)
      if (reported) Object.assign(reported, { amount: value, status: 'confirmed', confirmedAt: at, confirmedBy: actor() })
      else draft.payments.push({ id: uid('pay'), eventId, competitorId, amount: value, method, status: 'confirmed', createdAt: at, confirmedAt: at, confirmedBy: actor() })
      allocatePayments(draft, eventId, competitorId)
      const name = draft.competitors.find((c) => c.id === competitorId)?.name
      log(draft, eventId, 'payment.confirm', `Recebimento de R$ ${value.toFixed(2).replace('.', ',')} confirmado para ${name}.`)
    })
  },

  rejectPayment(paymentId, reason) {
    return mutate((draft) => {
      const p = draft.payments.find((x) => x.id === paymentId)
      if (!p) return fail('Pagamento não encontrado.')
      if (!String(reason || '').trim()) return fail('Informe o motivo.')
      Object.assign(p, { status: 'rejected', rejectedAt: nowIso(), rejectedBy: actor(), rejectReason: reason })
      allocatePayments(draft, p.eventId, p.competitorId)
      const name = draft.competitors.find((c) => c.id === p.competitorId)?.name
      log(draft, p.eventId, 'payment.reject', `Pagamento informado por ${name} não localizado. Motivo: ${reason}`)
    })
  },

  // Montagem
  generateSchedule(eventId) {
    return mutate((draft) => {
      const event = findEvent(draft, eventId)
      if (event.schedule?.publishedAt) return fail('A montagem já foi publicada. Despublique antes de sortear de novo.')
      if (eventRuns(draft, eventId).some((r) => r.status === 'done')) return fail('A prova já começou.')
      const seed = newSeed()
      draft.runs = draft.runs.filter((r) => r.eventId !== eventId)
      draft.runs.push(...buildSchedule(draft, eventId, { seed }))
      event.schedule = { ...event.schedule, seed, generatedAt: nowIso() }
      log(draft, eventId, 'schedule.generate', `Montagem sorteada com a semente ${seed}.`)
    })
  },

  publishSchedule(eventId, publish = true) {
    return mutate((draft) => {
      const event = findEvent(draft, eventId)
      if (!publish && eventRuns(draft, eventId).some((r) => r.status === 'done')) return fail('A prova já começou. A montagem não pode ser despublicada.')
      event.schedule = { ...event.schedule, publishedAt: publish ? nowIso() : null }
      log(draft, eventId, publish ? 'schedule.publish' : 'schedule.unpublish', publish ? 'Montagem publicada e travada.' : 'Montagem despublicada.')
    })
  },

  appendConfirmed(eventId) {
    return mutate((draft) => {
      const previous = eventRuns(draft, eventId, 'qualifying')
      const seed = newSeed()
      const added = buildSchedule(draft, eventId, { seed, previous, startNumber: nextRunNumber(draft, eventId) })
      if (!added.length) return fail('Não há trios confirmados fora da montagem.')
      draft.runs.push(...added)
      log(draft, eventId, 'schedule.append', `${new Set(added.map((r) => r.registrationId)).size} trios adicionados ao fim da montagem (semente ${seed}).`)
      return { added: added.length }
    })
  },

  moveRun(runId, direction, reason) {
    return mutate((draft) => {
      const run = draft.runs.find((r) => r.id === runId)
      if (!run || run.status !== 'pending') return fail('Só passadas pendentes podem ser movidas.')
      const event = findEvent(draft, run.eventId)
      if (event.schedule?.publishedAt && !String(reason || '').trim()) return fail('A montagem está publicada. Informe o motivo do ajuste.')
      const list = eventRuns(draft, run.eventId)
      const i = list.findIndex((r) => r.id === runId)
      const other = list[i + direction]
      if (!other || other.status !== 'pending') return fail('Não há passada pendente nessa direção.')
      ;[run.number, other.number] = [other.number, run.number]
      log(draft, run.eventId, 'schedule.move', `Passada ${other.number} trocada com ${run.number}.${reason ? ` Motivo: ${reason}` : ''}`)
    })
  },

  setCattle(runId, cattle, reason) {
    return mutate((draft) => {
      const run = draft.runs.find((r) => r.id === runId)
      if (!run) return fail('Passada não encontrada.')
      const event = findEvent(draft, run.eventId)
      if (event.schedule?.publishedAt && !String(reason || '').trim()) return fail('A montagem está publicada. Informe o motivo do ajuste.')
      const before = run.cattle
      run.cattle = Number(cattle)
      log(draft, run.eventId, 'schedule.cattle', `Boi da passada ${run.number}: ${before} para ${run.cattle}.${reason ? ` Motivo: ${reason}` : ''}`)
    })
  },

  // Pista
  recordRun(runId, { time, occurrence, note }) {
    return mutate((draft) => {
      const run = draft.runs.find((r) => r.id === runId)
      if (!run) return fail('Passada não encontrada.')
      // Trava contra duplo clique e contra duas mesas lançando a mesma passada.
      if (run.status !== 'pending') return fail(`A passada ${run.number} já foi lançada.`)
      const event = findEvent(draft, run.eventId)
      const occ = (event.occurrences || []).find((o) => o.code === occurrence)
      const needsTime = !occ || occ.effect === 'penalty'
      const value = parseTime(time)
      if (needsTime && !(value > 0)) return fail('Informe um tempo válido.')
      Object.assign(run, {
        status: 'done',
        time: needsTime ? value : null,
        occurrence: occ?.code || null,
        note: note || '',
        recordedAt: nowIso(),
        recordedBy: actor()
      })
      if (event.status === 'registration_closed' || event.status === 'registration_open') event.status = 'in_progress'
      log(draft, run.eventId, 'run.record', `Passada ${run.number}: ${occ ? occ.label : `${run.time.toFixed(3)}s`}${occ?.effect === 'penalty' ? ` (${run.time.toFixed(3)}s)` : ''}.`, { runId })
    })
  },

  correctRun(runId, { time, occurrence, note }, reason) {
    return mutate((draft) => {
      const run = draft.runs.find((r) => r.id === runId)
      if (!run || run.status !== 'done') return fail('Só passadas lançadas podem ser corrigidas.')
      if (!String(reason || '').trim()) return fail('Informe o motivo da correção.')
      const event = findEvent(draft, run.eventId)
      if (event.homologated?.[run.categoryId]) return fail('O resultado desta categoria já foi homologado. Reabra antes de corrigir.')
      const occ = (event.occurrences || []).find((o) => o.code === occurrence)
      const needsTime = !occ || occ.effect === 'penalty'
      const value = parseTime(time)
      if (needsTime && !(value > 0)) return fail('Informe um tempo válido.')
      const before = { time: run.time, occurrence: run.occurrence, note: run.note }
      Object.assign(run, { time: needsTime ? value : null, occurrence: occ?.code || null, note: note ?? run.note, updatedAt: nowIso(), updatedBy: actor() })
      log(draft, run.eventId, 'run.correct', `Passada ${run.number} corrigida. Motivo: ${reason}`, { runId, before, after: { time: run.time, occurrence: run.occurrence, note: run.note } })
    })
  },

  undoRun(runId, reason) {
    return mutate((draft) => {
      const run = draft.runs.find((r) => r.id === runId)
      if (!run || run.status !== 'done') return fail('Passada não está lançada.')
      if (!String(reason || '').trim()) return fail('Informe o motivo.')
      const event = findEvent(draft, run.eventId)
      if (event.homologated?.[run.categoryId]) return fail('O resultado desta categoria já foi homologado.')
      const before = { time: run.time, occurrence: run.occurrence }
      Object.assign(run, { status: 'pending', time: null, occurrence: null, note: '', recordedAt: null, recordedBy: null })
      log(draft, run.eventId, 'run.undo', `Lançamento da passada ${run.number} desfeito. Motivo: ${reason}`, { runId, before })
    })
  },

  // Final e homologação
  generateFinal(eventId, categoryId) {
    return mutate((draft) => {
      const cat = draft.categories.find((c) => c.id === categoryId)
      if (!qualifyingComplete(draft, eventId, categoryId)) return fail(`A classificatória da ${cat.name} ainda não terminou.`)
      if (draft.runs.some((r) => r.eventId === eventId && r.categoryId === categoryId && r.stage === 'final')) return fail('A final desta categoria já foi gerada.')
      const seed = newSeed()
      const runs = buildFinalRuns(draft, eventId, categoryId, { startNumber: nextRunNumber(draft, eventId), seed })
      if (!runs.length) return fail('Nenhum trio classificado para a final.')
      draft.runs.push(...runs)
      log(draft, eventId, 'final.generate', `Final da ${cat.name} gerada com ${new Set(runs.map((r) => r.registrationId)).size} trios (semente ${seed}).`)
    })
  },

  removeFinal(eventId, categoryId) {
    return mutate((draft) => {
      const finals = draft.runs.filter((r) => r.eventId === eventId && r.categoryId === categoryId && r.stage === 'final')
      if (finals.some((r) => r.status === 'done')) return fail('A final já começou.')
      draft.runs = draft.runs.filter((r) => !finals.includes(r))
      log(draft, eventId, 'final.remove', 'Final removida para nova geração.')
    })
  },

  homologate(eventId, categoryId, value = true, reason = '') {
    return mutate((draft) => {
      if (!value && !String(reason).trim()) return fail('Informe o motivo da reabertura.')
      const event = findEvent(draft, eventId)
      const cat = draft.categories.find((c) => c.id === categoryId)
      event.homologated = { ...event.homologated }
      if (value) event.homologated[categoryId] = { at: nowIso(), by: actor() }
      else delete event.homologated[categoryId]
      log(draft, eventId, value ? 'result.homologate' : 'result.reopen', `Resultado da ${cat.name} ${value ? 'homologado' : `reaberto para correção. Motivo: ${reason}`}.`)
    })
  },

  // Base CONTEP
  applyContepImport(items, { fileName, year }) {
    return mutate((draft) => {
      let updated = 0
      let added = 0
      items.filter((i) => i.apply).forEach((item) => {
        const record = { contepCode: item.contepCode, name: item.name, cpf: item.cpf, handicap: item.handicap }
        const at = draft.contep.records.findIndex((r) => (item.contepCode && r.contepCode === item.contepCode) || (item.cpf && r.cpf === item.cpf))
        if (at >= 0) draft.contep.records[at] = { ...draft.contep.records[at], ...record }
        else { draft.contep.records.push(record); added++ }
        if (item.match) {
          const c = draft.competitors.find((x) => x.id === item.match.id)
          if (item.handicap != null && !Number.isNaN(item.handicap)) c.handicap = item.handicap
          if (item.contepCode) c.contepCode = item.contepCode
          c.handicapSource = 'contep'
          updated++
        }
      })
      draft.contep.year = Number(year)
      draft.contep.importedAt = nowIso()
      draft.contep.imports.unshift({ id: uid('imp'), at: nowIso(), by: actor(), fileName, year: Number(year), rows: items.length, updated, added })
      log(draft, null, 'contep.import', `Base CONTEP ${year} importada de ${fileName}: ${updated} competidores atualizados, ${added} registros novos.`)
      return { updated, added }
    })
  }
}

const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useStore() {
  const snap = useSyncExternalStore(subscribe, () => snapshot)
  return { state: snap.state, session: snap.session, actions }
}

export const getState = () => state
