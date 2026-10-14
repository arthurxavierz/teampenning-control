import { contepRecordFor } from './contepBase.js'
import { defaultCategories, defaultEventSettings } from './defaults.js'
import { allocatePayments } from './finance.js'
import { buildFinalRuns, buildRunoffRuns, qualifyingComplete } from './ranking.js'
import { isActiveRegistration, membersOf, recomputeRegistrationStatus, resolveMembers, validateRegistration } from './rules.js'
import { buildSchedule, drawCattle, eventRuns, nextRunNumber, usedCattle } from './schedule.js'
import { cleanCpf, cleanPhone, isValidCpf, newSeed, nowIso, parseTime, seededRandom, slugify, uid } from './utils.js'

// Regras de escrita do sistema. Cada ação recebe um rascunho do estado, altera
// e devolve { ok: false, errors } quando algo não pode ser feito. O navegador
// (store.jsx) e as funções do servidor (netlify/functions) usam exatamente o
// mesmo código, então uma inscrição feita pelo site passa pelas mesmas
// validações que uma lançada no balcão.

export const fail = (...errors) => ({ ok: false, errors })
const findEvent = (draft, id) => draft.events.find((e) => e.id === id)
const nameOf = (draft, competitorId) => draft.competitors.find((c) => c.id === competitorId)?.name
const competitorsInRegistration = (draft, registrationId) => membersOf(draft, registrationId).map((m) => m.competitorId)
const reallocate = (draft, eventId, ids) => new Set(ids.filter(Boolean)).forEach((id) => allocatePayments(draft, eventId, id))

function log(draft, ctx, eventId, action, summary, detail) {
  draft.auditLog.unshift({ id: uid('log'), at: nowIso(), eventId, actor: ctx.actor(), action, summary, detail })
  if (draft.auditLog.length > 3000) draft.auditLog.length = 3000
}

function newCompetitor(draft, p, record) {
  const name = String(p.name || record?.name || '').trim()
  const competitor = {
    id: uid('cmp'),
    name,
    nickname: String(p.nickname || '').trim() || name.split(' ')[0],
    cpf: cleanCpf(p.cpf),
    phone: cleanPhone(p.phone),
    contepCode: record?.contepCode || String(p.contepCode || '').trim().toUpperCase(),
    handicap: record ? Number(record.handicap) : Number(p.handicap || 0),
    handicapSource: record ? 'contep' : 'declared',
    birthDate: p.birthDate || '',
    gender: p.gender || '',
    city: String(p.city || '').trim()
  }
  draft.competitors.push(competitor)
  return competitor
}

// Completa dados que o competidor já cadastrado ainda não tinha (data de
// nascimento, sexo, telefone). Nunca sobrescreve o que já existe.
function fillMissing(known, p) {
  if (!known.birthDate && p.birthDate) known.birthDate = p.birthDate
  if (!known.gender && p.gender) known.gender = p.gender
  if (!known.phone && cleanPhone(p.phone)) known.phone = cleanPhone(p.phone)
}

