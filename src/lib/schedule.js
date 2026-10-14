import { seededRandom, shuffle, uid } from './utils.js'
import { membersOf } from './rules.js'

export const memberIdsOf = (state, registrationId) => membersOf(state, registrationId).map((m) => m.competitorId)

// Menor distância, em passadas, entre este trio e a última aparição de
// qualquer um dos três competidores. Infinity quando nenhum correu ainda.
function distance(ids, lastSeen, position) {
  return ids.reduce((min, id) => (lastSeen.has(id) ? Math.min(min, position - lastSeen.get(id)) : min), Infinity)
}

// Escolhe o próximo trio da fila. Prefere o primeiro, na ordem sorteada, que
// respeita a distância mínima. Se nenhum respeita, fica com o que mais se
// aproxima dela, e o conflito aparece depois na análise da montagem.
function pickNext(pending, memberMap, lastSeen, position, minGap) {
  let best = 0
  let bestDistance = -1
  for (let i = 0; i < pending.length; i++) {
    const d = distance(memberMap[pending[i].id], lastSeen, position)
    if (d > minGap) return i
    if (d > bestDistance) {
      best = i
      bestDistance = d
    }
  }
  return best
}

export function drawCattle(rand, cattle, used = []) {
  const min = Number(cattle?.min ?? 0)
  const max = Math.max(min, Number(cattle?.max ?? 6))
  const options = []
  for (let n = min; n <= max; n++) options.push(n)
  const fresh = options.filter((n) => !used.includes(n))
  const pool = fresh.length ? fresh : options
  return pool[Math.floor(rand() * pool.length)]
}

// Boi da passada conforme o modo da boiada: sorteado na montagem ("draw"),
// em sequência ("sequential") ou sorteado na hora, pela mesa ("live").
export function assignCattle(event, rand, used, number) {
  const mode = event?.cattle?.mode
  if (mode === 'live') return null
  if (mode === 'sequential') {
    const min = Number(event.cattle?.min ?? 0)
    const max = Number(event.cattle?.max ?? 6)
    return min + ((number - 1) % (max - min + 1))
  }
  return drawCattle(rand, event?.cattle, used)
}

// Bois que o trio já recebeu, para o sorteio não repetir.
export const usedCattle = (state, registrationId, exceptRunId) =>
  state.runs.filter((r) => r.registrationId === registrationId && r.id !== exceptRunId && r.cattle != null).map((r) => r.cattle)

function blocksFor(regs, categories, mode) {
  const runsOf = (reg) => Number(categories.find((c) => c.id === reg.categoryId)?.qualifyingRuns || 0)
  const maxRounds = Math.max(0, ...regs.map(runsOf))
  const blocks = []
  if (mode === 'by_category') {
    categories.forEach((cat) => {
      for (let round = 1; round <= Number(cat.qualifyingRuns || 0); round++) {
        blocks.push({ round, regs: regs.filter((r) => r.categoryId === cat.id) })
      }
    })
  } else {
    for (let round = 1; round <= maxRounds; round++) blocks.push({ round, regs: regs.filter((r) => runsOf(r) >= round) })
  }
  return blocks.filter((b) => b.regs.length)
}

// Monta as passadas classificatórias a partir dos trios confirmados. A mesma
// semente produz exatamente a mesma ordem, então o sorteio pode ser refeito
// diante de quem questionar o resultado.
export function buildSchedule(state, eventId, { seed, startNumber = 1, previous = [] } = {}) {
  const event = state.events.find((e) => e.id === eventId)
  if (!event) return []
  const rules = event.schedule || {}
  const minGap = Number(rules.minGap ?? 2)
  const rand = seededRandom(seed ?? rules.seed ?? 1)
  const categories = state.categories.filter((c) => c.eventId === eventId)
  const alreadyIn = new Set(previous.map((r) => r.registrationId))
  const regs = state.registrations.filter((r) => r.eventId === eventId && r.status === 'confirmed' && !alreadyIn.has(r.id))
  const memberMap = Object.fromEntries(regs.map((r) => [r.id, memberIdsOf(state, r.id)]))
  const cattleUsed = {}

  const lastSeen = new Map()
  previous.forEach((run, i) => memberIdsOf(state, run.registrationId).forEach((id) => lastSeen.set(id, i)))
  let position = previous.length
  let number = startNumber
  const result = []

  blocksFor(regs, categories, rules.mode).forEach(({ round, regs: blockRegs }) => {
    const pending = shuffle(blockRegs, rand)
    while (pending.length) {
      const [chosen] = pending.splice(pickNext(pending, memberMap, lastSeen, position, minGap), 1)
      const used = cattleUsed[chosen.id] || (cattleUsed[chosen.id] = [])
      const cattle = assignCattle(event, rand, used, number)
      if (cattle != null) used.push(cattle)
      result.push({
        id: uid('run'),
        eventId,
        registrationId: chosen.id,
        categoryId: chosen.categoryId,
        stage: 'qualifying',
        round,
        number: number++,
        cattle,
        status: 'pending',
        time: null,
        occurrence: null,
        penalty: 0,
        note: ''
      })
      memberMap[chosen.id].forEach((id) => lastSeen.set(id, position))
      position++
    }
  })
  return result
}

// Lista cada competidor que corre de novo antes da distância mínima. A
// organização decide se aceita ou ajusta manualmente.
export function analyzeSchedule(state, runs, minGap) {
  const ordered = [...runs].sort((a, b) => a.number - b.number)
  const lastSeen = new Map()
  const conflicts = []
  ordered.forEach((run, i) => {
    memberIdsOf(state, run.registrationId).forEach((id) => {
      if (lastSeen.has(id) && i - lastSeen.get(id) <= minGap) {
        conflicts.push({ runId: run.id, number: run.number, competitorId: id, gap: i - lastSeen.get(id) - 1 })
      }
      lastSeen.set(id, i)
    })
  })
  return conflicts
}

export function eventRuns(state, eventId, stage) {
  return state.runs
    .filter((r) => r.eventId === eventId && (!stage || r.stage === stage))
    .sort((a, b) => a.number - b.number)
}

export const nextRunNumber = (state, eventId) => Math.max(0, ...eventRuns(state, eventId).map((r) => r.number)) + 1
