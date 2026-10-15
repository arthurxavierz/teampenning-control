import { beforeEach, describe, expect, it } from 'vitest'
import { actions, getState } from './store.jsx'
import { competitorAccount } from './finance.js'
import { finalRanking, prizeByRegistration, prizeTable, qualifyingRanking } from './ranking.js'
import { makeCpf } from './utils.js'

const EVT = 'evt_demo'
const cat = (name) => getState().categories.find((c) => c.eventId === EVT && c.name === name)
const pendingRuns = () => getState().runs.filter((r) => r.eventId === EVT && r.status === 'pending').sort((a, b) => a.number - b.number)

describe('fluxo completo na store', () => {
  beforeEach(() => {
    actions.reset()
    actions.setOperator('Mesa 1')
  })

  it('inscrição, convite, pagamento e confirmação do trio', () => {
    const res = actions.createRegistration({
      eventId: EVT,
      categoryId: cat('INICIANTE').id,
      termsAccepted: true,
      creatorIndex: 0,
      people: [{ competitorId: 'cmp_kleber' }, { competitorId: 'cmp_larissa' }, { name: 'Novo Peão', cpf: makeCpf('135792468'), phone: '34988887777', handicap: 0 }]
    })
    expect(res.ok).toBe(true)
    const reg = () => getState().registrations.find((r) => r.id === res.registrationId)
    expect(reg().status).toBe('awaiting_confirmation')
    const newbie = getState().competitors.find((c) => c.name === 'Novo Peão')
    expect(newbie.handicapSource).toBe('declared')

    getState().registrationMembers
      .filter((m) => m.registrationId === res.registrationId && m.confirmationStatus === 'pending')
      .forEach((m) => expect(actions.respondInvite(m.id, 'accepted').ok).toBe(true))
    expect(reg().status).toBe('awaiting_payment')

    ;['cmp_kleber', 'cmp_larissa', newbie.id].forEach((id) => {
      const acc = competitorAccount(getState(), EVT, id)
      expect(actions.confirmPayment({ eventId: EVT, competitorId: id, amount: acc.balance }).ok).toBe(true)
    })
    expect(reg().status).toBe('confirmed')
    expect(getState().auditLog[0].actor).toBe('Mesa 1')
  })

  it('recusa derruba o trio e o pagamento informado vira baixa', () => {
    const invite = getState().registrationMembers.find((m) => m.registrationId === 'reg_evt_demo_12' && m.competitorId === 'cmp_arthur')
    actions.respondInvite(invite.id, 'declined')
    expect(getState().registrations.find((r) => r.id === 'reg_evt_demo_12').status).toBe('declined')
    expect(actions.respondInvite(invite.id, 'accepted').ok).toBe(false)

    actions.confirmPayment({ eventId: EVT, competitorId: 'cmp_arthur', amount: 350, paymentId: 'pay_reported_arthur' })
    expect(getState().payments.find((p) => p.id === 'pay_reported_arthur').status).toBe('confirmed')
    expect(competitorAccount(getState(), EVT, 'cmp_arthur').reported).toHaveLength(0)
  })

  it('montagem, publicação, pista, correção, final e homologação', () => {
    expect(actions.generateSchedule(EVT).ok).toBe(true)
    expect(getState().events.find((e) => e.id === EVT).schedule.seed).toBeGreaterThan(0)
    expect(actions.publishSchedule(EVT).ok).toBe(true)
    expect(actions.generateSchedule(EVT).ok).toBe(false)

    const list = pendingRuns()
    expect(actions.moveRun(list[1].id, 1, '').ok).toBe(false)
    expect(actions.moveRun(list[1].id, 1, 'Cavalo mancando').ok).toBe(true)

    const first = pendingRuns()[0]
    expect(actions.recordRun(first.id, { time: '41,237' }).ok).toBe(true)
    expect(actions.recordRun(first.id, { time: '40' }).ok).toBe(false)
    expect(getState().runs.find((r) => r.id === first.id).time).toBe(41.237)

    expect(actions.correctRun(first.id, { time: 39.5 }, '').ok).toBe(false)
    expect(actions.correctRun(first.id, { time: 39.5 }, 'Cronômetro reserva').ok).toBe(true)
    expect(actions.undoRun(first.id, 'Lançado na passada errada').ok).toBe(true)
    expect(getState().runs.find((r) => r.id === first.id).status).toBe('pending')

    let t = 35
    let i = 0
    while (pendingRuns().length) {
      actions.recordRun(pendingRuns()[0].id, i++ % 7 === 3 ? { occurrence: 'SAT' } : { time: t })
      t += 0.731
    }
    const ini = cat('INICIANTE')
    expect(qualifyingRanking(getState(), EVT, ini.id).every((r) => r.runsDone === 4)).toBe(true)
    expect(actions.generateFinal(EVT, ini.id).ok).toBe(true)
    expect(actions.generateFinal(EVT, ini.id).ok).toBe(false)
    while (pendingRuns().length) actions.recordRun(pendingRuns()[0].id, { time: 40 })
    expect(finalRanking(getState(), EVT, ini.id)[0].position).toBe(1)
    expect(actions.homologate(EVT, ini.id).ok).toBe(true)
    const done = getState().runs.find((r) => r.eventId === EVT && r.categoryId === ini.id && r.status === 'done')
    expect(actions.correctRun(done.id, { time: 1 }, 'x').ok).toBe(false)
    expect(actions.homologate(EVT, ini.id, false, '').ok).toBe(false)
    expect(actions.homologate(EVT, ini.id, false, 'Recurso aceito').ok).toBe(true)
  })

  it('cancelar trio devolve crédito e substituir reabre a confirmação', () => {
    expect(actions.cancelRegistration('reg_evt_demo_1', '').ok).toBe(false)
    expect(actions.cancelRegistration('reg_evt_demo_1', 'Cavalo lesionado').ok).toBe(true)
    // José tinha dois trios pagos; um caiu e o valor fica como crédito.
    expect(competitorAccount(getState(), EVT, 'cmp_jose').credit).toBe(350)

    const cpfOf = (id) => getState().competitors.find((c) => c.id === id).cpf
    const m = getState().registrationMembers.find((x) => x.registrationId === 'reg_evt_demo_2' && x.competitorId === 'cmp_lucas')
    expect(actions.substituteMember(m.id, { cpf: cpfOf('cmp_diego') }, 'Troca').ok).toBe(false)
    expect(actions.substituteMember(m.id, { cpf: cpfOf('cmp_kleber') }, 'Troca').ok).toBe(true)
    expect(getState().registrations.find((r) => r.id === 'reg_evt_demo_2').status).toBe('awaiting_confirmation')
  })

  it('importação CONTEP atualiza handicap e guarda histórico', () => {
    const res = actions.applyContepImport([
      { apply: true, name: 'Arthur Xavier', cpf: '', contepCode: 'D1278', handicap: 2, match: { id: 'cmp_arthur' } },
      { apply: true, name: 'Alguém Novo', cpf: '', contepCode: 'Z0001', handicap: 3, match: null }
    ], { fileName: 'base.xlsx', year: 2026 })
    expect(res).toMatchObject({ ok: true, updated: 1, added: 1 })
    expect(getState().competitors.find((c) => c.id === 'cmp_arthur').handicap).toBe(2)
    expect(getState().contep.imports[0].fileName).toBe('base.xlsx')
  })

  it('duplica evento a partir de outro', () => {
    const res = actions.createEvent({ name: '9ª Etapa', date: '2026-11-10' }, EVT)
    expect(getState().categories.filter((c) => c.eventId === res.eventId).map((c) => c.name)).toEqual(['SOMA 11', 'SOMA 03', 'INICIANTE'])
    expect(getState().events.find((e) => e.id === res.eventId).slug).toBe('9-etapa')
  })
})

