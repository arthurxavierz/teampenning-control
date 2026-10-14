import React, { useEffect, useRef, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Dices, Keyboard, Pencil, Undo2 } from 'lucide-react'
import { Button, CattleBrand, Empty, Field, Gallop, PageHeader, ReasonDialog, StatusBadge, useRun } from '../../components/UI'
import { useStore } from '../../lib/store'
import { effectiveTime, occurrenceOf } from '../../lib/ranking'
import { eventRuns, memberIdsOf } from '../../lib/schedule'
import { situation, TrioHistory } from './Narrator'
import { cleanTimeInput, dateTime, parseTime, time, trioLabel } from '../../lib/utils'

function Correct({ run: target, event, onClose }) {
  const { actions } = useStore()
  const [t, setT] = useState(target.time ?? '')
  const [occ, setOcc] = useState(target.occurrence || '')
  return (
    <ReasonDialog
      title={`Corrigir passada ${target.number}`}
      description="A correção recalcula ranking e Arena. O valor anterior fica guardado na auditoria."
      confirmLabel="Salvar correção"
      onClose={onClose}
      onConfirm={(reason) => actions.correctRun(target.id, { time: t, occurrence: occ || null }, reason)}
    >
      <div className="grid-2 tight">
        <Field label="Tempo" hint="Aceita vírgula e minutos, como 1:02,345"><input inputMode="decimal" value={t} onChange={(e) => setT(cleanTimeInput(e.target.value))} /></Field>
        <Field label="Ocorrência">
          <select value={occ} onChange={(e) => setOcc(e.target.value)}>
            <option value="">Nenhuma</option>
            {(event.occurrences || []).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
          </select>
        </Field>
      </div>
    </ReasonDialog>
  )
}

export default function Operation() {
  const { event } = useOutletContext()
  const { state, session, actions } = useStore()
  const run = useRun()
  const runs = eventRuns(state, event.id)
  const current = runs.find((r) => r.status === 'pending')
  const done = runs.filter((r) => r.status === 'done').sort((a, b) => String(b.recordedAt).localeCompare(String(a.recordedAt)))
  const [t, setT] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [correcting, setCorrecting] = useState(null)
  const [undoing, setUndoing] = useState(null)
  const [cattleInput, setCattleInput] = useState('')
  const input = useRef(null)
  const occurrences = event.occurrences || []

  useEffect(() => {
    setT('')
    setNote('')
    setCattleInput('')
    input.current?.focus()
  }, [current?.id])

  const save = (occurrence) => {
    if (!current || busy) return
    const occ = occurrence && occurrences.find((o) => o.code === occurrence)
    setBusy(true)
    const res = actions.recordRun(current.id, { time: t, occurrence, note, cattle: cattleInput })
    run(res, res.autoSat
      ? `Passada ${current.number}: ${parseTime(t).toFixed(3)}s passou do limite e virou SAT`
      : `Passada ${current.number}: ${occ ? occ.label : `${parseTime(t).toFixed(3)}s`}`)
    // Pequena trava: um Enter repetido não lança a passada seguinte por engano.
    setTimeout(() => setBusy(false), 450)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (correcting || undoing) return
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const occ = occurrences[Number(e.key) - 1]
        if (occ) {
          e.preventDefault()
          if (occ.effect === 'penalty' && !(parseTime(t) > 0)) return run({ ok: false, errors: ['Digite o tempo antes de aplicar a penalidade.'] })
          save(occ.code)
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && done[0] && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        setUndoing(done[0])
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  if (!runs.length) {
    return (
      <div className="page">
        <PageHeader eyebrow="Pista" title="Operação da prova" />
        <Empty title="Sorteie a montagem primeiro" description="A mesa de pista segue a ordem de passadas do evento." action={<Link className="btn btn-primary" to={`/admin/evento/${event.id}/montagem`}>Ir para a montagem</Link>} />
      </div>
    )
  }

  const comp = (id) => state.competitors.find((c) => c.id === id)
  const members = current ? memberIdsOf(state, current.registrationId).map(comp) : []
  const cat = current && state.categories.find((c) => c.id === current.categoryId)
  const next = runs.filter((r) => r.status === 'pending').slice(1, 4)
  const limit = Number(cat?.timeLimit || 0)
  const typed = parseTime(t)
  const overLimit = limit > 0 && typed > limit
  const stageLabel = current?.stage === 'final' ? `Final, rodada ${current.round}` : current?.stage === 'runoff' ? 'Desempate em pista' : `Rodada ${current?.round}`
  const setCattleNow = (value) => {
    if (value === '' || value == null) return
    run(actions.setCattle(current.id, value, ''), `Boi ${value} na passada ${current.number}.`)
  }
  const progress = Math.round(((runs.length - runs.filter((r) => r.status === 'pending').length) / runs.length) * 100)

  return (
    <div className="page operation">
      <PageHeader
        eyebrow="Pista"
        title="Operação da prova"
        description={`${runs.length - runs.filter((r) => r.status === 'pending').length} de ${runs.length} passadas lançadas.`}
        actions={done[0] && <Button variant="ghost" onClick={() => setUndoing(done[0])}><Undo2 size={15} /> Desfazer último</Button>}
      />
      <div className="progress"><i style={{ width: `${progress}%` }} /></div>
      {!session.operator && <div className="notice notice-warn">Informe seu nome no campo Operador, no menu lateral. Cada lançamento fica assinado.</div>}
      {!event.schedule?.publishedAt && <div className="notice notice-info">A montagem ainda não foi publicada. Os lançamentos funcionam, mas competidores não veem a ordem.</div>}

      <div className="op-grid">
        {current ? (
          <form className="op-card" onSubmit={(e) => { e.preventDefault(); save(null) }}>
            <div className="op-top">
              <div><small>PASSADA</small><strong>{current.number}</strong></div>
              <div className="op-tags">
                <StatusBadge status={current.stage} />
                <span className="op-cat" style={{ '--cat': cat?.color }}>{cat?.name}</span>
                <span>{stageLabel}</span>
              </div>
              {current.cattle == null ? (
                <div className="cattle-live">
                  <CattleBrand value={null} size="lg" />
                  <Button size="sm" variant="secondary" onClick={() => run(actions.drawCattleNow(current.id))}><Dices size={14} /> Sortear boi</Button>
                  <input
                    inputMode="numeric"
                    value={cattleInput}
                    onChange={(e) => setCattleInput(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setCattleNow(cattleInput) } }}
                    onBlur={() => setCattleNow(cattleInput)}
                    placeholder="ou nº"
                    aria-label="Número do boi da fotocélula"
                  />
                </div>
              ) : <CattleBrand value={current.cattle} size="lg" />}
            </div>
            <div className="op-team">
              {members.map((c, i) => (
                <div key={c?.id || i}><span>0{i + 1}</span><strong>{c?.name}</strong><small>Handicap {c?.handicap}</small></div>
              ))}
            </div>
            <div className="op-history"><small>NESTA ETAPA</small><TrioHistory state={state} event={event} registrationId={current.registrationId} /></div>
            {situation(state, event, current) && <div className="op-lead">{situation(state, event, current)}</div>}
            <div className="op-entry">
              <Field label="Tempo oficial" hint={limit > 0 ? (overLimit ? `Acima do limite de ${limit}s: será lançado como SAT` : `Limite da ${cat?.name}: ${limit}s`) : null} className={overLimit ? 'is-over' : ''}>
                <div className="time-input">
                  <input ref={input} inputMode="decimal" autoComplete="off" value={t} onChange={(e) => setT(cleanTimeInput(e.target.value))} placeholder="00,000" aria-label="Tempo em segundos" />
                  <span>s</span>
                </div>
              </Field>
              <Field label="Observação"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" /></Field>
              <Button type="submit" size="lg" disabled={busy || !(parseTime(t) > 0)}>Confirmar tempo</Button>
            </div>
            <div className="op-occ">
              {occurrences.map((o, i) => (
                <Button key={o.code} variant={o.effect === 'penalty' ? 'secondary' : 'outline'} disabled={busy || (o.effect === 'penalty' && !(parseTime(t) > 0))} onClick={() => save(o.code)}>
                  {o.label}<kbd>Alt {i + 1}</kbd>
                </Button>
              ))}
            </div>
            <p className="op-keys"><Keyboard size={14} /> Enter confirma o tempo · Alt + número lança a ocorrência · Ctrl + Z desfaz o último</p>
          </form>
        ) : (
          <div className="op-card op-finished">
            <Gallop />
            <span className="eyebrow">Pista livre</span>
            <h2>Todas as passadas foram lançadas.</h2>
            <p>Gere as finais ou homologue os resultados na tela de ranking.</p>
            <Link className="btn btn-primary" to={`/admin/evento/${event.id}/ranking`}>Ir para ranking e finais</Link>
          </div>
        )}

        <aside className="op-side">
          {next.length > 0 && (
            <div className="panel">
              <span className="eyebrow">A seguir</span>
              {next.map((r) => (
                <div key={r.id} className="next-line"><b>{r.number}</b><span>{trioLabel(memberIdsOf(state, r.registrationId).map(comp))}</span><CattleBrand value={r.cattle} size="sm" /></div>
              ))}
            </div>
          )}
          <div className="panel">
            <span className="eyebrow">Últimos lançamentos</span>
            {done.slice(0, 8).map((r) => {
              const occ = occurrenceOf(event, r.occurrence)
              const eff = effectiveTime(r, event)
              return (
                <div key={r.id} className="done-line">
                  <b>{r.number}</b>
                  <span>{trioLabel(memberIdsOf(state, r.registrationId).map(comp))}<small>{r.recordedBy} · {dateTime(r.updatedAt || r.recordedAt)}{r.updatedAt ? ' · corrigida' : ''}</small></span>
                  <strong className={eff == null ? 'bad' : ''}>{eff == null ? occ?.label || 'Sem tempo' : time(eff)}</strong>
                  <button onClick={() => setCorrecting(r)} aria-label={`Corrigir passada ${r.number}`}><Pencil size={14} /></button>
                </div>
              )
            })}
            {!done.length && <p className="muted small">Nenhum tempo lançado.</p>}
          </div>
        </aside>
      </div>

      {correcting && <Correct run={correcting} event={event} onClose={() => setCorrecting(null)} />}
      {undoing && (
        <ReasonDialog
          title={`Desfazer passada ${undoing.number}`}
          description="A passada volta para a fila como pendente e o tempo lançado é apagado. O registro anterior fica na auditoria."
          confirmLabel="Desfazer lançamento"
          danger
          onClose={() => setUndoing(null)}
          onConfirm={(reason) => actions.undoRun(undoing.id, reason)}
        />
      )}
    </div>
  )
}
