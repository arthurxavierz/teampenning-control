import React, { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BadgeCheck, MonitorPlay } from 'lucide-react'
import { CattleBrand, Empty, StatusBadge, Tabs } from '../../components/UI'
import { FinalTable, QualifyingTable } from '../../components/RankingTable'
import { useStore } from '../../lib/store'
import { finalRanking, qualifyingRanking } from '../../lib/ranking'
import { eventRuns, memberIdsOf } from '../../lib/schedule'
import { dateTime, time, trioLabel } from '../../lib/utils'

export default function Results() {
  const { slug } = useParams()
  const { state } = useStore()
  const event = state.events.find((e) => e.slug === slug)
  const cats = state.categories.filter((c) => c.eventId === event?.id)
  const [tab, setTab] = useState(cats[0]?.id || 'ordem')
  if (!event) return <section className="section"><Empty title="Evento não encontrado" /></section>

  const published = Boolean(event.schedule?.publishedAt)
  const cat = cats.find((c) => c.id === tab)
  const finals = cat ? finalRanking(state, event.id, cat.id) : []
  const homologated = cat && event.homologated?.[cat.id]
  const runs = eventRuns(state, event.id)
  const names = (regId) => trioLabel(memberIdsOf(state, regId).map((id) => state.competitors.find((c) => c.id === id)))

  return (
    <section className="section results-page">
      <div className="section-head split">
        <div>
          <span className="eyebrow"><Link to={`/eventos/${event.slug}`}>{event.name}</Link></span>
          <h1 className="page-title">Ordem e resultados</h1>
        </div>
        <div className="row-start">
          {event.status === 'in_progress' && <span className="live-dot">Ao vivo</span>}
          <Link className="btn btn-ghost" to={`/eventos/${event.slug}/live`}><MonitorPlay size={16} /> Arena Live</Link>
        </div>
      </div>

      <Tabs value={tab} onChange={setTab} items={[...cats.map((c) => [c.id, c.name]), ['ordem', 'Ordem de passadas', published ? runs.length : null]]} />

      {tab === 'ordem' ? (
        !published ? (
          <Empty title="Montagem ainda não publicada" description="A ordem de passadas aparece aqui assim que a organização publicar o sorteio." />
        ) : (
          <div className="order-list">
            <p className="muted">Publicada em {dateTime(event.schedule.publishedAt)}. Semente do sorteio: <b>{event.schedule.seed}</b>.</p>
            {runs.map((r) => {
              const c = cats.find((x) => x.id === r.categoryId)
              return (
                <div key={r.id} className={`order-row ${r.status === 'done' ? 'is-done' : ''}`}>
                  <span className="order-n">{r.number}</span>
                  <span className="order-trio"><b>{names(r.registrationId)}</b><small>{c?.name} · {r.stage === 'final' ? 'Final' : `Rodada ${r.round}`}</small></span>
                  <CattleBrand value={r.cattle} size="sm" />
                  <span className="order-time">{r.status === 'done' ? (r.occurrence ? r.occurrence : time(r.time)) : ''}</span>
                </div>
              )
            })}
          </div>
        )
      ) : (
        cat && (
          <div className="stack-lg">
            {homologated && <div className="notice notice-ok"><BadgeCheck size={16} /> Resultado homologado em {dateTime(homologated.at)}.</div>}
            {finals.length > 0 && (
              <div>
                <h3 className="block-title">Final <StatusBadge status="final" /></h3>
                <FinalTable rows={finals} category={cat} event={event} />
              </div>
            )}
            <div>
              <h3 className="block-title">Classificatória</h3>
              <QualifyingTable rows={qualifyingRanking(state, event.id, cat.id)} category={cat} event={event} />
            </div>
          </div>
        )
      )}
    </section>
  )
}
