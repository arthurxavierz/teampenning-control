import { defaultCategories, defaultEventSettings } from './defaults.js'
import { allocatePayments } from './finance.js'
import { buildFinalRuns } from './ranking.js'
import { buildSchedule } from './schedule.js'
import { addDays, makeCpf, seededRandom, todayIso } from './utils.js'

export const STATE_VERSION = 2

// Base de demonstração. As datas acompanham o dia em que o protótipo é aberto
// para que as inscrições do evento ativo estejam sempre dentro do prazo.
const PEOPLE = [
  ['arthur', 'Arthur Xavier', 'Arthur', '111222333', '34999990001', 'D1278', 1],
  ['jose', 'José Martins', 'José', '222333444', '34999990002', 'E0182', 1],
  ['maria', 'Maria Fernanda Lopes', 'Maria', '333444555', '34999990003', 'F4410', 1],
  ['nicolas', 'Nicolas Souza', 'Nicolas', '444555666', '34999990004', 'G1077', 0],
  ['felipe', 'Felipe Nunes', 'Felipe', '555666777', '34999990005', 'H1202', 2],
  ['lucas', 'Lucas Dias', 'Lucas', '666777888', '34999990006', 'I1440', 0],
  ['rafael', 'Rafael Prado', 'Rafael', '777888999', '34999990007', 'J2031', 3],
  ['bruno', 'Bruno Carvalho', 'Bruno', '888999000', '34999990008', 'K0990', 4],
  ['carla', 'Carla Menezes', 'Carla', '123456789', '34999990009', 'L3321', 0],
  ['diego', 'Diego Amaral', 'Diego', '234567891', '34999990010', 'M0415', 5],
  ['eduardo', 'Eduardo Ribeiro', 'Edu', '345678912', '34999990011', 'N7712', 2],
  ['fernanda', 'Fernanda Queiroz', 'Nanda', '456789123', '34999990012', 'O1180', 1],
  ['gustavo', 'Gustavo Borges', 'Gustavo', '567891234', '34999990013', 'P5520', 3],
  ['helena', 'Helena Tavares', 'Helena', '678912345', '34999990014', 'Q0087', 0],
  ['igor', 'Igor Paiva', 'Igor', '789123456', '34999990015', 'R4410', 4],
  ['juliana', 'Juliana Castro', 'Juli', '891234567', '34999990016', 'S2200', 2],
  ['kleber', 'Kleber Rocha', 'Kleber', '912345678', '34999990017', 'T3001', 0],
  ['larissa', 'Larissa Moura', 'Lari', '102938475', '34999990018', 'U1100', 0]
]

export const DEMO_LOGIN = { cpf: makeCpf('111222333'), phone: '34999990001' }

function competitors() {
  return PEOPLE.map(([key, name, nickname, base, phone, contepCode, handicap]) => ({
    id: `cmp_${key}`,
    name,
    nickname,
    cpf: makeCpf(base),
    phone,
    contepCode,
    handicap,
    handicapSource: 'contep'
  }))
}

function makeEvent(id, patch) {
  return {
    id,
    organizationId: 'org_1',
    city: 'Uberlândia',
    state: 'MG',
    venue: 'CTM HSF',
    registrationPrice: 350,
    pix: { key: '34999999999', name: 'CTM EVENTOS', city: 'UBERLANDIA' },
    active: false,
    ...defaultEventSettings(),
    ...patch
  }
}

// [categoria, criador, [integrante, aceitou, pago], ...]
function addTrios(state, eventId, cats, trios, baseDate) {
  trios.forEach(([catName, members], i) => {
    const cat = cats.find((c) => c.name === catName)
    const regId = `reg_${eventId}_${i + 1}`
    const createdAt = `${addDays(baseDate, Math.floor(i / 3))}T${String(9 + (i % 9)).padStart(2, '0')}:00:00`
    state.registrations.push({
      id: regId,
      eventId,
      categoryId: cat.id,
      createdByCompetitorId: `cmp_${members[0][0]}`,
      status: 'awaiting_confirmation',
      createdAt,
      termsAcceptedAt: createdAt
    })
    members.forEach(([key, accepted, paid], j) => {
      const comp = state.competitors.find((c) => c.id === `cmp_${key}`)
      state.registrationMembers.push({
        id: `mem_${regId}_${j + 1}`,
        registrationId: regId,
        competitorId: comp.id,
        confirmationStatus: accepted,
        paymentStatus: paid ? 'paid' : 'pending',
        handicapSnapshot: comp.handicap,
        price: 350,
        respondedAt: accepted === 'pending' ? null : createdAt
      })
    })
  })
}

