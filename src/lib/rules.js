import { contepRecordFor } from './contepBase.js'
import { cleanCpf, isValidCpf, todayIso } from './utils.js'

// Trio que saiu da prova. As participações dele deixam de ser cobradas e o
// que já foi pago vira crédito do competidor no mesmo evento.
export const INACTIVE_STATUSES = ['declined', 'cancelled']
export const isActiveRegistration = (reg) => reg && !INACTIVE_STATUSES.includes(reg.status)

export const membersOf = (state, registrationId) =>
  state.registrationMembers.filter((m) => m.registrationId === registrationId)

export function registrationStatus(reg, members) {
  if (reg.status === 'cancelled') return 'cancelled'
  if (members.length !== 3) return 'awaiting_confirmation'
  if (members.some((m) => m.confirmationStatus === 'declined')) return 'declined'
  if (members.some((m) => m.confirmationStatus !== 'accepted')) return 'awaiting_confirmation'
  if (members.some((m) => m.paymentStatus !== 'paid')) return 'awaiting_payment'
  return 'confirmed'
}

export function recomputeRegistrationStatus(draft, registrationId) {
  const reg = draft.registrations.find((r) => r.id === registrationId)
  if (!reg) return
  reg.status = registrationStatus(reg, membersOf(draft, registrationId))
}

export function registrationWindow(event, today = todayIso()) {
  if (!event) return { open: false, reason: 'Evento não encontrado.' }
  if (event.status !== 'registration_open') return { open: false, reason: 'As inscrições deste evento não estão abertas.' }
  if (event.registrationOpens && today < event.registrationOpens) return { open: false, reason: 'As inscrições ainda não começaram.' }
  if (event.registrationCloses && today > event.registrationCloses) return { open: false, reason: 'O prazo de inscrição terminou.' }
  return { open: true }
}

export const trioKey = (competitorIds) => [...competitorIds].sort().join('|')

// Participações ativas do competidor no evento, contando trios que ainda
// aguardam confirmação. Um convite pendente também ocupa vaga.
export function activeParticipations(state, eventId, competitorId) {
  return state.registrationMembers.filter((m) => {
    if (m.competitorId !== competitorId || m.confirmationStatus === 'declined') return false
    const reg = state.registrations.find((r) => r.id === m.registrationId)
    return reg?.eventId === eventId && isActiveRegistration(reg)
  }).length
}

export function sameTrioCount(state, eventId, competitorIds) {
  const key = trioKey(competitorIds)
  return state.registrations.filter(
    (r) => r.eventId === eventId && isActiveRegistration(r) && trioKey(membersOf(state, r.id).map((m) => m.competitorId)) === key
  ).length
}

// Resolve cada integrante do formulário contra a base. Quem já existe usa o
// handicap da base e não o digitado: o handicap não é declarado pelo próprio
// competidor quando a organização já o conhece.
export function resolveMembers(state, people) {
  return people.map((p) => {
    const cpf = cleanCpf(p.cpf)
    const known = p.competitorId
      ? state.competitors.find((c) => c.id === p.competitorId)
      : state.competitors.find((c) => cleanCpf(c.cpf) === cpf)
    if (known) return { ...p, known, cpf: cleanCpf(known.cpf), handicap: Number(known.handicap ?? 0), name: known.name, source: known.handicapSource || 'contep' }
    const record = contepRecordFor(state, { cpf, contepCode: p.contepCode })
    if (record) return { ...p, known: null, record, cpf, handicap: Number(record.handicap ?? 0), source: 'contep' }
    return { ...p, known: null, record: null, cpf, handicap: Number(p.handicap || 0), source: 'declared' }
  })
}

export function validateRegistration(state, { eventId, categoryId, people, termsAccepted, today }) {
  const errors = []
  const event = state.events.find((e) => e.id === eventId)
  const window = registrationWindow(event, today)
  if (!window.open) return [window.reason]

  const category = state.categories.find((c) => c.id === categoryId && c.eventId === eventId)
  if (!category) errors.push('Escolha uma categoria do evento.')
  if (!people || people.length !== 3) return [...errors, 'O trio precisa ter exatamente três competidores.']

  const resolved = resolveMembers(state, people)
  resolved.forEach((p, i) => {
    if (!p.known && !String(p.name || p.record?.name || '').trim()) errors.push(`Informe o nome do competidor ${i + 1}.`)
    if (!p.known && !isValidCpf(p.cpf)) errors.push(`O CPF do competidor ${i + 1} não é válido.`)
    // O telefone é a chave de acesso à área do competidor: sem ele, o convite
    // não pode ser aceito.
    const phone = String(p.phone || '').replace(/\D/g, '')
    if (!p.known && (phone.length < 10 || phone.length > 11)) errors.push(`Informe o celular com DDD do competidor ${i + 1}.`)
  })
  if (new Set(resolved.map((p) => p.cpf)).size < 3) errors.push('O trio precisa ter três competidores diferentes.')

  const sum = resolved.reduce((s, p) => s + Number(p.handicap || 0), 0)
  if (category && sum > Number(category.maxHandicap)) {
    errors.push(`A soma de handicap deste trio é ${sum}. A categoria ${category.name} permite até ${category.maxHandicap}.`)
  }

  const limits = event.limits || {}
  const knownIds = resolved.filter((p) => p.known).map((p) => p.known.id)
  if (limits.maxPerCompetitor) {
    resolved.forEach((p) => {
      if (p.known && activeParticipations(state, eventId, p.known.id) >= Number(limits.maxPerCompetitor)) {
        errors.push(`${p.known.name} já atingiu o limite de ${limits.maxPerCompetitor} participações neste evento.`)
      }
    })
  }
  if (knownIds.length === 3 && limits.maxSameTrio && sameTrioCount(state, eventId, knownIds) >= Number(limits.maxSameTrio)) {
    errors.push(
      Number(limits.maxSameTrio) === 1
        ? 'Este trio já está inscrito neste evento.'
        : `Esta combinação de trio já foi inscrita ${limits.maxSameTrio} vezes, que é o limite do evento.`
    )
  }
  if (event.terms && !termsAccepted) errors.push('É preciso aceitar o regulamento do evento.')
  return errors
}
