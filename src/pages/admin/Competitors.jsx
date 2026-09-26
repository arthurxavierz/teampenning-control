import React, { useMemo, useState } from 'react'
import { AlertTriangle, Search } from 'lucide-react'
import { Button, Field, Modal, PageHeader, ReasonDialog, StatusBadge, Tabs, useRun } from '../../components/UI'
import { useStore } from '../../lib/store'
import { membersOf } from '../../lib/rules'
import { effectiveTime, qualifyingRanking } from '../../lib/ranking'
import { dateBr, formatCpf, formatPhone, normalize, time, trioLabel } from '../../lib/utils'

function History({ competitor, onClose }) {
  const { state, actions } = useStore()
  const run = useRun()
  const [edit, setEdit] = useState(false)
  const [f, setF] = useState({ name: competitor.name, nickname: competitor.nickname || '', phone: competitor.phone || '', contepCode: competitor.contepCode || '', handicap: competitor.handicap })
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))

  const rows = state.registrationMembers
    .filter((m) => m.competitorId === competitor.id)
    .map((m) => {
      const reg = state.registrations.find((r) => r.id === m.registrationId)
      const event = state.events.find((e) => e.id === reg?.eventId)
      const cat = state.categories.find((c) => c.id === reg?.categoryId)
      const runs = state.runs.filter((r) => r.registrationId === reg?.id && r.status === 'done')
      const rank = reg?.status === 'confirmed' ? qualifyingRanking(state, event.id, cat.id).find((x) => x.registration.id === reg.id) : null
      return { m, reg, event, cat, runs, rank }
    })
    .filter((x) => x.event)
    .sort((a, b) => b.event.date.localeCompare(a.event.date))
  const times = rows.flatMap((x) => x.runs.map((r) => effectiveTime(r, x.event))).filter((t) => t != null)

  return (
    <Modal title={competitor.name} eyebrow="Histórico do competidor" onClose={onClose} wide>
      <div className="kv four">
        <span>CPF</span><b>{formatCpf(competitor.cpf)}</b>
        <span>Telefone</span><b>{formatPhone(competitor.phone)}</b>
        <span>CONTEP</span><b>{competitor.contepCode || 'sem código'}</b>
        <span>Handicap</span><b>{competitor.handicap} {competitor.handicapSource === 'declared' ? '(declarado)' : competitor.handicapSource === 'admin' ? '(ajuste manual)' : '(base)'}</b>
        <span>Participações</span><b>{rows.length}</b>
        <span>Melhor tempo</span><b>{times.length ? time(Math.min(...times)) : '-'}</b>
      </div>
      <div className="row-end"><Button size="sm" variant="secondary" onClick={() => setEdit(true)}>Editar cadastro</Button></div>
      <div className="table">
        <div className="thead hist-cols"><span>Evento</span><span>Trio</span><span>Status</span><span>Tempos</span><span>Classif.</span></div>
        {rows.map(({ m, reg, event, cat, runs, rank }) => (
          <div key={m.id} className="trow static hist-cols">
            <span><b>{event.name}</b><small>{dateBr(event.date)} · {cat?.name}</small></span>
            <span>{trioLabel(membersOf(state, reg.id).map((x) => state.competitors.find((c) => c.id === x.competitorId)))}</span>
            <span><StatusBadge status={reg.status} /></span>
            <span className="mono small">{runs.map((r) => { const t = effectiveTime(r, event); return t == null ? r.occurrence || 'ST' : t.toFixed(3) }).join(' · ') || '-'}</span>
            <span>{rank?.position ? `${rank.position}º` : '-'}</span>
          </div>
        ))}
      </div>
      {edit && (
        <ReasonDialog
          title="Editar cadastro"
          description="Alterar o handicap aqui não muda inscrições já feitas: cada trio guarda o handicap da época."
          confirmLabel="Salvar cadastro"
          onClose={() => setEdit(false)}
          onConfirm={(reason) => {
            const res = actions.updateCompetitor(competitor.id, { ...f, phone: f.phone.replace(/\D/g, '') }, reason)
            run(res, 'Cadastro atualizado.')
            return res
          }}
        >
          <div className="grid-2 tight">
            <Field label="Nome"><input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Apelido na pista"><input value={f.nickname} onChange={(e) => set('nickname', e.target.value)} /></Field>
            <Field label="Telefone"><input value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="Código CONTEP"><input value={f.contepCode} onChange={(e) => set('contepCode', e.target.value.toUpperCase())} /></Field>
            <Field label="Handicap"><input type="number" step="0.5" value={f.handicap} onChange={(e) => set('handicap', e.target.value)} /></Field>
          </div>
        </ReasonDialog>
      )}
    </Modal>
  )
}

export default function Competitors() {
  const { state } = useStore()
  const [q, setQ] = useState('')
  const [tab, setTab] = useState('all')
  const [open, setOpen] = useState(null)
  const counts = useMemo(() => {
    const out = {}
    state.registrationMembers.forEach((m) => { out[m.competitorId] = (out[m.competitorId] || 0) + 1 })
    return out
  }, [state.registrationMembers])
  const declared = state.competitors.filter((c) => c.handicapSource === 'declared')
  const list = state.competitors
    .filter((c) => tab === 'all' || (tab === 'declared' ? c.handicapSource === 'declared' : !c.contepCode))
    .filter((c) => !q || normalize(`${c.name} ${c.nickname} ${c.cpf} ${c.contepCode}`).includes(normalize(q)))
    .sort((a, b) => a.name.localeCompare(b.name))
  const current = open && state.competitors.find((c) => c.id === open)

  return (
    <div className="page">
      <PageHeader eyebrow="Cadastro permanente" title="Competidores" description="O competidor é único por CPF e atravessa todos os eventos. O trio é só a combinação daquela prova." />
      {declared.length > 0 && <div className="notice notice-warn"><AlertTriangle size={16} /> {declared.length} competidor{declared.length > 1 ? 'es' : ''} com handicap declarado na inscrição, sem conferência na base CONTEP.</div>}
      <div className="toolbar">
        <Tabs value={tab} onChange={setTab} items={[['all', 'Todos', state.competitors.length], ['declared', 'Handicap a conferir', declared.length], ['nocode', 'Sem código CONTEP']]} />
        <div className="search-input"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, CPF ou código" /></div>
      </div>
      <div className="table">
        <div className="thead comp-cols"><span>Competidor</span><span>CPF</span><span>CONTEP</span><span>Handicap</span><span>Participações</span></div>
        {list.map((c) => (
          <button key={c.id} className="trow comp-cols" onClick={() => setOpen(c.id)}>
            <span><b>{c.name}</b><small>{c.nickname}</small></span>
            <span className="mono">{formatCpf(c.cpf)}</span>
            <span>{c.contepCode || '-'}</span>
            <span>{c.handicap}{c.handicapSource === 'declared' && <em className="warn"> declarado</em>}</span>
            <span>{counts[c.id] || 0}</span>
          </button>
        ))}
      </div>
      {current && <History competitor={current} onClose={() => setOpen(null)} />}
    </div>
  )
}