function settlePayments(state, eventId, at) {
  const due = {}
  state.registrationMembers.forEach((m) => {
    const reg = state.registrations.find((r) => r.id === m.registrationId)
    if (reg.eventId === eventId && m.paymentStatus === 'paid') due[m.competitorId] = (due[m.competitorId] || 0) + m.price
  })
  Object.entries(due).forEach(([competitorId, amount]) => {
    state.payments.push({
      id: `pay_${eventId}_${competitorId}`,
      eventId,
      competitorId,
      amount,
      method: 'pix',
      status: 'confirmed',
      createdAt: at,
      confirmedAt: at,
      confirmedBy: 'Organização'
    })
  })
  new Set(state.registrationMembers.map((m) => m.competitorId)).forEach((id) => allocatePayments(state, eventId, id))
}

function runTimes(state, event, stage, rand) {
  state.runs
    .filter((r) => r.eventId === event.id && r.stage === stage)
    .forEach((run) => {
      const roll = rand()
      run.status = 'done'
      run.recordedAt = `${event.date}T${String(10 + Math.floor(run.number / 12)).padStart(2, '0')}:${String((run.number * 7) % 60).padStart(2, '0')}:00`
      run.recordedBy = 'Mesa de pista'
      if (roll < 0.07) {
        run.occurrence = 'SAT'
        run.time = null
      } else {
        run.time = Math.round((34 + rand() * 24) * 1000) / 1000
        if (roll > 0.97) run.occurrence = 'P5'
      }
    })
}

const Y = 'accepted'
const P = 'pending'

