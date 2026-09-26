import React from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { CattleBrand, Empty, PageHeader } from '../../components/UI'
import { useStore } from '../../lib/store'
import { effectiveTime, finalRanking, occurrenceOf, qualifyingRanking, timeToLead, timeToQualify } from '../../lib/ranking'
import { eventRuns, memberIdsOf } from '../../lib/schedule'
import { time, trioLabel } from '../../lib/utils'

// O que o locutor precisa ler em voz alta sem procurar: nomes completos,
// histórico do trio nesta etapa, posição e o que falta para a final.
export function situation(state, event, run) {
  if (!run) return null
  if (run.stage === 'final') {
    const lead = timeToLead(state, event.id, run.categoryId, run.registrationId)
    if (lead == null) return null
    return lead > 0 ? `Para assumir a liderança precisa de menos de ${time(lead)}` : 'Não alcança mais a liderança da final'
  }
  const q = timeToQualify(state, event.id, run.categoryId, run.registrationId)
  if (!q) return null
  if (q.status === 'in') return 'Hoje está dentro do corte da final'
  if (q.status === 'open') return 'Há vaga sobrando: um tempo válido já coloca o trio na zona de classificação'
  if (q.status === 'need') return `Para entrar no corte da final precisa de menos de ${time(q.time)}`
  return 'Não alcança o corte da final com esta passada'
}

export function TrioHistory({ state, event, registrationId }) {
  const runs = state.runs.filter((r) => r.registrationId === registrationId && r.status === 'done').sort((a, b) => a.number - b.number)
  if (!runs.length) return <span className="muted">Primeira passada do trio nesta etapa.</span>
  return (
    <span className="run-chips">
      {runs.map((r) => {
        const t = effectiveTime(r, event)
        const occ = occurrenceOf(event, r.occurrence)
        return <i key={r.id} className={t == null ? 'chip-bad' : occ ? 'chip-penalty' : ''}>{t == null ? occ?.label || 'ST' : t.toFixed(3)}</i>
      })}
    </span>
  )
}

export default function Narrator() {
  const { event } = useOutletContext()
  const { state } = useStore()
  const runs = eventRuns(state, event.id)
  const pending = runs.filter((r) => r.status === 'pending')
  const current = pending[0]
  const last = runs.filter((r) => r.status === 'done').sort((a, b) => String(b.recordedAt).localeCompare(String(a.recordedAt)))[0]
  const comp = (id) => state.competitors.find((c) => c.id === id)
  const cat = current && state.categories.find((c) => c.id === current.categoryId)

  if (!runs.length) {
    return <div className="page"><PageHeader eyebrow="Locução" title="Mesa do locutor" /><Empty title="A montagem ainda não foi sorteada" action={<Link className="btn btn-primary" to={`/admin/evento/${event.id}/montagem`}>Ir para a montagem</Link>} /></div>
  }

  const rows = cat ? (current.stage === 'final' ? finalRanking(state, event.id, cat.id) : qualifyingRanking(state, event.id, cat.id)) : []
  const mine = current && rows.find((r) => r.registration.id === current.registrationId)
  const lastT = last && effectiveTime(last, event)
  const lastCat = last && state.categories.find((c) => c.id === last.categoryId)
  const lastRow = last && (last.stage === 'final' ? finalRanking(state, event.id, last.categoryId) : qualifyingRanking(state, event.id, last.categoryId)).find((r) => r.registration.id === last.registrationId)

  return (
    <div className="page narrator">
      <PageHeader eyebrow="Locução" title="Mesa do locutor" description="Atualiza sozinha a cada tempo lançado na pista. Deixe aberta em um tablet ao lado do microfone." />

      {current ? (
        <section className="nar-now">
          <div className="nar-top">
            <span>PASSADA {current.number} · {cat?.name} · {current.stage === 'final' ? `FINAL, RODADA ${current.round}` : `RODADA ${current.round}`}</span>
            <CattleBrand value={current.cattle} size="lg" />
          </div>
          <div className="nar-names">
            {memberIdsOf(state, current.registrationId).map(comp).map((c) => (
              <div key={c.id}>
                <strong>{c.name}</strong>
                <small>{c.nickname && c.nickname !== c.name.split(' ')[0] ? `"${c.nickname}" · ` : ''}Handicap {c.handicap}{c.contepCode ? ` · CONTEP ${c.contepCode}` : ''}</small>
              </div>
            ))}
          </div>
          <div className="nar-facts">
            <div><small>NESTA ETAPA</small><TrioHistory state={state} event={event} registrationId={current.registrationId} /></div>
            <div><small>POSIÇÃO NA CATEGORIA</small><b>{mine?.position ? `${mine.position}º` : 'Ainda sem soma'}</b></div>
          </div>
          {situation(state, event, current) && <p className="nar-situation">{situation(state, event, current)}</p>}
        </section>
      ) : (
        <section className="nar-now"><h2>Todas as passadas foram lançadas.</h2></section>
      )}

      <div className="grid-2 align-start">
        {last && (
          <div className="panel">
            <span className="eyebrow">Último resultado · passada {last.number}</span>
            <h3>{trioLabel(memberIdsOf(state, last.registrationId).map(comp))}</h3>
            <div className="nar-last">{lastT == null ? (occurrenceOf(event, last.occurrence)?.label || 'Sem tempo') : time(lastT)}</div>
            <p className="muted">{lastCat?.name}{lastRow?.position ? ` · agora em ${lastRow.position}º` : ''}</p>
          </div>
        )}
        {cat && (
          <div className="panel">
            <span className="eyebrow">{cat.name} · {current.stage === 'final' ? 'final' : 'classificação'}</span>
            {rows.filter((r) => r.position).slice(0, 5).map((r) => (
              <div key={r.registration.id} className={`next-line ${r.registration.id === current.registrationId ? 'nar-me' : ''}`}>
                <b>{r.position}</b><span>{trioLabel(r.members)}</span><strong className="mono">{time(current.stage === 'final' ? r.total : r.score)}</strong>
              </div>
            ))}
            {!rows.some((r) => r.position) && <p className="muted">Nenhum trio com soma completa ainda.</p>}
          </div>
        )}
      </div>

      {pending.length > 1 && (
        <div className="panel">
          <span className="eyebrow">Na sequência</span>
          {pending.slice(1, 5).map((r) => (
            <div key={r.id} className="next-line"><b>{r.number}</b><span>{memberIdsOf(state, r.registrationId).map((id) => comp(id)?.name).join(', ')}</span><CattleBrand value={r.cattle} size="sm" /></div>
          ))}
        </div>
      )}
    </div>
  )
}
