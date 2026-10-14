import React, { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AlertTriangle, ChevronDown, ChevronUp, Download, Lock, Printer, Shuffle, Unlock, UserPlus } from 'lucide-react'
import { Button, CattleBrand, Empty, Field, PageHeader, ReasonDialog, StatusBadge, useRun } from '../../components/UI'
import { useStore } from '../../lib/store'
import { analyzeSchedule, eventRuns, memberIdsOf } from '../../lib/schedule'
import { downloadCsv } from '../../lib/export'
import { dateTime, runStageLabel, trioLabel } from '../../lib/utils'

export default function Schedule() {
  const { event } = useOutletContext()
  const { state, actions } = useStore()
  const run = useRun()
  const [pending, setPending] = useState(null)
  const runs = eventRuns(state, event.id)
  const cats = state.categories.filter((c) => c.eventId === event.id)
  const published = Boolean(event.schedule?.publishedAt)
  const started = runs.some((r) => r.status === 'done')
  const minGap = Number(event.schedule?.minGap ?? 2)
  const conflicts = analyzeSchedule(state, runs.filter((r) => r.stage === 'qualifying'), minGap)
  const conflictByRun = Object.groupBy ? Object.groupBy(conflicts, (c) => c.runId) : conflicts.reduce((acc, c) => ((acc[c.runId] ||= []).push(c), acc), {})
  const scheduled = new Set(runs.map((r) => r.registrationId))
  const confirmed = state.registrations.filter((r) => r.eventId === event.id && r.status === 'confirmed')
  const outside = confirmed.filter((r) => !scheduled.has(r.id))
  const notConfirmed = [...scheduled].filter((id) => state.registrations.find((r) => r.id === id)?.status !== 'confirmed')
  const comp = (id) => state.competitors.find((c) => c.id === id)
  const names = (regId) => trioLabel(memberIdsOf(state, regId).map(comp))
  const cattleOptions = []
  for (let n = Number(event.cattle?.min ?? 0); n <= Number(event.cattle?.max ?? 6); n++) cattleOptions.push(n)

  // Com a montagem publicada, qualquer ajuste pede motivo e fica auditado.
  const adjust = (label, fn) => (published ? setPending({ label, fn }) : run(fn('')))

  const exportCsv = () => downloadCsv(`montagem-${event.slug}.csv`, [
    ['Passada', 'Etapa', 'Rodada', 'Categoria', 'Boi', 'Competidor 1', 'Competidor 2', 'Competidor 3'],
    ...runs.map((r) => [r.number, r.stage === 'final' ? 'Final' : r.stage === 'runoff' ? 'Desempate' : 'Classificatória', r.round, cats.find((c) => c.id === r.categoryId)?.name, r.cattle, ...memberIdsOf(state, r.registrationId).map((id) => comp(id)?.name)])
  ])

  return (
    <div className="page">
      <PageHeader
        eyebrow="Montagem"
        title="Ordem de passadas"
        description={`${confirmed.length} trios confirmados. Distância mínima de ${minGap} passadas entre participações do mesmo competidor, ${event.schedule?.mode === 'by_category' ? 'categorias em sequência' : 'categorias intercaladas por rodada'}.`}
        actions={
          <>
            <Button variant="secondary" disabled={published || started} onClick={() => run(actions.generateSchedule(event.id), 'Montagem sorteada.')}>
              <Shuffle size={15} /> {runs.length ? 'Sortear de novo' : 'Sortear montagem'}
            </Button>
            {runs.length > 0 && (published
              ? <Button variant="ghost" disabled={started} onClick={() => run(actions.publishSchedule(event.id, false), 'Montagem despublicada.')}><Unlock size={15} /> Despublicar</Button>
              : <Button onClick={() => run(actions.publishSchedule(event.id, true), 'Montagem publicada para competidores e Arena.')}><Lock size={15} /> Publicar e travar</Button>)}
          </>
        }
      />

      {runs.length > 0 && (
        <div className="schedule-info">
          <span>Semente <b className="mono">{event.schedule?.seed}</b></span>
          <span>Sorteada em {dateTime(event.schedule?.generatedAt)}</span>
          <span>{published ? <><Lock size={13} /> Publicada em {dateTime(event.schedule.publishedAt)}</> : 'Rascunho, visível só para a organização'}</span>
          <span className="spacer" />
          <Button size="sm" variant="ghost" onClick={() => window.print()}><Printer size={14} /> Imprimir</Button>
          <Button size="sm" variant="ghost" onClick={exportCsv}><Download size={14} /> CSV</Button>
        </div>
      )}

      {outside.length > 0 && runs.length > 0 && (
        <div className="notice notice-warn">
          <UserPlus size={16} /> {outside.length} trio{outside.length > 1 ? 's confirmados estão' : ' confirmado está'} fora da montagem.
          <Button size="sm" onClick={() => adjust('Adicionar trios ao fim da montagem', () => actions.appendConfirmed(event.id))}>Adicionar ao fim</Button>
        </div>
      )}
      {notConfirmed.length > 0 && (
        <div className="notice notice-error"><AlertTriangle size={16} /> {notConfirmed.length} trio{notConfirmed.length > 1 ? 's' : ''} na montagem não está{notConfirmed.length > 1 ? 'o' : ''} mais confirmado{notConfirmed.length > 1 ? 's' : ''}. Confira as inscrições antes da prova.</div>
      )}
      {conflicts.length > 0 && (
        <div className="notice notice-warn"><AlertTriangle size={16} /> {conflicts.length} ponto{conflicts.length > 1 ? 's' : ''} em que um competidor corre antes da distância mínima. Estão marcados na lista.</div>
      )}

      {!runs.length ? (
        <Empty title="Nenhuma montagem sorteada" description="O sorteio usa só trios confirmados, respeita as passadas de cada categoria e registra a semente para ser auditado." />
      ) : (
        <div className="schedule print-area">
          <div className="print-title"><h2>{event.name}</h2><p>Ordem de passadas · semente {event.schedule?.seed}</p></div>
          {runs.map((r, i) => {
            const cat = cats.find((c) => c.id === r.categoryId)
            const warn = conflictByRun[r.id]
            return (
              <div key={r.id} className={`sched-row ${r.status === 'done' ? 'is-done' : ''} ${warn ? 'is-warn' : ''} ${r.stage !== 'qualifying' ? 'is-final' : ''}`}>
                <span className="sched-n">{r.number}</span>
                <span className="sched-trio">
                  <b>{names(r.registrationId)}</b>
                  <small>
                    <i style={{ background: cat?.color }} /> {cat?.name} · {runStageLabel(r)}
                    {warn && <em> · {warn.map((w) => `${comp(w.competitorId)?.nickname} com ${w.gap} de intervalo`).join(', ')}</em>}
                  </small>
                </span>
                {r.status === 'pending' ? (
                  <select className="cattle-select no-print" value={r.cattle ?? ''} aria-label="Boi" onChange={(e) => { const v = e.target.value; adjust(`Trocar boi da passada ${r.number}`, (reason) => actions.setCattle(r.id, v, reason)) }}>
                    {r.cattle == null && <option value="">A sortear</option>}
                    {cattleOptions.map((n) => <option key={n} value={n}>Boi {n}</option>)}
                  </select>
                ) : null}
                <CattleBrand value={r.cattle} size="sm" />
                <StatusBadge status={r.status} label={r.status === 'pending' ? 'Aguardando' : undefined} />
                <span className="sched-move no-print">
                  <button disabled={r.status !== 'pending' || i === 0} onClick={() => adjust(`Subir passada ${r.number}`, (reason) => actions.moveRun(r.id, -1, reason))} aria-label="Subir"><ChevronUp size={15} /></button>
                  <button disabled={r.status !== 'pending' || i === runs.length - 1} onClick={() => adjust(`Descer passada ${r.number}`, (reason) => actions.moveRun(r.id, 1, reason))} aria-label="Descer"><ChevronDown size={15} /></button>
                </span>
              </div>
            )
          })}
        </div>
      )}

      {pending && (
        <ReasonDialog
          title={pending.label}
          description="A montagem está publicada. O ajuste fica registrado com seu nome, horário e motivo."
          confirmLabel="Aplicar ajuste"
          onClose={() => setPending(null)}
          onConfirm={(reason) => pending.fn(reason)}
        />
      )}
    </div>
  )
}
