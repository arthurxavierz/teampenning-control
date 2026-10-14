import React, { useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ExternalLink, FileSpreadsheet, Plus, Search, UserX, Users } from 'lucide-react'
import CounterRegistration from './CounterRegistration'
import LegacyImport from './LegacyImport'
import TrioSlot, { blankSlot, categoryNeeds, slotToPerson } from '../../components/TrioSlot'
import { Button, Dots, Empty, Field, PageHeader, ReasonDialog, StatusBadge, Tabs, useRun } from '../../components/UI'
import { useStore } from '../../lib/store'
import { membersOf } from '../../lib/rules'
import { dateTime, maskCpf, normalize, trioLabel } from '../../lib/utils'

function Substitute({ member, onClose }) {
  const { state, actions } = useStore()
  const [slot, setSlot] = useState(blankSlot())
  const outgoing = state.competitors.find((c) => c.id === member.competitorId)
  const reg = state.registrations.find((r) => r.id === member.registrationId)
  const cat = state.categories.find((c) => c.id === reg?.categoryId)
  const inTrio = membersOf(state, member.registrationId).map((m) => m.competitorId)
  return (
    <ReasonDialog
      title={`Substituir ${outgoing?.name}`}
      description="Quem entra já fica com o aceite registrado pela organização. Se quem sai já pagou, o valor vira crédito dele no evento."
      confirmLabel="Substituir"
      onClose={onClose}
      onConfirm={(reason) => actions.substituteMember(member.id, { ...slotToPerson(slot), accepted: true }, reason)}
    >
      <TrioSlot index={0} counter needs={categoryNeeds(cat)} slot={slot} taken={inTrio} onChange={setSlot} />
    </ReasonDialog>
  )
}

