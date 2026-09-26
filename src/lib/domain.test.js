import { describe, expect, it } from 'vitest'
import { createSeed } from './seed.js'
import { allocatePayments, competitorAccount } from './finance.js'
import { recomputeRegistrationStatus, validateRegistration } from './rules.js'
import { analyzeSchedule, buildSchedule } from './schedule.js'
import { effectiveTime, finalRanking, qualifyingRanking, timeToLead, timeToQualify } from './ranking.js'
import { buildContepPreview, guessMapping, parseHandicap } from './contep.js'
import { buildPixPayload } from './pix.js'
import { isValidCpf, makeCpf } from './utils.js'

const TODAY = '2026-09-25'
const seed = () => createSeed(TODAY)
const catByName = (s, eventId, name) => s.categories.find((c) => c.eventId === eventId && c.name === name)
const trio = (...keys) => keys.map((k) => ({ competitorId: `cmp_${k}` }))

describe('CPF', () => {
  it('valida dígitos verificadores', () => {
    expect(isValidCpf(makeCpf('111222333'))).toBe(true)
    expect(isValidCpf('11111111111')).toBe(false)
    expect(isValidCpf('11122233344')).toBe(false)
  })
})

describe('inscrição', () => {
  const base = (s, cat, people, extra = {}) =>
    validateRegistration(s, { eventId: 'evt_demo', categoryId: cat.id, termsAccepted: true, today: TODAY, people, ...extra })

  it('usa o handicap da base e ignora o digitado', () => {
    const s = seed()
    const errors = base(s, catByName(s, 'evt_demo', 'INICIANTE'), [{ competitorId: 'cmp_diego', handicap: 0 }, ...trio('lucas', 'carla')])
    expect(errors.join()).toMatch(/soma de handicap/)
  })

  it('bloqueia trio repetido', () => {
    const s = seed()
    expect(base(s, catByName(s, 'evt_demo', 'SOMA 03'), trio('maria', 'jose', 'arthur')).join()).toMatch(/já está inscrito/)
  })

  it('respeita o prazo de inscrição', () => {
    const s = seed()
    expect(base(s, catByName(s, 'evt_demo', 'SOMA 03'), trio('nicolas', 'lucas', 'carla'), { today: '2030-01-01' })).toEqual(['O prazo de inscrição terminou.'])
  })

  it('exige aceite do regulamento', () => {
    const s = seed()
    expect(base(s, catByName(s, 'evt_demo', 'INICIANTE'), trio('kleber', 'lucas', 'larissa'), { termsAccepted: false }).join()).toMatch(/regulamento/)
  })

  it('pega o handicap da base CONTEP para quem ainda não tem cadastro', () => {
    const s = seed()
    s.contep.records.push({ contepCode: 'X0001', name: 'Novo Competidor', cpf: '', handicap: 4 })
    const people = [{ cpf: makeCpf('999888777'), name: 'Novo Competidor', contepCode: 'X0001', handicap: 0 }, ...trio('lucas', 'carla')]
    expect(base(s, catByName(s, 'evt_demo', 'SOMA 03'), people).join()).toMatch(/soma de handicap deste trio é 4/)
  })
})

describe('financeiro', () => {
  it('cobra só as participações aceitas', () => {
    const acc = competitorAccount(seed(), 'evt_demo', 'cmp_arthur')
    expect(acc.accepted).toBe(3)
    expect(acc.paid).toBe(350)
    expect(acc.balance).toBe(700)
    expect(acc.reported).toHaveLength(1)
  })

  it('trio que cai devolve o valor como crédito e quita a próxima participação', () => {
    const s = seed()
    s.registrations.find((r) => r.id === 'reg_evt_demo_1').status = 'cancelled'
    allocatePayments(s, 'evt_demo', 'cmp_arthur')
    const next = s.registrationMembers.find((m) => m.registrationId === 'reg_evt_demo_11' && m.competitorId === 'cmp_arthur')
    expect(next.paymentStatus).toBe('paid')
  })

  it('aceitar convite antigo não reabre participação já quitada', () => {
    const s = seed()
    s.payments.push({ id: 'x', eventId: 'evt_demo', competitorId: 'cmp_arthur', amount: 350, status: 'confirmed' })
    allocatePayments(s, 'evt_demo', 'cmp_arthur')
    const paid = s.registrationMembers.filter((m) => m.competitorId === 'cmp_arthur' && m.paymentStatus === 'paid').map((m) => m.id)
    s.registrationMembers.find((m) => m.registrationId === 'reg_evt_demo_12' && m.competitorId === 'cmp_arthur').confirmationStatus = 'accepted'
    allocatePayments(s, 'evt_demo', 'cmp_arthur')
    paid.forEach((id) => expect(s.registrationMembers.find((m) => m.id === id).paymentStatus).toBe('paid'))
  })

  it('trio só confirma com três aceites e três pagamentos', () => {
    const s = seed()
    recomputeRegistrationStatus(s, 'reg_evt_demo_11')
    expect(s.registrations.find((r) => r.id === 'reg_evt_demo_11').status).toBe('awaiting_payment')
  })
})

describe('montagem', () => {
  it('é reproduzível pela semente', () => {
    const s = seed()
    const key = (runs) => runs.map((r) => `${r.registrationId}:${r.cattle}`)
    expect(key(buildSchedule(s, 'evt_demo', { seed: 123 }))).toEqual(key(buildSchedule(s, 'evt_demo', { seed: 123 })))
  })

  it('usa só trios confirmados e respeita as passadas da categoria', () => {
    const s = seed()
    const runs = buildSchedule(s, 'evt_demo', { seed: 5 })
    const confirmed = s.registrations.filter((r) => r.eventId === 'evt_demo' && r.status === 'confirmed')
    expect(runs).toHaveLength(confirmed.length * 4)
    runs.forEach((run) => expect(confirmed.some((r) => r.id === run.registrationId)).toBe(true))
  })

  it('nunca coloca o mesmo competidor em passadas seguidas quando dá para evitar', () => {
    const s = seed()
    expect(analyzeSchedule(s, buildSchedule(s, 'evt_demo', { seed: 9 }), 0)).toHaveLength(0)
  })
})