export function createSeed(today = todayIso()) {
  const state = {
    version: STATE_VERSION,
    organizations: [{ id: 'org_1', name: 'CTM Team Penning', slug: 'ctm-team-penning' }],
    events: [],
    categories: [],
    competitors: competitors(),
    registrations: [],
    registrationMembers: [],
    payments: [],
    runs: [],
    auditLog: [],
    contep: { year: Number(today.slice(0, 4)), importedAt: `${today.slice(0, 4)}-01-08T14:00:00`, records: [], imports: [] }
  }
  state.contep.records = state.competitors.map((c) => ({ contepCode: c.contepCode, name: c.name, cpf: c.cpf, handicap: c.handicap }))

  // Etapa anterior, encerrada e homologada: alimenta histórico e relatórios.
  const pastDate = addDays(today, -35)
  const past = makeEvent('evt_past', {
    name: '7ª Etapa CTM HSF',
    slug: '7-etapa-ctm-hsf',
    status: 'finished',
    date: pastDate,
    registrationOpens: addDays(pastDate, -20),
    registrationCloses: addDays(pastDate, -2),
    description: 'Etapa encerrada, com classificatória, final e resultado homologado.'
  })
  const pastCats = defaultCategories(past.id)
  state.events.push(past)
  state.categories.push(...pastCats)
  addTrios(state, past.id, pastCats, [
    ['SOMA 03', [['arthur', Y, 1], ['jose', Y, 1], ['maria', Y, 1]]],
    ['SOMA 03', [['fernanda', Y, 1], ['eduardo', Y, 1], ['helena', Y, 1]]],
    ['SOMA 03', [['maria', Y, 1], ['juliana', Y, 1], ['carla', Y, 1]]],
    ['SOMA 03', [['jose', Y, 1], ['fernanda', Y, 1], ['lucas', Y, 1]]],
    ['SOMA 11', [['felipe', Y, 1], ['rafael', Y, 1], ['bruno', Y, 1]]],
    ['SOMA 11', [['diego', Y, 1], ['gustavo', Y, 1], ['juliana', Y, 1]]],
    ['SOMA 11', [['igor', Y, 1], ['rafael', Y, 1], ['eduardo', Y, 1]]],
    ['SOMA 11', [['gustavo', Y, 1], ['igor', Y, 1], ['arthur', Y, 1]]],
    ['INICIANTE', [['nicolas', Y, 1], ['lucas', Y, 1], ['carla', Y, 1]]],
    ['INICIANTE', [['helena', Y, 1], ['kleber', Y, 1], ['larissa', Y, 1]]],
    ['INICIANTE', [['nicolas', Y, 1], ['helena', Y, 1], ['larissa', Y, 1]]]
  ], addDays(pastDate, -15))
  settlePayments(state, past.id, `${addDays(pastDate, -3)}T18:00:00`)
  past.schedule = { ...past.schedule, seed: 482913, generatedAt: `${addDays(pastDate, -1)}T20:00:00`, publishedAt: `${addDays(pastDate, -1)}T20:30:00` }
  state.runs.push(...buildSchedule(state, past.id, { seed: 482913 }))
  const rand = seededRandom(7)
  runTimes(state, past, 'qualifying', rand)
  pastCats.forEach((cat) => {
    cat.finalistsCount = cat.name === 'INICIANTE' ? 2 : 3
    const start = Math.max(...state.runs.filter((r) => r.eventId === past.id).map((r) => r.number)) + 1
    state.runs.push(...buildFinalRuns(state, past.id, cat.id, { startNumber: start, seed: 91 }))
  })
  runTimes(state, past, 'final', rand)
  pastCats.forEach((cat) => {
    past.homologated[cat.id] = { at: `${pastDate}T19:00:00`, by: 'Organização' }
  })

  // Etapa ativa, com inscrições abertas e trios em todos os estados.
  const date = addDays(today, 6)
  const active = makeEvent('evt_demo', {
    name: '8ª Etapa CTM HSF',
    slug: '8-etapa-ctm-hsf',
    status: 'registration_open',
    date,
    registrationOpens: addDays(today, -10),
    registrationCloses: addDays(today, 4),
    active: true,
    description: 'Etapa completa de Team Penning com inscrição por trio, financeiro por CPF, montagem sorteada e Arena Live.'
  })
  const cats = defaultCategories(active.id)
  state.events.push(active)
  state.categories.push(...cats)
  addTrios(state, active.id, cats, [
    ['SOMA 03', [['arthur', Y, 1], ['jose', Y, 1], ['maria', Y, 1]]],
    ['SOMA 03', [['jose', Y, 1], ['fernanda', Y, 1], ['lucas', Y, 1]]],
    ['SOMA 03', [['maria', Y, 1], ['juliana', Y, 1], ['carla', Y, 1]]],
    ['SOMA 03', [['fernanda', Y, 1], ['eduardo', Y, 1], ['helena', Y, 1]]],
    ['SOMA 11', [['felipe', Y, 1], ['rafael', Y, 1], ['bruno', Y, 1]]],
    ['SOMA 11', [['diego', Y, 1], ['gustavo', Y, 1], ['juliana', Y, 1]]],
    ['SOMA 11', [['igor', Y, 1], ['rafael', Y, 1], ['eduardo', Y, 1]]],
    ['SOMA 11', [['gustavo', Y, 1], ['igor', Y, 1], ['maria', Y, 1]]],
    ['INICIANTE', [['nicolas', Y, 1], ['lucas', Y, 1], ['carla', Y, 1]]],
    ['INICIANTE', [['helena', Y, 1], ['kleber', Y, 1], ['larissa', Y, 1]]],
    ['SOMA 03', [['arthur', Y, 0], ['nicolas', Y, 1], ['felipe', Y, 0]]],
    ['SOMA 11', [['bruno', Y, 0], ['diego', Y, 0], ['arthur', P, 0]]],
    ['SOMA 03', [['arthur', Y, 0], ['fernanda', P, 0], ['kleber', P, 0]]]
  ], addDays(today, -9))
  settlePayments(state, active.id, `${addDays(today, -2)}T18:00:00`)
  state.payments.push({
    id: 'pay_reported_arthur',
    eventId: active.id,
    competitorId: 'cmp_arthur',
    amount: 350,
    method: 'pix',
    status: 'reported',
    note: 'Pix enviado pelo aplicativo do banco.',
    createdAt: `${addDays(today, -1)}T20:15:00`
  })

  state.auditLog.push({
    id: 'log_seed',
    at: `${today}T08:00:00`,
    eventId: active.id,
    actor: 'Sistema',
    action: 'seed',
    summary: 'Base de demonstração carregada.'
  })
  return state
}
