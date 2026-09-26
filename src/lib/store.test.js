import { beforeEach, describe, expect, it } from 'vitest'
import { actions, getState } from './store.jsx'
import { competitorAccount } from './finance.js'
import { finalRanking, qualifyingRanking } from './ranking.js'
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
