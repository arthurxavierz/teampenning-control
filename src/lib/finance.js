import { isActiveRegistration, recomputeRegistrationStatus } from './rules.js'

// Participações cobráveis do competidor: aceitas, em trios ativos, na ordem
// em que os trios foram criados. É essa ordem que decide qual participação o
// dinheiro quita primeiro.
function billableMembers(state, eventId, competitorId) {
  return state.registrationMembers
    .filter((m) => m.competitorId === competitorId && m.confirmationStatus === 'accepted')
    .map((m) => ({ member: m, reg: state.registrations.find((r) => r.id === m.registrationId) }))
    .filter(({ reg }) => reg?.eventId === eventId && isActiveRegistration(reg))
    .sort((a, b) => String(a.reg.createdAt).localeCompare(String(b.reg.createdAt)))
}

const memberPrice = (state, member, eventId) =>
  Number(member.price ?? state.events.find((e) => e.id === eventId)?.registrationPrice ?? 0)

export const confirmedPaid = (state, eventId, competitorId) =>
  state.payments
    .filter((p) => p.eventId === eventId && p.competitorId === competitorId && p.status === 'confirmed')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0)

// Refaz a distribuição do dinheiro confirmado entre as participações. Se um
// trio cai, o valor dele volta a ser crédito e quita a próxima participação
// aceita, sem baixa manual nova. A distribuição é estável: o que já estava
// quitado continua quitado enquanto houver caixa, mesmo que um convite mais
// antigo seja aceito depois. Assim um trio confirmado não volta a pendente.
export function allocatePayments(draft, eventId, competitorId) {
  let available = confirmedPaid(draft, eventId, competitorId)
  const billable = billableMembers(draft, eventId, competitorId).map((x) => x.member)
  const next = new Map()
  const take = (member) => {
    const price = memberPrice(draft, member, eventId)
    if (available < price) return false
    available -= price
    return true
  }
  billable.filter((m) => m.paymentStatus === 'paid').forEach((m) => next.set(m.id, take(m)))
  billable.filter((m) => m.paymentStatus !== 'paid').forEach((m) => next.set(m.id, take(m)))

  const touched = new Set()
  billable.forEach((member) => {
    const status = next.get(member.id) ? 'paid' : 'pending'
    if (member.paymentStatus !== status) {
      member.paymentStatus = status
      member.paidAt = status === 'paid' ? new Date().toISOString() : null
    }
    touched.add(member.registrationId)
  })
  touched.forEach((id) => recomputeRegistrationStatus(draft, id))
  return available
}

export function competitorAccount(state, eventId, competitorId) {
  const all = state.registrationMembers.filter((m) => {
    const reg = state.registrations.find((r) => r.id === m.registrationId)
    return m.competitorId === competitorId && reg?.eventId === eventId
  })
  const billable = billableMembers(state, eventId, competitorId).map((x) => x.member)
  const due = billable.reduce((s, m) => s + memberPrice(state, m, eventId), 0)
  const paid = confirmedPaid(state, eventId, competitorId)
  const payments = state.payments.filter((p) => p.eventId === eventId && p.competitorId === competitorId)
  return {
    participations: all.length,
    accepted: billable.length,
    paidCount: billable.filter((m) => m.paymentStatus === 'paid').length,
    pendingCount: billable.filter((m) => m.paymentStatus !== 'paid').length,
    invites: all.filter((m) => m.confirmationStatus === 'pending').length,
    due,
    paid,
    balance: Math.max(0, due - paid),
    credit: Math.max(0, paid - due),
    reported: payments.filter((p) => p.status === 'reported'),
    payments
  }
}

export function financialByCompetitor(state, eventId) {
  const ids = new Set()
  state.registrationMembers.forEach((m) => {
    const reg = state.registrations.find((r) => r.id === m.registrationId)
    if (reg?.eventId === eventId) ids.add(m.competitorId)
  })
  state.payments.forEach((p) => p.eventId === eventId && ids.add(p.competitorId))
  return [...ids]
    .map((id) => {
      const competitor = state.competitors.find((c) => c.id === id)
      return competitor ? { competitor, ...competitorAccount(state, eventId, id) } : null
    })
    .filter(Boolean)
    .sort((a, b) => b.reported.length - a.reported.length || b.balance - a.balance || a.competitor.name.localeCompare(b.competitor.name))
}

export function eventMetrics(state, eventId) {
  const regs = state.registrations.filter((r) => r.eventId === eventId)
  const finances = financialByCompetitor(state, eventId)
  const active = regs.filter(isActiveRegistration)
  return {
    registrations: active.length,
    confirmed: regs.filter((r) => r.status === 'confirmed').length,
    awaitingConfirmation: regs.filter((r) => r.status === 'awaiting_confirmation').length,
    awaitingPayment: regs.filter((r) => r.status === 'awaiting_payment').length,
    competitors: finances.length,
    receivable: finances.reduce((s, f) => s + f.due, 0),
    received: finances.reduce((s, f) => s + f.paid, 0),
    pending: finances.reduce((s, f) => s + f.balance, 0),
    credits: finances.reduce((s, f) => s + f.credit, 0),
    reported: finances.reduce((s, f) => s + f.reported.length, 0)
  }
}
