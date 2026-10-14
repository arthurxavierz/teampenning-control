import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Maximize } from 'lucide-react'
import { CattleBrand, Gallop, Horseshoe } from '../../components/UI'
import { useStore } from '../../lib/store'
import { effectiveTime, finalRanking, occurrenceOf, qualifyingRanking, timeToLead, timeToQualify } from '../../lib/ranking'
import { eventRuns, memberIdsOf } from '../../lib/schedule'
import { runStageLabel, time, trioLabel } from '../../lib/utils'

function useClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000 * 15)
    return () => clearInterval(id)
  }, [])
  return now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function LiveArena() {
  const { slug } = useParams()
  const [params] = useSearchParams()
  const { state } = useStore()
  const event = state.events.find((e) => e.slug === slug)
  const cats = state.categories.filter((c) => c.eventId === event?.id)
  const arena = event?.arena || {}
  const mode = params.get('modo') || arena.mode || 'tv'
  const clock = useClock()

  // Um bloco por categoria: a final quando existe, senão a classificatória.
  const blocks = useMemo(() => cats.map((cat) => {
    const finals = finalRanking(state, event.id, cat.id)
    return finals.length ? { cat, stage: 'final', rows: finals } : { cat, stage: 'qualifying', rows: qualifyingRanking(state, event.id, cat.id) }
  }), [state, event, cats])

  const [index, setIndex] = useState(0)
  useEffect(() => {
    const seconds = Math.max(4, Number(arena.rotationSeconds || 10))
    const id = setInterval(() => setIndex((i) => (blocks.length ? (i + 1) % blocks.length : 0)), seconds * 1000)
    return () => clearInterval(id)
  }, [blocks.length, arena.rotationSeconds])

  const sponsors = (arena.sponsors || []).filter(Boolean)
  const [sponsorIndex, setSponsorIndex] = useState(0)
  useEffect(() => {
    if (sponsors.length < 2) return
    const id = setInterval(() => setSponsorIndex((i) => (i + 1) % sponsors.length), 6000)
    return () => clearInterval(id)
  }, [sponsors.length])

  if (!event) return <div className="arena"><div className="arena-empty">Evento não encontrado</div></div>

  const runs = eventRuns(state, event.id)
  const pending = runs.filter((r) => r.status === 'pending')
  const current = pending[0]
  const upcoming = pending.slice(1, mode === 'led' ? 3 : 4)
  const last = [...runs].filter((r) => r.status === 'done').sort((a, b) => String(b.recordedAt).localeCompare(String(a.recordedAt)) || b.number - a.number)[0]
  const names = (regId) => trioLabel(memberIdsOf(state, regId).map((id) => state.competitors.find((c) => c.id === id)))
  const catName = (id) => cats.find((c) => c.id === id)?.name
  const block = blocks[index % Math.max(1, blocks.length)]
  const lead = current?.stage === 'final' ? timeToLead(state, event.id, current.categoryId, current.registrationId) : null
  const qualify = current?.stage === 'qualifying' ? timeToQualify(state, event.id, current.categoryId, current.registrationId) : null
  const lastTime = last ? effectiveTime(last, event) : null
  const lastOcc = last && occurrenceOf(event, last.occurrence)
  const limit = mode === 'led' ? 8 : 12

  const fullscreen = () => document.documentElement.requestFullscreen?.()

  return (
    <div className={`arena arena-${mode}`} style={{ '--accent': arena.accent || '#D8AF58' }}>
      <header className="arena-top">
        <Link to={`/eventos/${event.slug}`} className="arena-brand"><img src="/wordmark.png" alt="Achilles" /><small>TEAM PENNING LIVE</small></Link>
        <span className="arena-event">{event.name}</span>
        <span className="arena-clock">{clock}</span>
        <button className="arena-fs" onClick={fullscreen} aria-label="Tela cheia"><Maximize size={16} /></button>
      </header>

      <main className="arena-grid">
        <section className="arena-board">
          {block ? (
            <>
              <div className="board-head" key={block.cat.id + block.stage}>
                <span>{block.stage === 'final' ? 'FINAL' : 'CLASSIFICAÇÃO'}</span>
                <h1>{block.cat.name}</h1>
                <div className="board-dots">{blocks.map((b, i) => <i key={b.cat.id} className={i === index % blocks.length ? 'on' : ''} />)}</div>
              </div>
              <div className="board-rows" key={`rows-${block.cat.id}-${index}`}>
                {block.rows.slice(0, limit).map((row, i) => {
                  const final = block.stage === 'final'
                  const value = final
                    ? row.invalid ? 'SEM TEMPO' : row.complete ? time(row.total) : 'AGUARDA'
                    : row.disqualified ? 'DESCL.' : row.eligible ? time(row.score) : `${row.counted.length}/${block.cat.bestTimesCount}`
                  return (
                    <div key={row.registration.id} className={`board-row ${(!final && row.finalist) || (final && row.position === 1) ? 'hot' : ''}`} style={{ '--i': i }}>
                      <span className="pos">{row.position ? String(row.position).padStart(2, '0') : '..'}</span>
                      <strong>{trioLabel(row.members)}</strong>
                      <span className="val">{value}</span>
                    </div>
                  )
                })}
                {!block.rows.length && <div className="arena-empty">Aguardando trios confirmados</div>}
              </div>
              {block.stage === 'qualifying' && block.rows.length > 0 && <p className="board-foot">Em destaque: {block.cat.finalistsCount} vagas para a final. Soma dos {block.cat.bestTimesCount} melhores tempos.</p>}
            </>
          ) : <div className="arena-empty">Nenhuma categoria configurada</div>}
        </section>

        <aside className="arena-side">
          {current ? (
            <div className="now">
              <small>NA PISTA · PASSADA {current.number}</small>
              <h2>{names(current.registrationId)}</h2>
              <div className="now-meta">
                <span>{catName(current.categoryId)} · {runStageLabel(current)}</span>
                <CattleBrand value={current.cattle} />
              </div>
              {qualify?.status === 'need' && (
                <div className="to-lead">
                  <small>PARA ENTRAR NA FINAL</small>
                  <b>{time(qualify.time)}</b>
                </div>
              )}
              {lead != null && (
                <div className="to-lead">
                  <small>TEMPO PARA LIDERAR</small>
                  <b>{lead > 0 ? time(lead) : 'Sem chance de liderar'}</b>
                </div>
              )}
            </div>
          ) : (
            <div className="now"><small>PISTA</small><h2>{runs.length ? 'Prova encerrada' : 'Aguardando montagem'}</h2></div>
          )}

          {last && (
            <div className="last" key={last.id}>
              <small>ÚLTIMO RESULTADO · PASSADA {last.number}</small>
              <h3>{names(last.registrationId)}</h3>
              <strong className={lastTime == null ? 'bad' : ''}>{lastTime == null ? (lastOcc?.label || 'SEM TEMPO').toUpperCase() : time(lastTime)}</strong>
              {lastOcc?.effect === 'penalty' && <span>Com {lastOcc.label.toLowerCase()}</span>}
            </div>
          )}

          {upcoming.length > 0 && (
            <div className="next">
              <small>A SEGUIR</small>
              {upcoming.map((r) => (
                <div key={r.id}><b>{r.number}</b><span>{names(r.registrationId)}</span><em>{catName(r.categoryId)}</em></div>
              ))}
            </div>
          )}
        </aside>
      </main>

      <footer className="arena-foot">
        <Gallop className="arena-gallop" />
        {sponsors.length > 0 && <span className="sponsor" key={sponsorIndex}><small>APOIO</small>{sponsors[sponsorIndex % sponsors.length]}</span>}
      </footer>

      {arena.intermission && (
        <div className="intermission">
          <Gallop />
          <Horseshoe size={28} />
          <h1>{arena.intermissionMessage || 'Intervalo'}</h1>
          {sponsors.length > 0 && <p>{sponsors.join('  ·  ')}</p>}
        </div>
      )}
    </div>
  )
}