export default function Registrations() {
  const { event } = useOutletContext()
  const { state, actions } = useStore()
  const run = useRun()
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState(null)
  const [cancelId, setCancelId] = useState(null)
  const [substitute, setSubstitute] = useState(null)
  const [counter, setCounter] = useState(false)
  const [legacy, setLegacy] = useState(false)
  const cats = state.categories.filter((c) => c.eventId === event.id)
  const all = state.registrations.filter((r) => r.eventId === event.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const number = Object.fromEntries(all.map((r, i) => [r.id, i + 1]))
  const count = (s) => all.filter((r) => r.status === s).length
  const comp = (id) => state.competitors.find((c) => c.id === id)

  const rows = all.filter((r) => {
    if (filter !== 'all' && r.status !== filter) return false
    if (!q) return true
    const names = membersOf(state, r.id).map((m) => `${comp(m.competitorId)?.name} ${comp(m.competitorId)?.cpf}`).join(' ')
    return normalize(names).includes(normalize(q))
  })
  const declared = all.filter((r) => r.status !== 'cancelled' && membersOf(state, r.id).some((m) => comp(m.competitorId)?.handicapSource === 'declared')).length

  return (
    <div className="page">
      <PageHeader
        eyebrow="Inscrições"
        title="Trios do evento"
        description="Cada trio depende do aceite e do pagamento dos três integrantes. Só trios confirmados entram na montagem."
        actions={(
          <>
            <a className="btn btn-ghost" href={`/eventos/${event.slug}/inscrever`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Formulário público</a>
            <Button variant="secondary" onClick={() => setLegacy(true)}><FileSpreadsheet size={15} /> Importar planilha</Button>
            <Button onClick={() => setCounter(true)}><Plus size={15} /> Lançar trio</Button>
          </>
        )}
      />
      {declared > 0 && <div className="notice notice-warn"><AlertTriangle size={16} /> {declared} trio{declared > 1 ? 's têm' : ' tem'} competidor com handicap declarado, sem registro na base CONTEP. Confira em <Link to="/admin/competidores">Competidores</Link>.</div>}

      <div className="toolbar">
        <Tabs
          value={filter}
          onChange={setFilter}
          items={[
            ['all', 'Todos', all.length],
            ['confirmed', 'Confirmados', count('confirmed')],
            ['awaiting_payment', 'Aguardando pagamento', count('awaiting_payment')],
            ['awaiting_confirmation', 'Aguardando aceite', count('awaiting_confirmation')],
            ['declined', 'Recusados', count('declined')],
            ['cancelled', 'Cancelados', count('cancelled')]
          ]}
        />
        <div className="search-input"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou CPF" /></div>
      </div>

      {!rows.length ? <Empty title="Nenhum trio aqui" description="Lance os trios pelo balcão ou compartilhe o formulário público de inscrição." action={<Button onClick={() => setCounter(true)}><Plus size={15} /> Lançar trio</Button>} /> : (
        <div className="table">
          <div className="thead reg-cols"><span>#</span><span>Trio</span><span>Categoria</span><span>Soma</span><span>Aceites</span><span>Pagos</span><span>Status</span></div>
          {rows.map((r) => {
            const ms = membersOf(state, r.id)
            const cat = cats.find((c) => c.id === r.categoryId)
            const sum = ms.reduce((s, m) => s + Number(m.handicapSnapshot || 0), 0)
            const open = openId === r.id
            return (
              <div key={r.id} className={`trow-wrap ${open ? 'open' : ''}`}>
                <button className="trow reg-cols" onClick={() => setOpenId(open ? null : r.id)} aria-expanded={open}>
                  <span className="mono">{String(number[r.id]).padStart(3, '0')}</span>
                  <span><b>{trioLabel(ms.map((m) => comp(m.competitorId)))}</b></span>
                  <span>{cat?.name}</span>
                  <span className={sum > cat?.maxHandicap ? 'bad' : ''}>{sum} / {cat?.maxHandicap}</span>
                  <Dots values={ms.map((m) => (m.confirmationStatus === 'accepted' ? 'ok' : m.confirmationStatus === 'declined' ? 'bad' : ''))} />
                  <Dots values={ms.map((m) => (m.paymentStatus === 'paid' ? 'ok' : ''))} />
                  <span><StatusBadge status={r.status} /></span>
                </button>
                {open && (
                  <div className="trow-detail">
                    <div className="member-grid">
                      {ms.map((m) => {
                        const c = comp(m.competitorId)
                        return (
                          <div key={m.id} className="member-card">
                            <b>{c?.name}{r.createdByCompetitorId === c?.id && <small> criou o trio</small>}</b>
                            <span>{c?.cpf ? maskCpf(c.cpf) : 'sem CPF'} · {c?.contepCode || 'sem CONTEP'}</span>
                            <span>Handicap {m.handicapSnapshot}{c?.handicapSource === 'declared' && <em className="warn"> declarado</em>}</span>
                            <div className="member-status"><StatusBadge status={m.confirmationStatus} /><StatusBadge status={m.paymentStatus} /></div>
                            {r.status !== 'cancelled' && m.confirmationStatus === 'pending' && (
                              <button className="link" onClick={() => run(actions.acceptForMember(m.id), `Aceite de ${c?.name} registrado.`)}><CheckCircle2 size={13} /> Registrar aceite</button>
                            )}
                            {r.status !== 'cancelled' && <button className="link" onClick={() => setSubstitute(m)}><Users size={13} /> Substituir</button>}
                          </div>
                        )
                      })}
                    </div>
                    <div className="trow-foot">
                      <small>Criado em {dateTime(r.createdAt)}{r.termsAcceptedAt ? ' · regulamento aceito' : ''}{r.cancelReason ? ` · cancelado: ${r.cancelReason}` : ''}</small>
                      {r.status !== 'cancelled' && <Button size="sm" variant="danger" onClick={() => setCancelId(r.id)}><UserX size={14} /> Cancelar trio</Button>}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {cancelId && (
        <ReasonDialog
          title="Cancelar trio"
          description="O trio sai da prova e as passadas pendentes dele são removidas. Quem já pagou fica com o valor como crédito no evento."
          confirmLabel="Cancelar trio"
          danger
          onClose={() => setCancelId(null)}
          onConfirm={(reason) => {
            const res = actions.cancelRegistration(cancelId, reason)
            run(res, 'Trio cancelado.')
            return res
          }}
        />
      )}
      {substitute && <Substitute member={substitute} onClose={() => setSubstitute(null)} />}
      {legacy && <LegacyImport event={event} onClose={() => setLegacy(false)} />}
      {counter && <CounterRegistration event={event} onClose={() => setCounter(false)} onDone={(res) => run(res, res.registrationIds?.length > 1 ? `${res.registrationIds.length} inscrições lançadas.` : 'Trio lançado.')} />}
    </div>
  )
}