describe('regras novas do circuito', () => {
  beforeEach(() => {
    actions.reset()
    actions.setOperator('Mesa 1')
  })

  it('balcão lança trio já aceito, sem CPF, várias vezes', () => {
    const res = actions.createRegistration({
      eventId: EVT,
      categoryId: cat('SOMA 11').id,
      byOrganization: true,
      copies: 2,
      people: [{ competitorId: 'cmp_bruno' }, { competitorId: 'cmp_igor' }, { name: 'TIKIM', handicap: 2 }]
    })
    expect(res.ok).toBe(true)
    expect(res.registrationIds).toHaveLength(2)
    const tikim = getState().competitors.filter((c) => c.name === 'TIKIM')
    expect(tikim).toHaveLength(1)
    res.registrationIds.forEach((id) => {
      const members = getState().registrationMembers.filter((m) => m.registrationId === id)
      expect(members.every((m) => m.confirmationStatus === 'accepted')).toBe(true)
      expect(members.map((m) => m.position)).toEqual([0, 1, 2])
    })
    // Limite de 2 trios iguais.
    expect(actions.createRegistration({ eventId: EVT, categoryId: cat('SOMA 11').id, byOrganization: true, people: [{ competitorId: 'cmp_bruno' }, { competitorId: 'cmp_igor' }, { competitorId: tikim[0].id }] }).ok).toBe(false)
  })

  it('tempo acima do limite vira SAT automaticamente', () => {
    actions.saveCategory(EVT, { ...cat('INICIANTE'), timeLimit: 60 })
    actions.generateSchedule(EVT)
    const run = pendingRuns().find((r) => r.categoryId === cat('INICIANTE').id)
    const res = actions.recordRun(run.id, { time: '61,2' })
    expect(res.autoSat).toBe(true)
    const saved = getState().runs.find((r) => r.id === run.id)
    expect(saved.occurrence).toBe('SAT')
    expect(saved.note).toMatch(/acima do limite/)
  })

  it('boi sorteado na hora pela mesa', () => {
    const event = getState().events.find((e) => e.id === EVT)
    actions.updateEvent(EVT, { cattle: { ...event.cattle, mode: 'live' } })
    actions.generateSchedule(EVT)
    const run = pendingRuns()[0]
    expect(run.cattle).toBeNull()
    const res = actions.drawCattleNow(run.id)
    expect(res.ok).toBe(true)
    expect(getState().runs.find((r) => r.id === run.id).cattle).toBe(res.cattle)
    expect(actions.drawCattleNow(run.id).ok).toBe(false)
  })

  it('categoria com idade e sexo exige os dados e barra quem não cabe', () => {
    const res = actions.saveCategory(EVT, { name: 'MIRIM', maxHandicap: 11, qualifyingRuns: 2, bestTimesCount: 1, finalistsCount: 3, finalRuns: 1, maxAge: 13, maxAgeSum: 36 })
    expect(res.ok).toBe(true)
    const mirim = cat('MIRIM')
    const year = Number(getState().events.find((e) => e.id === EVT).date.slice(0, 4))
    const kid = (name, age, base) => ({ name, cpf: makeCpf(base), phone: '34900000000', birthDate: `${year - age}-01-01` })
    const tooOld = actions.createRegistration({ eventId: EVT, categoryId: mirim.id, byOrganization: true, people: [kid('A', 12, '100200300'), kid('B', 12, '100200301'), kid('C', 14, '100200302')] })
    expect(tooOld.ok).toBe(false)
    expect(tooOld.errors.join()).toMatch(/até 13/)
    const sumHigh = actions.createRegistration({ eventId: EVT, categoryId: mirim.id, byOrganization: true, people: [kid('A', 13, '100200300'), kid('B', 13, '100200301'), kid('C', 12, '100200302')] })
    expect(sumHigh.errors.join()).toMatch(/soma das idades do trio é 38/)
    expect(actions.createRegistration({ eventId: EVT, categoryId: mirim.id, byOrganization: true, people: [kid('A', 12, '100200300'), kid('B', 11, '100200301'), kid('C', 10, '100200302')] }).ok).toBe(true)

    actions.saveCategory(EVT, { name: 'FEMININA', maxHandicap: 11, qualifyingRuns: 2, bestTimesCount: 1, finalistsCount: 3, finalRuns: 1, gender: 'F' })
    const fem = actions.createRegistration({ eventId: EVT, categoryId: cat('FEMININA').id, byOrganization: true, people: [{ competitorId: 'cmp_maria' }, { competitorId: 'cmp_carla' }, { competitorId: 'cmp_lucas' }] })
    expect(fem.errors.join()).toMatch(/Informe o sexo/)
  })

  it('desempate em pista decide a ordem dos empatados', () => {
    const ini = cat('INICIANTE')
    actions.saveCategory(EVT, { ...ini, tiebreak: 'runoff' })
    actions.generateSchedule(EVT)
    // Todos os trios da Iniciante fazem os mesmos tempos.
    pendingRuns().forEach((r) => actions.recordRun(r.id, { time: r.categoryId === ini.id ? 40 : 45 + r.number / 100 }))
    let rows = qualifyingRanking(getState(), EVT, ini.id)
    expect(rows[0].position).toBe(1)
    expect(rows[1].position).toBe(1)
    const tied = rows.filter((r) => r.position === 1).map((r) => r.registration.id)
    expect(actions.createRunoff(EVT, ini.id, 'qualifying', tied).ok).toBe(true)
    const runoffs = getState().runs.filter((r) => r.stage === 'runoff')
    expect(runoffs).toHaveLength(tied.length)
    runoffs.forEach((r, i) => actions.recordRun(r.id, { time: 30 + i }))
    rows = qualifyingRanking(getState(), EVT, ini.id)
    expect(rows.map((r) => r.position).slice(0, 2)).toEqual([1, 2])
    expect(rows[0].registration.id).toBe(runoffs[0].registrationId)
  })

  it('premiação por percentual do arrecadado, dividida no empate', () => {
    const ini = cat('INICIANTE')
    actions.saveCategory(EVT, { ...ini, tiebreak: 'shared', prize: { mode: 'percent', percent: 60, split: '50, 30, 20' } })
    const table = prizeTable(getState(), EVT, ini.id)
    const confirmed = getState().registrations.filter((r) => r.eventId === EVT && r.categoryId === ini.id && r.status === 'confirmed').length
    expect(table.collected).toBe(confirmed * 3 * 350)
    expect(table.pool).toBe(Math.round(confirmed * 1050 * 0.6 * 100) / 100)
    const fake = [
      { registration: { id: 'a' }, position: 1 },
      { registration: { id: 'b' }, position: 1 },
      { registration: { id: 'c' }, position: 3 }
    ]
    const prize = prizeByRegistration(fake, table)
    expect(prize.a).toBe(Math.round(table.pool * 0.4 * 100) / 100)
    expect(prize.c).toBe(table.places[2].amount)
  })
})

describe('exclusão de evento', () => {
  beforeEach(() => actions.reset())
  it('pede o nome e apaga tudo do evento, menos os competidores', () => {
    const before = getState().competitors.length
    expect(actions.deleteEvent(EVT, 'outro nome').ok).toBe(false)
    const name = getState().events.find((e) => e.id === EVT).name
    expect(actions.deleteEvent(EVT, name).ok).toBe(true)
    const s = getState()
    expect(s.events.some((e) => e.id === EVT)).toBe(false)
    expect(s.registrations.some((r) => r.eventId === EVT)).toBe(false)
    expect(s.payments.some((p) => p.eventId === EVT)).toBe(false)
    expect(s.competitors.length).toBe(before)
  })
})