export const core = {
  // Eventos
  createEvent(draft, ctx, payload, templateEventId) {
    const id = uid('evt')
    const template = templateEventId && findEvent(draft, templateEventId)
    let slug = slugify(payload.slug || payload.name)
    if (!slug) return fail('Dê um nome para o evento.')
    if (draft.events.some((e) => e.slug === slug)) slug = `${slug}-${draft.events.length + 1}`
    const settings = template
      ? structuredClone({
          limits: template.limits, terms: template.terms, cattle: template.cattle, occurrences: template.occurrences,
          arena: { ...template.arena, intermission: false },
          schedule: { ...template.schedule, seed: null, generatedAt: null, publishedAt: null },
          pix: template.pix, registrationPrice: template.registrationPrice, venue: template.venue, city: template.city, state: template.state,
          series: template.series || ''
        })
      : {}
    const event = {
      organizationId: draft.organizations?.[0]?.id || 'org_1',
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
      ? draft.categories.filter((c) => c.eventId === template.id).map((c) => ({ ...structuredClone(c), id: uid('cat'), eventId: id }))
      : defaultCategories(id)
    draft.categories.push(...cats)
    log(draft, ctx, id, 'event.create', template ? `Evento criado a partir de ${template.name}.` : 'Evento criado.')
    return { eventId: id }
  },

  updateEvent(draft, ctx, id, patch, summary = 'Configurações do evento atualizadas.') {
    const event = findEvent(draft, id)
    if (!event) return fail('Evento não encontrado.')
    patch = { ...patch }
    if (patch.slug !== undefined) {
      patch.slug = slugify(patch.slug)
      if (!patch.slug) return fail('O endereço do evento não pode ficar vazio.')
      if (draft.events.some((e) => e.id !== id && e.slug === patch.slug)) return fail('Já existe outro evento com este endereço.')
    }
    Object.assign(event, patch)
    log(draft, ctx, id, 'event.update', summary)
  },

  setActiveEvent(draft, ctx, id) {
    draft.events.forEach((e) => { e.active = e.id === id })
    log(draft, ctx, id, 'event.activate', 'Evento definido como ativo.')
  },

  saveCategory(draft, ctx, eventId, category) {
    if (!String(category.name || '').trim()) return fail('Dê um nome para a categoria.')
    const numbers = ['maxHandicap', 'qualifyingRuns', 'bestTimesCount', 'finalistsCount', 'finalRuns']
    const optional = ['timeLimit', 'maxMemberHandicap', 'maxAge', 'maxAgeSum']
    const clean = { ...category, name: String(category.name).trim() }
    numbers.forEach((k) => { clean[k] = Number(clean[k] ?? 0) })
    optional.forEach((k) => { clean[k] = clean[k] === '' || clean[k] == null ? null : Number(clean[k]) })
    if (clean.bestTimesCount > clean.qualifyingRuns) return fail('Os tempos considerados não podem passar da quantidade de passadas.')
    if (clean.qualifyingRuns < 1) return fail('A categoria precisa de pelo menos uma passada.')
    if (clean.bestTimesCount < 1) return fail('Considere pelo menos um tempo.')
    const existing = draft.categories.find((c) => c.id === clean.id)
    if (existing) Object.assign(existing, clean)
    else draft.categories.push({ ...clean, id: uid('cat'), eventId, sortOrder: draft.categories.filter((c) => c.eventId === eventId).length })
    log(draft, ctx, eventId, 'category.save', `Categoria ${clean.name} ${existing ? 'atualizada' : 'criada'}.`)
  },

  removeCategory(draft, ctx, categoryId) {
    const cat = draft.categories.find((c) => c.id === categoryId)
    if (!cat) return fail('Categoria não encontrada.')
    if (draft.registrations.some((r) => r.categoryId === categoryId)) return fail('Esta categoria já tem inscrições e não pode ser removida.')
    draft.categories = draft.categories.filter((c) => c.id !== categoryId)
    log(draft, ctx, cat.eventId, 'category.remove', `Categoria ${cat.name} removida.`)
  },

  // Competidores
  createCompetitor(draft, ctx, person) {
    const cpf = cleanCpf(person.cpf)
    if (!String(person.name || '').trim()) return fail('Informe o nome do competidor.')
    if (cpf && !isValidCpf(cpf)) return fail('O CPF não é válido.')
    if (cpf && draft.competitors.some((c) => cleanCpf(c.cpf) === cpf)) return fail('Já existe competidor com este CPF.')
    const record = contepRecordFor(draft, { cpf, contepCode: person.contepCode })
    const competitor = newCompetitor(draft, { ...person, cpf }, record)
    if (!record && person.handicap !== undefined && person.handicap !== '') competitor.handicapSource = 'admin'
    log(draft, ctx, null, 'competitor.create', `Competidor ${competitor.name} cadastrado.`)
    return { competitorId: competitor.id }
  },

  updateCompetitor(draft, ctx, id, patch, reason) {
    const c = draft.competitors.find((x) => x.id === id)
    if (!c) return fail('Competidor não encontrado.')
    patch = { ...patch }
    if (patch.cpf !== undefined) {
      patch.cpf = cleanCpf(patch.cpf)
      if (patch.cpf && !isValidCpf(patch.cpf)) return fail('O CPF não é válido.')
      if (patch.cpf && draft.competitors.some((x) => x.id !== id && cleanCpf(x.cpf) === patch.cpf)) return fail('Já existe outro competidor com este CPF.')
    }
    if (patch.phone !== undefined) patch.phone = cleanPhone(patch.phone)
    const before = { handicap: c.handicap, contepCode: c.contepCode, name: c.name, phone: c.phone }
    if (patch.handicap !== undefined && Number(patch.handicap) !== Number(c.handicap)) {
      if (!String(reason || '').trim()) return fail('Informe o motivo da alteração de handicap.')
      patch = { ...patch, handicap: Number(patch.handicap), handicapSource: 'admin' }
    }
    Object.assign(c, patch)
    log(draft, ctx, null, 'competitor.update', `Cadastro de ${c.name} alterado.${reason ? ` Motivo: ${reason}` : ''}`, { before, after: patch })
  },

  // Inscrições. Pelo site, o criador aceita e os outros dois recebem convite.
  // Pelo balcão (byOrganization), a organização lança o trio já aceito pelos
  // três, fora do prazo se preciso, e pode repetir o mesmo trio N vezes.
  createRegistration(draft, ctx, { eventId, categoryId, people, creatorIndex = 0, termsAccepted, byOrganization = false, copies = 1 }) {
    const total = Math.max(1, Math.min(10, Number(copies) || 1))
    const ids = []
    for (let n = 0; n < total; n++) {
      const errors = validateRegistration(draft, { eventId, categoryId, people, termsAccepted: termsAccepted || byOrganization, ignoreWindow: byOrganization })
      if (errors.length) return fail(...(n ? [`${n} de ${total} inscrições cabem. ${errors[0]}`] : errors))
      const event = findEvent(draft, eventId)
      const resolved = resolveMembers(draft, people).map((p) => {
        if (p.known) { fillMissing(p.known, p); return p.known }
        return newCompetitor(draft, p, contepRecordFor(draft, { cpf: p.cpf, contepCode: p.contepCode }))
      })
      // Na próxima cópia os três já existem na base.
      people = resolved.map((c) => ({ competitorId: c.id }))
      const at = nowIso()
      const reg = {
        id: uid('reg'),
        eventId,
        categoryId,
        createdByCompetitorId: resolved[creatorIndex]?.id || resolved[0].id,
        status: 'awaiting_confirmation',
        createdAt: at,
        termsAcceptedAt: termsAccepted || byOrganization ? at : null,
        channel: byOrganization ? 'organization' : 'site'
      }
      draft.registrations.push(reg)
      resolved.forEach((c, i) => {
        const accepted = byOrganization || i === creatorIndex
        draft.registrationMembers.push({
          id: uid('mem'),
          registrationId: reg.id,
          competitorId: c.id,
          position: i,
          confirmationStatus: accepted ? 'accepted' : 'pending',
          paymentStatus: 'pending',
          handicapSnapshot: Number(c.handicap || 0),
          price: Number(event.registrationPrice || 0),
          respondedAt: accepted ? at : null
        })
      })
      reallocate(draft, eventId, byOrganization ? resolved.map((c) => c.id) : [resolved[creatorIndex]?.id])
      recomputeRegistrationStatus(draft, reg.id)
      log(draft, ctx, eventId, 'registration.create',
        byOrganization ? `Trio lançado pela organização: ${resolved.map((c) => c.name).join(', ')}.` : `Trio criado por ${resolved[creatorIndex]?.name}.`,
        { registrationId: reg.id })
      ids.push(reg.id)
    }
    return { registrationId: ids[0], registrationIds: ids }
  },

  respondInvite(draft, ctx, memberId, status, { competitorId } = {}) {
    const member = draft.registrationMembers.find((m) => m.id === memberId)
    if (!member) return fail('Convite não encontrado.')
    if (competitorId && member.competitorId !== competitorId) return fail('Este convite é de outro competidor.')
    if (!['accepted', 'declined'].includes(status)) return fail('Resposta inválida.')
    if (member.confirmationStatus !== 'pending') return fail('Este convite já foi respondido.')
    const reg = draft.registrations.find((r) => r.id === member.registrationId)
    if (!isActiveRegistration(reg)) return fail('Este trio não está mais ativo.')
    member.confirmationStatus = status
    member.respondedAt = nowIso()
    recomputeRegistrationStatus(draft, reg.id)
    reallocate(draft, reg.eventId, competitorsInRegistration(draft, reg.id))
    log(draft, ctx, reg.eventId, 'registration.respond', `${nameOf(draft, member.competitorId)} ${status === 'accepted' ? 'aceitou' : 'recusou'} o convite.`, { registrationId: reg.id })
  },

  // Aceite registrado pela organização (o competidor confirmou por telefone).
  acceptForMember(draft, ctx, memberId) {
    const member = draft.registrationMembers.find((m) => m.id === memberId)
    if (!member) return fail('Integrante não encontrado.')
    if (member.confirmationStatus === 'accepted') return fail('Este integrante já aceitou.')
    const reg = draft.registrations.find((r) => r.id === member.registrationId)
    if (reg.status === 'cancelled') return fail('O trio está cancelado.')
    member.confirmationStatus = 'accepted'
    member.respondedAt = nowIso()
    recomputeRegistrationStatus(draft, reg.id)
    reallocate(draft, reg.eventId, competitorsInRegistration(draft, reg.id))
    log(draft, ctx, reg.eventId, 'registration.accept_by_org', `Aceite de ${nameOf(draft, member.competitorId)} registrado pela organização.`, { registrationId: reg.id })
  },

  cancelRegistration(draft, ctx, registrationId, reason) {
    const reg = draft.registrations.find((r) => r.id === registrationId)
    if (!reg) return fail('Inscrição não encontrada.')
    if (!String(reason || '').trim()) return fail('Informe o motivo do cancelamento.')
    if (draft.runs.some((r) => r.registrationId === registrationId && r.status === 'done')) return fail('O trio já correu. Cancele pela correção de resultados.')
    reg.status = 'cancelled'
    reg.cancelledAt = nowIso()
    reg.cancelReason = reason
    draft.runs = draft.runs.filter((r) => !(r.registrationId === registrationId && r.status === 'pending'))
    reallocate(draft, reg.eventId, competitorsInRegistration(draft, reg.id))
    log(draft, ctx, reg.eventId, 'registration.cancel', `Trio cancelado. Motivo: ${reason}`, { registrationId })
  },

  // Troca um integrante. Quem saiu recebe o valor como crédito no evento.
  substituteMember(draft, ctx, memberId, person, reason) {
    const member = draft.registrationMembers.find((m) => m.id === memberId)
    if (!member) return fail('Integrante não encontrado.')
    const reg = draft.registrations.find((r) => r.id === member.registrationId)
    if (reg.status === 'cancelled') return fail('O trio está cancelado.')
    if (draft.runs.some((r) => r.registrationId === reg.id && r.status === 'done')) return fail('O trio já correu e não pode trocar integrante.')
    if (!String(reason || '').trim()) return fail('Informe o motivo da substituição.')
    const cpf = cleanCpf(person.cpf)
    let comp = person.competitorId ? draft.competitors.find((c) => c.id === person.competitorId) : draft.competitors.find((c) => cpf && cleanCpf(c.cpf) === cpf)
    if (!comp) {
      if (!isValidCpf(cpf)) return fail('CPF inválido.')
      if (!String(person.name || '').trim()) return fail('Informe o nome do novo integrante.')
      comp = newCompetitor(draft, { ...person, cpf }, contepRecordFor(draft, { cpf, contepCode: person.contepCode }))
    }
    const others = membersOf(draft, reg.id).filter((m) => m.id !== memberId)
    if (others.some((m) => m.competitorId === comp.id)) return fail('Este competidor já está no trio.')
    const cat = draft.categories.find((c) => c.id === reg.categoryId)
    const sum = others.reduce((s, m) => s + Number(m.handicapSnapshot || 0), 0) + Number(comp.handicap || 0)
    if (sum > Number(cat.maxHandicap)) return fail(`Com a troca, a soma do trio fica ${sum}. A categoria permite até ${cat.maxHandicap}.`)
    const outgoing = member.competitorId
    const outName = nameOf(draft, outgoing)
    member.competitorId = comp.id
    member.confirmationStatus = person.accepted ? 'accepted' : 'pending'
    member.paymentStatus = 'pending'
    member.handicapSnapshot = Number(comp.handicap || 0)
    member.respondedAt = person.accepted ? nowIso() : null
    if (reg.status === 'declined') reg.status = 'awaiting_confirmation'
    recomputeRegistrationStatus(draft, reg.id)
    reallocate(draft, reg.eventId, [outgoing, comp.id])
    log(draft, ctx, reg.eventId, 'registration.substitute', `${outName} substituído por ${comp.name}. Motivo: ${reason}`, { registrationId: reg.id })
  },

  // Financeiro
  reportPayment(draft, ctx, { eventId, competitorId, amount, note }) {
    if (!(Number(amount) > 0)) return fail('Informe o valor pago.')
    if (!findEvent(draft, eventId)) return fail('Evento não encontrado.')
    const existing = draft.payments.find((p) => p.eventId === eventId && p.competitorId === competitorId && p.status === 'reported')
    if (existing) Object.assign(existing, { amount: Number(amount), note: note || existing.note, createdAt: nowIso() })
    else draft.payments.push({ id: uid('pay'), eventId, competitorId, amount: Number(amount), method: 'pix', status: 'reported', note: String(note || '').slice(0, 300), createdAt: nowIso() })
    log(draft, ctx, eventId, 'payment.report', `${nameOf(draft, competitorId)} informou pagamento.`)
  },

  confirmPayment(draft, ctx, { eventId, competitorId, amount, paymentId, method = 'pix', note }) {
    const value = Number(amount)
    if (!(value > 0)) return fail('Informe o valor recebido.')
    const at = nowIso()
    const reported = paymentId && draft.payments.find((p) => p.id === paymentId)
    if (reported) Object.assign(reported, { amount: value, status: 'confirmed', confirmedAt: at, confirmedBy: ctx.actor() })
    else draft.payments.push({ id: uid('pay'), eventId, competitorId, amount: value, method, note: note || '', status: 'confirmed', createdAt: at, confirmedAt: at, confirmedBy: ctx.actor() })
    allocatePayments(draft, eventId, competitorId)
    log(draft, ctx, eventId, 'payment.confirm', `Recebimento de R$ ${value.toFixed(2).replace('.', ',')} (${method}) confirmado para ${nameOf(draft, competitorId)}.`)
  },

  rejectPayment(draft, ctx, paymentId, reason) {
    const p = draft.payments.find((x) => x.id === paymentId)
    if (!p) return fail('Pagamento não encontrado.')
    if (!String(reason || '').trim()) return fail('Informe o motivo.')
    const wasConfirmed = p.status === 'confirmed'
    Object.assign(p, { status: 'rejected', rejectedAt: nowIso(), rejectedBy: ctx.actor(), rejectReason: reason })
    allocatePayments(draft, p.eventId, p.competitorId)
    log(draft, ctx, p.eventId, wasConfirmed ? 'payment.void' : 'payment.reject',
      wasConfirmed ? `Baixa de R$ ${Number(p.amount).toFixed(2).replace('.', ',')} de ${nameOf(draft, p.competitorId)} estornada. Motivo: ${reason}` : `Pagamento informado por ${nameOf(draft, p.competitorId)} não localizado. Motivo: ${reason}`)
  },

  // Montagem
  generateSchedule(draft, ctx, eventId) {
    const event = findEvent(draft, eventId)
    if (event.schedule?.publishedAt) return fail('A montagem já foi publicada. Despublique antes de sortear de novo.')
    if (eventRuns(draft, eventId).some((r) => r.status === 'done')) return fail('A prova já começou.')
    const seed = newSeed()
    const runs = buildSchedule(draft, eventId, { seed })
    if (!runs.length) return fail('Não há trios confirmados para sortear.')
    draft.runs = draft.runs.filter((r) => r.eventId !== eventId)
    draft.runs.push(...runs)
    event.schedule = { ...event.schedule, seed, generatedAt: nowIso() }
    log(draft, ctx, eventId, 'schedule.generate', `Montagem sorteada com a semente ${seed}: ${runs.length} passadas.`)
  },

  publishSchedule(draft, ctx, eventId, publish = true) {
    const event = findEvent(draft, eventId)
    if (!publish && eventRuns(draft, eventId).some((r) => r.status === 'done')) return fail('A prova já começou. A montagem não pode ser despublicada.')
    event.schedule = { ...event.schedule, publishedAt: publish ? nowIso() : null }
    log(draft, ctx, eventId, publish ? 'schedule.publish' : 'schedule.unpublish', publish ? 'Montagem publicada e travada.' : 'Montagem despublicada.')
  },

  appendConfirmed(draft, ctx, eventId) {
    const previous = eventRuns(draft, eventId, 'qualifying')
    const seed = newSeed()
    const added = buildSchedule(draft, eventId, { seed, previous, startNumber: nextRunNumber(draft, eventId) })
    if (!added.length) return fail('Não há trios confirmados fora da montagem.')
    draft.runs.push(...added)
    log(draft, ctx, eventId, 'schedule.append', `${new Set(added.map((r) => r.registrationId)).size} trios adicionados ao fim da montagem (semente ${seed}).`)
    return { added: added.length }
  },

  moveRun(draft, ctx, runId, direction, reason) {
    const run = draft.runs.find((r) => r.id === runId)
    if (!run || run.status !== 'pending') return fail('Só passadas pendentes podem ser movidas.')
    const event = findEvent(draft, run.eventId)
    if (event.schedule?.publishedAt && !String(reason || '').trim()) return fail('A montagem está publicada. Informe o motivo do ajuste.')
    const list = eventRuns(draft, run.eventId)
    const i = list.findIndex((r) => r.id === runId)
    const other = list[i + direction]
    if (!other || other.status !== 'pending') return fail('Não há passada pendente nessa direção.')
    ;[run.number, other.number] = [other.number, run.number]
    log(draft, ctx, run.eventId, 'schedule.move', `Passada ${other.number} trocada com ${run.number}.${reason ? ` Motivo: ${reason}` : ''}`)
  },

  setCattle(draft, ctx, runId, cattle, reason) {
    const run = draft.runs.find((r) => r.id === runId)
    if (!run) return fail('Passada não encontrada.')
    const event = findEvent(draft, run.eventId)
    const value = cattle === '' || cattle == null ? null : Number(cattle)
    if (value != null && !Number.isInteger(value)) return fail('Número de boi inválido.')
    // No sorteio na hora o boi da passada atual é definido pela mesa, sem motivo.
    const live = event.cattle?.mode === 'live' && run.status === 'pending' && run.cattle == null
    if (!live && event.schedule?.publishedAt && !String(reason || '').trim()) return fail('A montagem está publicada. Informe o motivo do ajuste.')
    const before = run.cattle
    run.cattle = value
    log(draft, ctx, run.eventId, 'schedule.cattle', `Boi da passada ${run.number}: ${before ?? 'a sortear'} para ${value ?? 'a sortear'}.${reason ? ` Motivo: ${reason}` : ''}`)
  },

  // Sorteio do boi na hora, para provas em que o trio só conhece o número ao
  // entrar na pista. Evita repetir boi que o mesmo trio já correu.
  drawCattleNow(draft, ctx, runId) {
    const run = draft.runs.find((r) => r.id === runId)
    if (!run || run.status !== 'pending') return fail('Só passadas pendentes recebem sorteio.')
    if (run.cattle != null) return fail(`O boi desta passada já é o ${run.cattle}.`)
    const event = findEvent(draft, run.eventId)
    const rand = seededRandom(newSeed())
    run.cattle = drawCattle(rand, event.cattle, usedCattle(draft, run.registrationId, run.id))
    log(draft, ctx, run.eventId, 'run.cattle_draw', `Boi ${run.cattle} sorteado para a passada ${run.number}.`, { runId })
    return { cattle: run.cattle }
  },

  // Pista
  recordRun(draft, ctx, runId, { time, occurrence, note, cattle }) {
    const run = draft.runs.find((r) => r.id === runId)
    if (!run) return fail('Passada não encontrada.')
    // Trava contra duplo clique e contra duas mesas lançando a mesma passada.
    if (run.status !== 'pending') return fail(`A passada ${run.number} já foi lançada.`)
    const event = findEvent(draft, run.eventId)
    const category = draft.categories.find((c) => c.id === run.categoryId)
    let occ = (event.occurrences || []).find((o) => o.code === occurrence)
    const needsTime = !occ || occ.effect === 'penalty'
    const value = parseTime(time)
    if (needsTime && !(value > 0)) return fail('Informe um tempo válido.')
    let autoNote = ''
    const limit = Number(category?.timeLimit || 0)
    if (needsTime && limit > 0 && value > limit) {
      const sat = (event.occurrences || []).find((o) => o.code === 'SAT') || (event.occurrences || []).find((o) => o.effect === 'no_time')
      if (sat) {
        occ = sat
        autoNote = `Tempo ${value.toFixed(3)}s acima do limite de ${limit}s.`
      }
    }
    const keepTime = !occ || occ.effect === 'penalty' || autoNote
    if (cattle !== undefined && cattle !== '' && cattle != null && run.cattle == null) run.cattle = Number(cattle)
    Object.assign(run, {
      status: 'done',
      time: keepTime && Number.isFinite(value) ? value : null,
      occurrence: occ?.code || null,
      note: [note, autoNote].filter(Boolean).join(' '),
      recordedAt: nowIso(),
      recordedBy: ctx.actor()
    })
    if (event.status === 'registration_closed' || event.status === 'registration_open') event.status = 'in_progress'
    const label = occ ? `${occ.label}${autoNote ? ` (${autoNote})` : ''}` : `${run.time.toFixed(3)}s`
    log(draft, ctx, run.eventId, 'run.record', `Passada ${run.number}: ${label}${occ?.effect === 'penalty' ? ` (${run.time.toFixed(3)}s)` : ''}.`, { runId })
    return { autoSat: Boolean(autoNote) }
  },

  correctRun(draft, ctx, runId, { time, occurrence, note }, reason) {
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
    Object.assign(run, { time: needsTime ? value : null, occurrence: occ?.code || null, note: note ?? run.note, updatedAt: nowIso(), updatedBy: ctx.actor() })
    log(draft, ctx, run.eventId, 'run.correct', `Passada ${run.number} corrigida. Motivo: ${reason}`, { runId, before, after: { time: run.time, occurrence: run.occurrence, note: run.note } })
  },

  undoRun(draft, ctx, runId, reason) {
    const run = draft.runs.find((r) => r.id === runId)
    if (!run || run.status !== 'done') return fail('Passada não está lançada.')
    if (!String(reason || '').trim()) return fail('Informe o motivo.')
    const event = findEvent(draft, run.eventId)
    if (event.homologated?.[run.categoryId]) return fail('O resultado desta categoria já foi homologado.')
    const before = { time: run.time, occurrence: run.occurrence }
    Object.assign(run, { status: 'pending', time: null, occurrence: null, note: '', recordedAt: null, recordedBy: null })
    log(draft, ctx, run.eventId, 'run.undo', `Lançamento da passada ${run.number} desfeito. Motivo: ${reason}`, { runId, before })
  },

  // Final, desempate e homologação
  generateFinal(draft, ctx, eventId, categoryId) {
    const cat = draft.categories.find((c) => c.id === categoryId)
    if (!qualifyingComplete(draft, eventId, categoryId)) return fail(`A classificatória da ${cat.name} ainda não terminou.`)
    if (draft.runs.some((r) => r.eventId === eventId && r.categoryId === categoryId && r.stage === 'final')) return fail('A final desta categoria já foi gerada.')
    const seed = newSeed()
    const runs = buildFinalRuns(draft, eventId, categoryId, { startNumber: nextRunNumber(draft, eventId), seed })
    if (!runs.length) return fail('Nenhum trio classificado para a final.')
    draft.runs.push(...runs)
    log(draft, ctx, eventId, 'final.generate', `Final da ${cat.name} gerada com ${new Set(runs.map((r) => r.registrationId)).size} trios (semente ${seed}).`)
  },

  removeFinal(draft, ctx, eventId, categoryId) {
    const finals = draft.runs.filter((r) => r.eventId === eventId && r.categoryId === categoryId && (r.stage === 'final' || r.stage === 'runoff'))
    if (finals.some((r) => r.status === 'done' && r.stage === 'final')) return fail('A final já começou.')
    draft.runs = draft.runs.filter((r) => !finals.includes(r))
    log(draft, ctx, eventId, 'final.remove', 'Final removida para nova geração.')
  },

  // Desempate em pista: os trios empatados correm de novo e o menor tempo
  // decide a ordem entre eles.
  createRunoff(draft, ctx, eventId, categoryId, stageOf, registrationIds) {
    const cat = draft.categories.find((c) => c.id === categoryId)
    if (!cat) return fail('Categoria não encontrada.')
    if (!registrationIds || registrationIds.length < 2) return fail('O desempate precisa de pelo menos dois trios.')
    const open = draft.runs.some((r) => r.eventId === eventId && r.categoryId === categoryId && r.stage === 'runoff' && r.runoffFor === stageOf && r.status === 'pending')
    if (open) return fail('Já existe um desempate aguardando na pista.')
    const runs = buildRunoffRuns(draft, eventId, categoryId, stageOf, registrationIds, { startNumber: nextRunNumber(draft, eventId), seed: newSeed() })
    draft.runs.push(...runs)
    log(draft, ctx, eventId, 'runoff.create', `Desempate em pista na ${cat.name} entre ${registrationIds.length} trios.`)
  },

  homologate(draft, ctx, eventId, categoryId, value = true, reason = '') {
    if (!value && !String(reason).trim()) return fail('Informe o motivo da reabertura.')
    const event = findEvent(draft, eventId)
    const cat = draft.categories.find((c) => c.id === categoryId)
    event.homologated = { ...event.homologated }
    if (value) event.homologated[categoryId] = { at: nowIso(), by: ctx.actor() }
    else delete event.homologated[categoryId]
    log(draft, ctx, eventId, value ? 'result.homologate' : 'result.reopen', `Resultado da ${cat.name} ${value ? 'homologado' : `reaberto para correção. Motivo: ${reason}`}.`)
  },

  // Base CONTEP
  applyContepImport(draft, ctx, items, { fileName, year }) {
    let updated = 0
    let added = 0
    items.filter((i) => i.apply).forEach((item) => {
      const record = { contepCode: item.contepCode, name: item.name, cpf: item.cpf, handicap: item.handicap }
      const at = draft.contep.records.findIndex((r) => (item.contepCode && r.contepCode === item.contepCode) || (item.cpf && r.cpf === item.cpf))
      if (at >= 0) draft.contep.records[at] = { ...draft.contep.records[at], ...record }
      else { draft.contep.records.push({ id: uid('ctp'), ...record }); added++ }
      if (item.match) {
        const c = draft.competitors.find((x) => x.id === item.match.id)
        if (!c) return
        if (item.handicap != null && !Number.isNaN(item.handicap)) c.handicap = item.handicap
        if (item.contepCode) c.contepCode = item.contepCode
        if (!c.cpf && item.cpf) c.cpf = item.cpf
        c.handicapSource = 'contep'
        updated++
      }
    })
    draft.contep.year = Number(year)
    draft.contep.importedAt = nowIso()
    draft.contep.imports.unshift({ id: uid('imp'), at: nowIso(), by: ctx.actor(), fileName, year: Number(year), rows: items.length, updated, added })
    log(draft, ctx, null, 'contep.import', `Base CONTEP ${year} importada de ${fileName}: ${updated} competidores atualizados, ${added} registros novos.`)
    return { updated, added }
  }
}

// Ações que o competidor pode disparar pelo portal (servidor confere quem é).
export const PORTAL_ACTIONS = ['createRegistration', 'respondInvite', 'reportPayment']