describe('ranking', () => {
  const setup = () => {
    const s = seed()
    const cat = catByName(s, 'evt_demo', 'INICIANTE')
    cat.finalistsCount = 1
    const regs = s.registrations.filter((r) => r.categoryId === cat.id && r.status === 'confirmed')
    s.runs = []
    let n = 1
    const add = (reg, stage, time, occurrence = null, status = 'done') =>
      s.runs.push({ id: `r${n}`, eventId: 'evt_demo', registrationId: reg.id, categoryId: cat.id, stage, number: n++, status, time, occurrence })
    return { s, cat, regs, add }
  }

  it('soma os melhores tempos e aplica penalidade', () => {
    const { s, cat, regs, add } = setup()
    add(regs[0], 'qualifying', 40, 'P5')
    add(regs[0], 'qualifying', 42)
    add(regs[0], 'qualifying', null, 'SAT')
    const row = qualifyingRanking(s, 'evt_demo', cat.id).find((r) => r.registration.id === regs[0].id)
    expect(row.counted).toEqual([42, 45])
    expect(row.score).toBe(87)
  })

  it('desempata pelo melhor tempo individual', () => {
    const { s, cat, regs, add } = setup()
    add(regs[0], 'qualifying', 40); add(regs[0], 'qualifying', 50)
    add(regs[1], 'qualifying', 45); add(regs[1], 'qualifying', 45)
    const rows = qualifyingRanking(s, 'evt_demo', cat.id)
    expect(rows[0].registration.id).toBe(regs[0].id)
    expect(rows[1].position).toBe(2)
  })

  it('empate mantido divide a posição', () => {
    const { s, cat, regs, add } = setup()
    cat.tiebreak = 'shared'
    add(regs[0], 'qualifying', 40); add(regs[0], 'qualifying', 50)
    add(regs[1], 'qualifying', 45); add(regs[1], 'qualifying', 45)
    const rows = qualifyingRanking(s, 'evt_demo', cat.id)
    expect([rows[0].position, rows[1].position]).toEqual([1, 1])
  })

  it('SAT não conta como tempo', () => {
    const s = seed()
    expect(effectiveTime({ status: 'done', time: 30, occurrence: 'SAT' }, s.events[1])).toBeNull()
  })

  it('calcula o tempo para entrar no corte da final', () => {
    const { s, cat, regs, add } = setup()
    add(regs[0], 'qualifying', 40); add(regs[0], 'qualifying', 41)
    add(regs[1], 'qualifying', 44)
    // Corte de 1 vaga ocupado com 81. O trio 2 tem 44 e precisa de menos de 37.
    expect(timeToQualify(s, 'evt_demo', cat.id, regs[1].id)).toEqual({ status: 'need', time: 37 })
    expect(timeToQualify(s, 'evt_demo', cat.id, regs[0].id)).toEqual({ status: 'in' })
    cat.finalistsCount = 3
    expect(timeToQualify(s, 'evt_demo', cat.id, regs[1].id)).toEqual({ status: 'open' })
  })

  it('calcula a final com carregamento e o tempo para liderar', () => {
    const { s, cat, regs, add } = setup()
    add(regs[0], 'qualifying', 40); add(regs[0], 'qualifying', 41)
    add(regs[1], 'qualifying', 44); add(regs[1], 'qualifying', 45)
    add(regs[0], 'final', 39)
    add(regs[1], 'final', null, null, 'pending')
    expect(finalRanking(s, 'evt_demo', cat.id)[0].total).toBe(120)
    expect(timeToLead(s, 'evt_demo', cat.id, regs[1].id)).toBe(31)
  })
})

describe('CONTEP', () => {
  it('não zera handicap com célula vazia e aceita vírgula', () => {
    expect(parseHandicap('')).toBeNull()
    expect(parseHandicap('1,5')).toBe(1.5)
  })

  it('mapeia colunas e aponta conflitos', () => {
    const s = seed()
    const mapping = guessMapping(['Nome do Competidor', 'CPF', 'Código', 'Handicap'])
    expect(mapping).toEqual({ name: 'Nome do Competidor', cpf: 'CPF', contepCode: 'Código', handicap: 'Handicap' })
    const preview = buildContepPreview(s, [
      { 'Nome do Competidor': 'Arthur Xavier', CPF: '', Código: 'D1278', Handicap: '2' },
      { 'Nome do Competidor': 'Outra Pessoa', CPF: '', Código: 'E0182', Handicap: '1' },
      { 'Nome do Competidor': 'Nova Pessoa', CPF: '', Código: 'Z9999', Handicap: '' }
    ], mapping)
    expect(preview[0].status).toBe('update')
    expect(preview[0].changes.handicap).toEqual([1, 2])
    expect(preview[1].status).toBe('conflict')
    expect(preview[2].issues).toContain('Sem handicap')
  })
})

describe('Pix', () => {
  it('gera payload com valor e CRC', () => {
    const p = buildPixPayload({ key: '34999999999', name: 'CTM EVENTOS', city: 'UBERLANDIA', amount: 700, txid: 'TP123' })
    expect(p.startsWith('000201')).toBe(true)
    expect(p).toMatch(/5406700\.00/)
    expect(p).toMatch(/6304[0-9A-F]{4}$/)
  })
})
