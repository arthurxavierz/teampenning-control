import React from 'react'
import { occurrenceOf } from '../lib/ranking'
import { money, time, trioLabel } from '../lib/utils'

// Linha extra da pontuação: prêmio e tempo do desempate em pista.
function ScoreExtra({ row, prizes }) {
  const prize = prizes?.[row.registration.id]
  if (!prize && row.runoff == null) return null
  return (
    <small className="score-extra">
      {row.runoff != null && <span>desempate {row.runoff >= 9999 ? 'sem tempo' : time(row.runoff)}</span>}
      {prize ? <span className="prize">{money(prize)}</span> : null}
    </small>
  )
}

function RunChips({ runs, event }) {
  return (
    <span className="run-chips">
      {runs.map((r) => {
        if (r.status !== 'done') return <i key={r.id} className="chip-pending">...</i>
        const occ = occurrenceOf(event, r.occurrence)
        if (occ && occ.effect !== 'penalty') return <i key={r.id} className="chip-bad">{occ.label}</i>
        return <i key={r.id} className={occ ? 'chip-penalty' : ''}>{Number(r.time).toFixed(3)}{occ ? `+${occ.seconds}` : ''}</i>
      })}
    </span>
  )
}

export function QualifyingTable({ rows, category, event, compact = false, prizes }) {
  if (!rows.length) return <p className="muted">Nenhum trio confirmado nesta categoria.</p>
  const cut = Number(category.finalistsCount || 0)
  return (
    <div className={`rank-table ${compact ? 'compact' : ''}`}>
      <div className="rank-head">
        <span>Pos.</span><span>Trio</span><span>Passadas</span><span>Soma {category.bestTimesCount}T</span>
      </div>
      {rows.map((row, i) => {
        const cutLine = row.finalist && rows[i + 1] && !rows[i + 1].finalist && cut > 0
        return (
          <React.Fragment key={row.registration.id}>
            <div className={`rank-row ${row.finalist ? 'is-finalist' : ''} ${row.disqualified ? 'is-out' : ''}`}>
              <span className="rank-pos">{row.position ? `${row.position}º` : '-'}{row.tied && <small>emp.</small>}</span>
              <span className="rank-trio"><b>{trioLabel(row.members)}</b>{!compact && <small>{row.members.map((m) => m.name).join(', ')}</small>}</span>
              <span><RunChips runs={row.runs} event={event} /></span>
              <span className="rank-score">
                {row.disqualified ? 'Desclassificado' : row.eligible ? time(row.score) : `${row.counted.length}/${category.bestTimesCount} tempos`}
                <ScoreExtra row={row} prizes={prizes} />
              </span>
            </div>
            {cutLine && <div className="cut-line"><span>Corte da final: {cut} classificados</span></div>}
          </React.Fragment>
        )
      })}
    </div>
  )
}

export function FinalTable({ rows, category, event, leadFor, prizes }) {
  if (!rows.length) return <p className="muted">A final ainda não foi gerada.</p>
  return (
    <div className="rank-table">
      <div className="rank-head">
        <span>Pos.</span><span>Trio</span><span>Final</span><span>{category.carryQualifying ? 'Total com classificatória' : 'Soma da final'}</span>
      </div>
      {rows.map((row) => (
        <div key={row.registration.id} className={`rank-row ${row.position === 1 ? 'is-leader' : ''} ${row.invalid ? 'is-out' : ''}`}>
          <span className="rank-pos">{row.position ? `${row.position}º` : '-'}</span>
          <span className="rank-trio">
            <b>{trioLabel(row.members)}</b>
            <small>{row.qualifyingPosition ? `${row.qualifyingPosition}º na classificatória` : ''}{category.carryQualifying ? ` · carrega ${time(row.carried)}` : ''}</small>
          </span>
          <span><RunChips runs={row.runs} event={event} /></span>
          <span className="rank-score">
            {row.invalid ? 'Sem tempo na final' : row.complete ? time(row.total) : leadFor?.(row) ?? 'Aguardando'}
            <ScoreExtra row={row} prizes={prizes} />
          </span>
        </div>
      ))}
    </div>
  )
}
