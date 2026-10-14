import { describe, expect, it } from 'vitest'
import { createSeed, DEMO_LOGIN } from './seed.js'
import { competitorSlice, MAX_FAILURES, runPortal, signToken, verifyToken } from './portal.js'
import { diffState, fromRow, TABLE_BY_NAME, toRow } from './cloud/schema.js'
import { makeCpf } from './utils.js'

const TODAY = new Date().toISOString().slice(0, 10)
const secret = 'segredo-de-teste'
const seed = () => createSeed(TODAY)
const login = (state) => runPortal(state, { op: 'login', cpf: DEMO_LOGIN.cpf, phoneEnd: DEMO_LOGIN.phone.slice(-4) }, { secret })

describe('portal do competidor', () => {
  it('entra com CPF e final do celular e devolve só a parte dele', () => {
    const s = seed()
    const res = login(s)
    expect(res.status).toBe(200)
    expect(res.attempt).toEqual({ cpf: DEMO_LOGIN.cpf, ok: true })
    const slice = res.body.slice
    expect(slice.competitorId).toBe('cmp_arthur')
    expect(slice.payments.every((p) => p.competitorId === 'cmp_arthur')).toBe(true)
    // Os parceiros aparecem sem CPF nem telefone.
    const partner = slice.competitors.find((c) => c.id !== 'cmp_arthur')
    expect(partner.cpf).toBeUndefined()
    expect(partner.phone).toBeUndefined()
    expect(slice.competitors.find((c) => c.id === 'cmp_arthur').cpf).toBe(DEMO_LOGIN.cpf)
  })

  it('recusa dígitos errados e bloqueia depois de muitas tentativas', () => {
    const s = seed()
    const wrong = runPortal(s, { op: 'login', cpf: DEMO_LOGIN.cpf, phoneEnd: '9999' }, { secret })
    expect(wrong.status).toBe(401)
    expect(wrong.attempt.ok).toBe(false)
    const blocked = runPortal(s, { op: 'login', cpf: DEMO_LOGIN.cpf, phoneEnd: DEMO_LOGIN.phone.slice(-4) }, { secret, recentFailures: MAX_FAILURES })
    expect(blocked.status).toBe(429)
  })

  it('token assinado expira e não aceita adulteração', () => {
    const t = signToken({ c: 'cmp_x', exp: 2000 }, secret)
    expect(verifyToken(t, secret, 1000).c).toBe('cmp_x')
    expect(verifyToken(t, secret, 3000)).toBeNull()
    expect(verifyToken(t, 'outro', 1000)).toBeNull()
    const [body, sig] = t.split('.')
    const forged = Buffer.from(JSON.stringify({ c: 'cmp_y', exp: 2000 })).toString('base64url')
    expect(verifyToken(`${forged}.${sig}`, secret, 1000)).toBeNull()
    expect(body).toBeTruthy()
  })

  it('aceita convite só do próprio competidor', () => {
    const s = seed()
    const token = login(s).body.token
    const mine = s.registrationMembers.find((m) => m.registrationId === 'reg_evt_demo_12' && m.competitorId === 'cmp_arthur')
    const other = s.registrationMembers.find((m) => m.registrationId === 'reg_evt_demo_13' && m.competitorId === 'cmp_fernanda')
    expect(runPortal(s, { op: 'respond', token, memberId: other.id, status: 'accepted' }, { secret }).status).toBe(422)
    const res = runPortal(s, { op: 'respond', token, memberId: mine.id, status: 'accepted' }, { secret })
    expect(res.status).toBe(200)
    expect(res.next.registrationMembers.find((m) => m.id === mine.id).confirmationStatus).toBe('accepted')
    // O que muda vira operação de banco.
    const ops = diffState(s, res.next)
    expect(ops.find((o) => o.table === 'registration_members').items.map((m) => m.id)).toContain(mine.id)
    expect(ops.find((o) => o.table === 'audit_log').items).toHaveLength(1)
  })

  it('informa pagamento só em evento em que está inscrito', () => {
    const s = seed()
    const token = login(s).body.token
    expect(runPortal(s, { op: 'report', token, eventId: 'evt_past_nao', amount: 350 }, { secret }).status).toBe(403)
    const res = runPortal(s, { op: 'report', token, eventId: 'evt_demo', amount: 700, note: 'Pix' }, { secret })
    expect(res.status).toBe(200)
    expect(res.body.slice.payments.some((p) => p.status === 'reported' && p.amount === 700)).toBe(true)
  })

  it('inscreve trio pelo site com as mesmas regras do painel', () => {
    const s = seed()
    const cat = s.categories.find((c) => c.eventId === 'evt_demo' && c.name === 'INICIANTE')
    const people = [{ competitorId: 'cmp_kleber' }, { competitorId: 'cmp_larissa' }, { name: 'Peão Novo', cpf: makeCpf('246813579'), phone: '34911112222' }]
    const missingTerms = runPortal(s, { op: 'register', payload: { eventId: 'evt_demo', categoryId: cat.id, people, termsAccepted: false } }, { secret })
    expect(missingTerms.status).toBe(422)
    const res = runPortal(s, { op: 'register', payload: { eventId: 'evt_demo', categoryId: cat.id, people, termsAccepted: true } }, { secret })
    expect(res.status).toBe(200)
    expect(res.next.registrations.find((r) => r.id === res.body.registrationId).channel).toBe('site')
    expect(res.next.competitors.find((c) => c.name === 'Peão Novo').handicapSource).toBe('declared')
  })

  it('sem token válido pede para entrar de novo', () => {
    const res = runPortal(seed(), { op: 'me', token: 'lixo' }, { secret })
    expect(res.status).toBe(401)
    expect(res.body.expired).toBe(true)
  })

  it('a fatia não traz trios de outras pessoas', () => {
    const s = seed()
    const slice = competitorSlice(s, 'cmp_kleber')
    expect(slice.registrations.every((r) => slice.registrationMembers.some((m) => m.registrationId === r.id && m.competitorId === 'cmp_kleber'))).toBe(true)
  })
})

describe('mapeamento das tabelas', () => {
  it('ida e volta preserva os campos, com os desconhecidos em extra', () => {
    const s = seed()
    const run = { ...s.runs[0], updatedBy: 'Mesa', penalty: 0 }
    const def = TABLE_BY_NAME.runs
    const row = toRow(def, run, 'org-uuid')
    expect(row.organization_id).toBe('org-uuid')
    expect(row.extra).toEqual({ updatedBy: 'Mesa', penalty: 0 })
    expect(fromRow(def, row)).toMatchObject({ id: run.id, number: run.number, status: run.status, updatedBy: 'Mesa' })
    const event = s.events[0]
    const back = fromRow(TABLE_BY_NAME.events, toRow(TABLE_BY_NAME.events, event, 'org'))
    expect(back.occurrences).toEqual(event.occurrences)
    expect(back.registrationPrice).toBe(event.registrationPrice)
  })

  it('o diff ordena gravações antes das exclusões', () => {
    const s = seed()
    const next = structuredClone(s)
    next.runs = next.runs.slice(1)
    next.events[0].name = 'Novo nome'
    const ops = diffState(s, next)
    expect(ops[0]).toMatchObject({ table: 'events', op: 'upsert' })
    expect(ops.at(-1)).toMatchObject({ table: 'runs', op: 'delete', ids: [s.runs[0].id] })
  })
})
