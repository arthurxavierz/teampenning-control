import React, { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Copy, Plus, Star, Upload } from 'lucide-react'
import { Button, Errors, Field, Metric, Modal, PageHeader, StatusBadge, useRun } from '../../components/UI'
import { useStore } from '../../lib/store'
import { eventMetrics } from '../../lib/finance'
import { addDays, dateBr, money, todayIso } from '../../lib/utils'

function NewEvent({ onClose }) {
  const { state, actions } = useStore()
  const navigate = useNavigate()
  const last = [...state.events].sort((a, b) => b.date.localeCompare(a.date))[0]
  const [template, setTemplate] = useState(last?.id || '')
  const [f, setF] = useState({
    name: '', date: addDays(todayIso(), 30), city: last?.city || '', state: last?.state || 'MG', venue: last?.venue || '',
    registrationPrice: last?.registrationPrice || 350, registrationOpens: todayIso(), registrationCloses: addDays(todayIso(), 27), description: ''
  })
  const [errors, setErrors] = useState([])
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))

  const submit = (e) => {
    e.preventDefault()
    if (!f.name.trim()) return setErrors(['Dê um nome ao evento.'])
    const res = actions.createEvent({ ...f, registrationPrice: Number(f.registrationPrice) }, template || null)
    if (res.ok === false) return setErrors(res.errors)
    onClose()
    navigate(`/admin/evento/${res.eventId}/configuracoes`)
  }

  return (
    <Modal title="Novo evento" eyebrow="Central de eventos" onClose={onClose} wide>
      <form onSubmit={submit} className="stack">
        <Field label="Partir de" hint="Copia categorias, regras, ocorrências, Pix e Arena. Inscrições e resultados não são copiados.">
          <select value={template} onChange={(e) => setTemplate(e.target.value)}>
            <option value="">Modelo padrão (SOMA 11, SOMA 03 e INICIANTE)</option>
            {state.events.map((ev) => <option key={ev.id} value={ev.id}>Duplicar {ev.name}</option>)}
          </select>
        </Field>
        <div className="grid-2">
          <Field label="Nome do evento"><input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="9ª Etapa CTM HSF" autoFocus /></Field>
          <Field label="Data da prova"><input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
          <Field label="Local"><input value={f.venue} onChange={(e) => set('venue', e.target.value)} /></Field>
          <div className="grid-2 tight">
            <Field label="Cidade"><input value={f.city} onChange={(e) => set('city', e.target.value)} /></Field>
            <Field label="UF"><input maxLength={2} value={f.state} onChange={(e) => set('state', e.target.value.toUpperCase())} /></Field>
          </div>
          <Field label="Abertura das inscrições"><input type="date" value={f.registrationOpens} onChange={(e) => set('registrationOpens', e.target.value)} /></Field>
          <Field label="Encerramento das inscrições"><input type="date" value={f.registrationCloses} onChange={(e) => set('registrationCloses', e.target.value)} /></Field>
          <Field label="Valor por participação"><input type="number" min="0" value={f.registrationPrice} onChange={(e) => set('registrationPrice', e.target.value)} /></Field>
        </div>
        <Field label="Descrição pública"><textarea rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <Errors list={errors} />
        <div className="row-end">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit">Criar evento</Button>
        </div>
      </form>
    </Modal>
  )
}

export default function Dashboard() {
  const { state, actions } = useStore()
  const run = useRun()
  const [creating, setCreating] = useState(false)
  const backupInput = useRef(null)
  const active = state.events.find((e) => e.active)
  const m = active ? eventMetrics(state, active.id) : null
  const events = [...state.events].sort((a, b) => b.date.localeCompare(a.date))

  // Carrega uma cópia (JSON do próprio sistema). No banco, soma o que estiver
  // nela sem apagar nada; serve para trazer dados de teste ou de outra máquina.
  const loadBackup = async (file) => {
    if (!file) return
    if (!window.confirm(`Carregar ${file.name}? Os dados da cópia serão somados aos que já existem.`)) return
    const res = actions.importBackup(await file.text())
    if (run(res, `Cópia carregada: ${res.events ?? 0} eventos. Enviando ao banco.`)) window.scrollTo({ top: 0 })
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Organização"
        title="Central de eventos"
        description="Cada etapa tem inscrições, financeiro, montagem, pista e resultados próprios. O evento ativo é o que aparece em destaque para o público."
        actions={(
          <>
            <Button variant="ghost" onClick={() => backupInput.current?.click()}><Upload size={15} /> Carregar cópia</Button>
            <input ref={backupInput} type="file" accept=".json,application/json" hidden onChange={(e) => { loadBackup(e.target.files?.[0]); e.target.value = '' }} />
            <Button onClick={() => setCreating(true)}><Plus size={16} /> Novo evento</Button>
          </>
        )}
      />

      {active && (
        <>
          <Link to={`/admin/evento/${active.id}/visao`} className="active-banner">
            <div>
              <span className="eyebrow">Evento ativo</span>
              <h2>{active.name}</h2>
              <p>{dateBr(active.date)} · {active.venue} · {active.city}, {active.state}</p>
            </div>
            <StatusBadge status={active.status} />
            <ArrowRight size={22} />
          </Link>
          <div className="metrics">
            <Metric label="Trios inscritos" value={m.registrations} meta={`${m.confirmed} confirmados`} />
            <Metric label="Aguardando aceite" value={m.awaitingConfirmation} meta={`${m.awaitingPayment} aguardando pagamento`} />
            <Metric label="Recebido" value={money(m.received)} meta={`${money(m.pending)} em aberto`} tone="gold" />
            <Metric label="Pagamentos informados" value={m.reported} meta="para conferir no financeiro" />
          </div>
        </>
      )}

      <h2 className="block-title">Todas as etapas</h2>
      <div className="event-table">
        {events.map((e) => {
          const em = eventMetrics(state, e.id)
          return (
            <div key={e.id} className="event-line">
              <div className="event-line-main">
                <StatusBadge status={e.status} />
                <b>{e.name}{e.active && <Star size={13} className="gold" />}</b>
                <small>{dateBr(e.date)} · {e.city}</small>
              </div>
              <span>{em.registrations} trios</span>
              <span>{money(em.received)}</span>
              <div className="event-line-actions">
                {!e.active && <Button size="sm" variant="ghost" onClick={() => run(actions.setActiveEvent(e.id), `${e.name} agora é o evento ativo.`)}>Tornar ativo</Button>}
                <Link className="btn btn-sm btn-secondary" to={`/admin/evento/${e.id}/visao`}>Abrir</Link>
              </div>
            </div>
          )
        })}
      </div>
      <p className="muted small"><Copy size={12} /> Para a próxima etapa, use Novo evento e duplique a anterior: categorias e regras vêm junto.</p>

      {creating && <NewEvent onClose={() => setCreating(false)} />}
    </div>
  )
}
