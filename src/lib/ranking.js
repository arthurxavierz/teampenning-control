import { membersOf } from './rules.js'
import { drawCattle } from './schedule.js'
import { seededRandom, uid } from './utils.js'

const round3 = (n) => Math.round(n * 1000) / 1000

export const occurrenceOf = (event, code) => (code ? (event?.occurrences || []).find((o) => o.code === code) : null)

// Tempo que vale para a classificação. undefined: passada ainda não corrida.
// null: corrida sem tempo válido (SAT, desclassificação ou sem tempo).
export function effectiveTime(run, event) {
  if (run.status !== 'done') return undefined
  const occ = occurrenceOf(event, run.occurrence)
  if (occ && (occ.effect === 'no_time' || occ.effect === 'disqualified')) return null
  if (run.time == null) return null
  return round3(Number(run.time) + (occ?.effect === 'penalty' ? Number(occ.seconds || 0) : 0))
}

const isDisqualified = (runs, event) => runs.some((r) => r.status === 'done' && occurrenceOf(event, r.occurrence)?.effect === 'disqualified')

function compareLists(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] == null && b[i] == null) return 0
    if (a[i] == null) return 1
    if (b[i] == null) return -1
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

// Desempate configurável por categoria. "shared" mantém o empate e as duas
// equipes dividem a posição, que é o comportamento seguro enquanto a
// organização não homologa uma regra oficial.
function tiebreak(category, a, b) {
  if (category.tiebreak === 'best_single') return compareLists(a.times, b.times)
  if (category.tiebreak === 'last_valid') return (a.lastValid ?? Infinity) - (b.lastValid ?? Infinity)
  return 0
}

function assignPositions(rows, same) {
  rows.forEach((row, i) => {
    const prev = rows[i - 1]
    row.position = prev && same(prev, row) ? prev.position : i + 1
    row.tied = Boolean(prev && same(prev, row))
    if (row.tied) prev.tied = true
  })
  return rows
}

const competitorsOf = (state, registrationId) =>
  membersOf(state, registrationId).map((m) => state.competitors.find((c) => c.id === m.competitorId)).filter(Boolean)

export function qualifyingRanking(state, eventId, categoryId) {
  const event = state.events.find((e) => e.id === eventId)
  const category = state.categories.find((c) => c.id === categoryId)
  if (!event || !category) return []
  const runs = state.runs.filter((r) => r.eventId === eventId && r.categoryId === categoryId && r.stage === 'qualifying')
  const regIds = new Set([
    ...state.registrations.filter((r) => r.eventId === eventId && r.categoryId === categoryId && r.status === 'confirmed').map((r) => r.id),
    ...runs.map((r) => r.registrationId)
  ])
  const need = Number(category.bestTimesCount)

  const rows = [...regIds].map((id) => {
    const registration = state.registrations.find((r) => r.id === id)
    const own = runs.filter((r) => r.registrationId === id).sort((a, b) => a.number - b.number)
    const done = own.filter((r) => r.status === 'done')
    const valid = done.map((r) => effectiveTime(r, event)).filter((t) => t != null)
    const times = [...valid].sort((a, b) => a - b)
    const counted = times.slice(0, need)
    const disqualified = isDisqualified(own, event)
    const eligible = !disqualified && counted.length >= need
    return {
      registration,
      members: competitorsOf(state, id),
      runs: own,
      runsDone: done.length,
      runsTotal: own.length,
      times,
      counted,
      lastValid: valid[valid.length - 1],
      partial: round3(counted.reduce((a, b) => a + b, 0)),
      score: eligible ? round3(counted.reduce((a, b) => a + b, 0)) : null,
      eligible,
      disqualified
    }
  })

  const eligible = rows.filter((r) => r.eligible).sort((a, b) => a.score - b.score || tiebreak(category, a, b))
  assignPositions(eligible, (a, b) => a.score === b.score && tiebreak(category, a, b) === 0)
  eligible.forEach((r) => { r.finalist = r.position <= Number(category.finalistsCount || 0) })

  const rest = rows
    .filter((r) => !r.eligible)
    .sort((a, b) => Number(a.disqualified) - Number(b.disqualified) || b.counted.length - a.counted.length || a.partial - b.partial)
    .map((r) => ({ ...r, position: null, finalist: false }))
  return [...eligible, ...rest]
}

export function qualifyingComplete(state, eventId, categoryId) {
  const runs = state.runs.filter((r) => r.eventId === eventId && r.categoryId === categoryId && r.stage === 'qualifying')
  return runs.length > 0 && runs.every((r) => r.status === 'done')
}

