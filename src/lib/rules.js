import { contepRecordFor } from './contepBase.js'
import { cleanCpf, isValidCpf, normalize, todayIso } from './utils.js'

// Trio que saiu da prova. As participações dele deixam de ser cobradas e o
// que já foi pago vira crédito do competidor no mesmo evento.
export const INACTIVE_STATUSES = ['declined', 'cancelled']
export const isActiveRegistration = (reg) => reg && !INACTIVE_STATUSES.includes(reg.status)

// Integrantes na ordem do trio (A, B, C). O banco não garante a ordem das
// linhas, então a posição é guardada em cada integrante.
export const membersOf = (state, registrationId) =>
  state.registrationMembers
    .filter((m) => m.registrationId === registrationId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

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
      : cpf ? state.competitors.find((c) => cleanCpf(c.cpf) === cpf) : null
    if (known) return { ...p, known, cpf: cleanCpf(known.cpf), handicap: Number(known.handicap ?? 0), name: known.name, source: known.handicapSource || 'contep' }
    const record = contepRecordFor(state, { cpf, contepCode: p.contepCode })
    if (record) return { ...p, known: null, record, cpf, handicap: Number(record.handicap ?? 0), source: 'contep' }
    return { ...p, known: null, record: null, cpf, handicap: Number(p.handicap || 0), source: 'declared' }
  })
}

// Idade completa numa data. A referência é o dia da prova.
export function ageAt(birthDate, onDate) {
  if (!birthDate || !onDate) return null
  const [by, bm, bd] = String(birthDate).split('-').map(Number)
  const [y, m, d] = String(onDate).split('-').map(Number)
  if (!by || !y) return null
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0)
}

export const GENDERS = { F: 'Feminino', M: 'Masculino' }

// Restrições da categoria além da soma: handicap máximo de cada integrante
// (categorias amadoras), idade máxima e soma de idades (Kids, Mirim) e sexo
// (Feminina). Só são cobradas quando a categoria usa.
export function categoryRestrictionErrors(category, event, resolved) {
  const errors = []
  if (!category) return errors
  const label = (p, i) => p.known?.name || p.name || `competidor ${i + 1}`
  if (category.maxMemberHandicap != null && category.maxMemberHandicap !== '') {
    resolved.forEach((p, i) => {
      if (Number(p.handicap) > Number(category.maxMemberHandicap)) errors.push(`${label(p, i)} tem handicap ${p.handicap}. A ${category.name} aceita até ${category.maxMemberHandicap} por competidor.`)
    })
  }
  const usesAge = Number(category.maxAge) > 0 || Number(category.maxAgeSum) > 0
  if (usesAge) {
    const ages = resolved.map((p) => ageAt(p.known?.birthDate || p.birthDate, event?.date))
    ages.forEach((age, i) => {
      if (age == null) errors.push(`Informe a data de nascimento de ${label(resolved[i], i)}. A ${category.name} tem limite de idade.`)
      else if (Number(category.maxAge) > 0 && age > Number(category.maxAge)) errors.push(`${label(resolved[i], i)} tem ${age} anos. A ${category.name} aceita até ${category.maxAge}.`)
    })
    if (Number(category.maxAgeSum) > 0 && ages.every((a) => a != null)) {
      const sum = ages.reduce((a, b) => a + b, 0)
      if (sum > Number(category.maxAgeSum)) errors.push(`A soma das idades do trio é ${sum}. A ${category.name} permite até ${category.maxAgeSum}.`)
    }
  }
  if (category.gender) {
    resolved.forEach((p, i) => {
      const g = p.known?.gender || p.gender
      if (!g) errors.push(`Informe o sexo de ${label(p, i)}. A ${category.name} é ${GENDERS[category.gender]?.toLowerCase()}.`)
      else if (g !== category.gender) errors.push(`${label(p, i)} não pode correr a ${category.name}.`)
    })
  }
  return errors
}

export function validateRegistration(state, { eventId, categoryId, people, termsAccepted, today, ignoreWindow = false }) {
  const errors = []
  const event = state.events.find((e) => e.id === eventId)
  if (!event) return ['Evento não encontrado.']
  const window = registrationWindow(event, today)
  if (!window.open && !ignoreWindow) return [window.reason]
  if (ignoreWindow && ['finished', 'cancelled'].includes(event.status)) return ['O evento já foi encerrado.']

  const category = state.categories.find((c) => c.id === categoryId && c.eventId === eventId)
  if (!category) errors.push('Escolha uma categoria do evento.')
  if (!people || people.length !== 3) return [...errors, 'O trio precisa ter exatamente três competidores.']

  const resolved = resolveMembers(state, people)
  resolved.forEach((p, i) => {
    if (!p.known && !String(p.name || p.record?.name || '').trim()) errors.push(`Informe o nome do competidor ${i + 1}.`)
    // No balcão a organização pode lançar quem ainda não tem CPF anotado. Pelo
    // site o CPF é obrigatório, porque é a identidade do competidor.
    if (!p.known && (p.cpf || !ignoreWindow) && !isValidCpf(p.cpf)) errors.push(`O CPF do competidor ${i + 1} não é válido.`)
    // O telefone é a chave de acesso à área do competidor: sem ele, o convite
    // não pode ser aceito.
    const phone = String(p.phone || '').replace(/\D/g, '')
    if (!p.known && !ignoreWindow && (phone.length < 10 || phone.length > 11)) errors.push(`Informe o celular com DDD do competidor ${i + 1}.`)
  })
  const identity = (p) => p.known?.id || p.cpf || normalize(p.name || '')
  if (new Set(resolved.map(identity)).size < 3) errors.push('O trio precisa ter três competidores diferentes.')

  const sum = resolved.reduce((s, p) => s + Number(p.handicap || 0), 0)
  if (category && sum > Number(category.maxHandicap)) {
    errors.push(`A soma de handicap deste trio é ${sum}. A categoria ${category.name} permite até ${category.maxHandicap}.`)
  }
  errors.push(...categoryRestrictionErrors(category, event, resolved))

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
