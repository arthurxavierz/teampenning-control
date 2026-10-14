import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, LogOut } from 'lucide-react'
import { Button, CattleBrand, Empty, Errors, Field, Gallop, Horseshoe, StatusBadge, Tabs, useRun } from '../../components/UI'
import { mode, useStore } from '../../lib/store'
import { buildPixPayload } from '../../lib/pix'
import { competitorAccount } from '../../lib/finance'
import { membersOf } from '../../lib/rules'
import { effectiveTime, qualifyingRanking } from '../../lib/ranking'
import { DEMO_LOGIN } from '../../lib/seed'
import { cleanCpf, dateBr, dateTime, formatCpf, money, runStageLabel, time, trioLabel } from '../../lib/utils'

function Login() {
  const { actions } = useStore()
  const [cpf, setCpf] = useState('')
  const [phone, setPhone] = useState('')
  const [errors, setErrors] = useState([])
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    const res = await actions.loginCompetitor(cpf, phone)
    setBusy(false)
    if (res.ok === false) setErrors(res.errors)
  }
  return (
    <section className="section narrow">
      <div className="login-card">
        <Gallop still />
        <span className="eyebrow">Área do competidor</span>
        <h1 className="page-title">Minha prova</h1>
        <p>Convites, trios, saldo e passadas em um lugar só. Entre com o CPF e os quatro últimos dígitos do telefone do cadastro.</p>
        <form onSubmit={submit} className="stack">
          <Field label="CPF"><input inputMode="numeric" value={formatCpf(cpf)} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" autoComplete="off" /></Field>
          <Field label="Final do telefone"><input inputMode="numeric" maxLength={4} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} placeholder="0000" /></Field>
          <Errors list={errors} />
          <Button type="submit" size="lg" disabled={busy}>{busy ? 'Entrando' : 'Entrar'}</Button>
        </form>
        {mode === 'local' && <div className="demo-hint">
          <b>Demonstração</b>
          <span>CPF {formatCpf(DEMO_LOGIN.cpf)} com final {DEMO_LOGIN.phone.slice(-4)}</span>
          <button className="link" onClick={() => { setCpf(DEMO_LOGIN.cpf); setPhone(DEMO_LOGIN.phone.slice(-4)) }}>Preencher</button>
        </div>}
      </div>
    </section>
  )
}

function Payment({ event, competitor, account }) {
  const { actions } = useStore()
  const run = useRun()
  const [note, setNote] = useState('')
  const pix = account.balance > 0
    ? buildPixPayload({ key: event.pix?.key, name: event.pix?.name, city: event.pix?.city, amount: account.balance, txid: `TP${cleanCpf(competitor.cpf).slice(-6)}` })
    : ''
  const reported = account.reported[0]
  return (
    <aside className="pay-card">
      <span className="eyebrow">Financeiro do evento</span>
      <strong className="balance">{money(account.balance)}</strong>
      <p>{account.pendingCount} {account.pendingCount === 1 ? 'participação aguardando' : 'participações aguardando'} pagamento. {account.paidCount} quitada{account.paidCount === 1 ? '' : 's'}.</p>
      {account.credit > 0 && <div className="notice notice-ok small">Crédito de {money(account.credit)} no evento. Ele quita automaticamente a próxima participação aceita.</div>}
      {account.balance > 0 && event.pix?.key ? (
        <>
          <div className="qr"><QRCodeSVG value={pix} size={176} bgColor="#ffffff" fgColor="#17150f" /></div>
          <Field label="Pix Copia e Cola"><textarea readOnly rows={3} value={pix} onFocus={(e) => e.target.select()} /></Field>
          <Button variant="ghost" onClick={() => { navigator.clipboard?.writeText(pix); run({ ok: true }, 'Código Pix copiado.') }}><Copy size={15} /> Copiar código</Button>
          {reported ? (
            <div className="notice notice-info small">Você informou {money(reported.amount)} em {dateTime(reported.createdAt)}. A organização vai conferir e dar a baixa.</div>
          ) : (
            <>
              <Field label="Observação para a organização"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional. Ex.: pago da conta de outra pessoa" /></Field>
              <Button onClick={() => run(actions.reportPayment({ eventId: event.id, competitorId: competitor.id, amount: account.balance, note }), 'Pagamento informado. Aguarde a conferência.')}>Já paguei</Button>
            </>
          )}
          <small className="muted">A confirmação é manual. O trio só fica confirmado quando os três estão pagos.</small>
        </>
      ) : account.balance > 0 ? (
        <div className="notice notice-info small">A organização ainda não configurou a chave Pix deste evento.</div>
      ) : (
        <div className="paid-box"><Horseshoe size={16} /> Nada pendente neste evento.</div>
      )}
      {account.payments.some((p) => p.status === 'rejected') && (
        <div className="notice notice-error small">Um pagamento informado não foi localizado pela organização. Fale com a secretaria da prova.</div>
      )}
    </aside>
  )
}