// Final. Cada finalista soma os tempos da final e, se a categoria carrega a
// classificatória, parte da soma que fez nela.
export function finalRanking(state, eventId, categoryId) {
  const event = state.events.find((e) => e.id === eventId)
  const category = state.categories.find((c) => c.id === categoryId)
  if (!event || !category) return []
  const runs = state.runs.filter((r) => r.eventId === eventId && r.categoryId === categoryId && r.stage === 'final')
  if (!runs.length) return []
  const qualifying = Object.fromEntries(qualifyingRanking(state, eventId, categoryId).map((r) => [r.registration.id, r]))
  const regIds = [...new Set(runs.map((r) => r.registrationId))]

  const rows = regIds.map((id) => {
    const own = runs.filter((r) => r.registrationId === id).sort((a, b) => a.number - b.number)
    const done = own.filter((r) => r.status === 'done')
    const times = done.map((r) => effectiveTime(r, event))
    const invalid = times.some((t) => t == null) || isDisqualified(own, event)
    const carried = category.carryQualifying ? qualifying[id]?.score ?? 0 : 0
    const sum = times.filter((t) => t != null).reduce((a, b) => a + b, 0)
    return {
      registration: state.registrations.find((r) => r.id === id),
      members: competitorsOf(state, id),
      runs: own,
      finalTimes: times,
      carried,
      qualifyingPosition: qualifying[id]?.position ?? null,
      total: round3(carried + sum),
      complete: done.length === own.length,
      remaining: own.length - done.length,
      invalid
    }
  })

  const byQualifying = (a, b) => (a.qualifyingPosition ?? 999) - (b.qualifyingPosition ?? 999)
  const finished = rows.filter((r) => r.complete && !r.invalid).sort((a, b) => a.total - b.total || byQualifying(a, b))
  assignPositions(finished, (a, b) => a.total === b.total && byQualifying(a, b) === 0)
  const running = rows.filter((r) => !r.complete && !r.invalid).sort(byQualifying).map((r) => ({ ...r, position: null }))
  const out = rows.filter((r) => r.invalid).sort(byQualifying).map((r) => ({ ...r, position: null }))
  return [...finished, ...running, ...out]
}

// Quanto o trio precisa fazer na última passada da final para assumir a
// liderança. null quando ainda não é a última passada dele ou quando não há
// líder para bater.
export function timeToLead(state, eventId, categoryId, registrationId) {
  const rows = finalRanking(state, eventId, categoryId)
  const row = rows.find((r) => r.registration.id === registrationId)
  if (!row || row.invalid || row.remaining !== 1) return null
  const leader = rows.find((r) => r.position === 1 && r.registration.id !== registrationId)
  if (!leader) return null
  return round3(leader.total - row.total)
}

// Gera as passadas da final: o último classificado corre primeiro e o líder da
// classificatória fecha cada rodada.
export function buildFinalRuns(state, eventId, categoryId, { startNumber, seed }) {
  const event = state.events.find((e) => e.id === eventId)
  const category = state.categories.find((c) => c.id === categoryId)
  const finalists = qualifyingRanking(state, eventId, categoryId).filter((r) => r.finalist).reverse()
  const rand = seededRandom(seed || 1)
  const runs = []
  let number = startNumber
  const used = {}
  for (let round = 1; round <= Number(category?.finalRuns || 1); round++) {
    finalists.forEach((row) => {
      const id = row.registration.id
      const taken = used[id] || (used[id] = [])
      const cattle = drawCattle(rand, event?.cattle, taken)
      taken.push(cattle)
      runs.push({
        id: uid('run'),
        eventId,
        registrationId: id,
        categoryId,
        stage: 'final',
        round,
        number: number++,
        cattle,
        status: 'pending',
        time: null,
        occurrence: null,
        note: ''
      })
    })
  }
  return runs
}

// Quanto o trio precisa fazer na próxima passada classificatória para entrar
// no corte da final. Considera que o novo tempo substitui o pior dos tempos
// que contam. Devolve:
//   { status: 'in' }        já está dentro do corte
//   { status: 'open' }      há vaga sobrando: qualquer tempo que complete a soma entra
//   { status: 'need', time } precisa fazer menos que time
//   { status: 'out' }       não alcança o corte com uma passada
//   null                    ainda faltam tempos demais para calcular
export function timeToQualify(state, eventId, categoryId, registrationId) {
  const category = state.categories.find((c) => c.id === categoryId)
  if (!category) return null
  const rows = qualifyingRanking(state, eventId, categoryId)
  const row = rows.find((r) => r.registration.id === registrationId)
  if (!row || row.disqualified) return null
  const need = Number(category.bestTimesCount)
  const cut = Number(category.finalistsCount || 0)
  if (!cut) return null
  if (row.finalist) return { status: 'in' }
  const keep = row.times.slice(0, need - 1)
  if (keep.length < need - 1) return null
  const others = rows.filter((r) => r.eligible && r.registration.id !== registrationId)
  if (others.length < cut) return { status: 'open' }
  const target = others[cut - 1].score
  const time = round3(target - keep.reduce((a, b) => a + b, 0))
  return time > 0 ? { status: 'need', time } : { status: 'out' }
}