export default function MyArea() {
  const { state, session, actions } = useStore()
  const run = useRun()
  const competitor = state.competitors.find((c) => c.id === session.competitorId)
  const myEvents = useMemo(() => {
    if (!competitor) return []
    const ids = new Set(
      state.registrationMembers.filter((m) => m.competitorId === competitor.id).map((m) => state.registrations.find((r) => r.id === m.registrationId)?.eventId)
    )
    return state.events.filter((e) => ids.has(e.id)).sort((a, b) => b.date.localeCompare(a.date))
  }, [state, competitor])
  const [eventId, setEventId] = useState(null)
  const [tab, setTab] = useState('trios')

  if (!competitor) return <Login />

  const event = state.events.find((e) => e.id === eventId) || myEvents.find((e) => e.active) || myEvents[0]
  if (!event) {
    return (
      <section className="section narrow">
        <Empty title={`Olá, ${competitor.nickname || competitor.name}`} description="Você ainda não tem inscrições." action={<Button variant="ghost" onClick={actions.logoutCompetitor}>Sair</Button>} />
      </section>
    )
  }

  const account = competitorAccount(state, event.id, competitor.id)
  const mine = state.registrationMembers
    .filter((m) => m.competitorId === competitor.id)
    .map((member) => ({ member, reg: state.registrations.find((r) => r.id === member.registrationId) }))
    .filter(({ reg }) => reg?.eventId === event.id)
  const invites = mine.filter(({ member, reg }) => member.confirmationStatus === 'pending' && !['cancelled', 'declined'].includes(reg.status))
  const published = Boolean(event.schedule?.publishedAt)
  const myRuns = state.runs
    .filter((r) => r.eventId === event.id && mine.some(({ reg }) => reg.id === r.registrationId))
    .sort((a, b) => a.number - b.number)
  const trioOf = (regId) => trioLabel(membersOf(state, regId).map((m) => state.competitors.find((c) => c.id === m.competitorId)))
  const catOf = (id) => state.categories.find((c) => c.id === id)

  return (
    <section className="section my-area">
      <div className="profile-head">
        <div>
          <span className="eyebrow">Área do competidor</span>
          <h1 className="page-title">{competitor.name}</h1>
          <p>{competitor.contepCode ? `CONTEP ${competitor.contepCode}` : 'Sem código CONTEP'} · Handicap {competitor.handicap}{competitor.handicapSource === 'declared' ? ' (declarado, aguardando conferência)' : ''}</p>
        </div>
        <div className="profile-actions">
          {myEvents.length > 1 && (
            <select value={event.id} onChange={(e) => setEventId(e.target.value)} aria-label="Evento">
              {myEvents.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          )}
          <Button variant="ghost" onClick={actions.logoutCompetitor}><LogOut size={15} /> Sair</Button>
        </div>
      </div>

      {invites.length > 0 && (
        <div className="invites">
          {invites.map(({ member, reg }) => (
            <div key={member.id} className="invite">
              <Horseshoe size={18} />
              <div>
                <small>CONVITE · {catOf(reg.categoryId)?.name}</small>
                <b>{trioOf(reg.id)}</b>
                <span>Criado por {state.competitors.find((c) => c.id === reg.createdByCompetitorId)?.name}. Ao aceitar, {money(member.price ?? event.registrationPrice)} entra no seu saldo.</span>
              </div>
              <div className="invite-actions">
                <Button size="sm" onClick={() => run(actions.respondInvite(member.id, 'accepted'), 'Participação confirmada.')}>Aceitar</Button>
                <Button size="sm" variant="ghost" onClick={() => run(actions.respondInvite(member.id, 'declined'), 'Convite recusado.')}>Recusar</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="my-grid">
        <div>
          <Tabs
            value={tab}
            onChange={setTab}
            items={[['trios', 'Meus trios', mine.length], ['passadas', 'Passadas', published ? myRuns.length : null], ['historico', 'Histórico']]}
          />

          {tab === 'trios' && (
            <div className="stack">
              {mine.map(({ member, reg }) => (
                <article key={member.id} className="team-card">
                  <div>
                    <StatusBadge status={reg.status} />
                    <strong>{trioOf(reg.id)}</strong>
                    <span>{catOf(reg.categoryId)?.name} · soma {membersOf(state, reg.id).reduce((s, m) => s + Number(m.handicapSnapshot || 0), 0)}</span>
                  </div>
                  <div className="team-state">
                    {membersOf(state, reg.id).map((m) => {
                      const c = state.competitors.find((x) => x.id === m.competitorId)
                      return (
                        <span key={m.id} className={m.competitorId === competitor.id ? 'me' : ''}>
                          {c?.nickname || c?.name}
                          <i className={m.confirmationStatus === 'accepted' ? 'ok' : m.confirmationStatus === 'declined' ? 'bad' : ''} title="Aceite" />
                          <i className={m.paymentStatus === 'paid' ? 'ok' : ''} title="Pagamento" />
                        </span>
                      )
                    })}
                  </div>
                </article>
              ))}
              <p className="muted small">Bolinhas: aceite e pagamento de cada integrante.</p>
            </div>
          )}

          {tab === 'passadas' && (
            !published ? <Empty title="Ordem ainda não publicada" description="Suas passadas aparecem aqui quando a organização publicar a montagem." /> : (
              <div className="order-list">
                {myRuns.map((r) => {
                  const t = effectiveTime(r, event)
                  return (
                    <div key={r.id} className={`order-row ${r.status === 'done' ? 'is-done' : ''}`}>
                      <span className="order-n">{r.number}</span>
                      <span className="order-trio"><b>{trioOf(r.registrationId)}</b><small>{catOf(r.categoryId)?.name} · {runStageLabel(r)}</small></span>
                      <CattleBrand value={r.cattle} size="sm" />
                      <span className="order-time">{r.status === 'done' ? (t == null ? r.occurrence || 'Sem tempo' : time(t)) : 'Aguardando'}</span>
                    </div>
                  )
                })}
              </div>
            )
          )}

          {tab === 'historico' && (
            <div className="stack">
              {myEvents.map((e) => {
                const regs = state.registrationMembers
                  .filter((m) => m.competitorId === competitor.id)
                  .map((m) => state.registrations.find((r) => r.id === m.registrationId))
                  .filter((r) => r?.eventId === e.id && r.status === 'confirmed')
                const best = regs
                  .map((r) => qualifyingRanking(state, e.id, r.categoryId).find((row) => row.registration.id === r.id))
                  .filter((row) => row?.position)
                  .sort((a, b) => a.position - b.position)[0]
                return (
                  <div key={e.id} className="history-row">
                    <div><b>{e.name}</b><small>{dateBr(e.date)}</small></div>
                    <span>{regs.length} trio{regs.length === 1 ? '' : 's'}</span>
                    <span>{best ? `Melhor: ${best.position}º na ${catOf(best.registration.categoryId)?.name}` : 'Sem classificação'}</span>
                    <Link to={`/eventos/${e.slug}/resultados`} className="link">Resultados</Link>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <Payment event={event} competitor={competitor} account={account} />
      </div>
    </section>
  )
}
