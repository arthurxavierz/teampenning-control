import React from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, CalendarDays, MapPin, MonitorPlay, Trophy } from 'lucide-react'
import { Empty, Gallop, Horseshoe, StatusBadge } from '../../components/UI'
import { useStore } from '../../lib/store'
import { registrationWindow } from '../../lib/rules'
import { TIEBREAKS } from '../../lib/defaults'
import { eventMetrics } from '../../lib/finance'
import { countdown, dateBr, money, shortDate } from '../../lib/utils'

export default function EventPage() {
  const { slug } = useParams()
  const { state } = useStore()
  const event = state.events.find((e) => e.slug === slug)
  if (!event) return <section className="section"><Empty title="Evento não encontrado" description="Confira o endereço ou volte para a lista de etapas." /></section>

  const cats = state.categories.filter((c) => c.eventId === event.id)
  const win = registrationWindow(event)
  const metrics = eventMetrics(state, event.id)
  const published = Boolean(event.schedule?.publishedAt)

  return (
    <>
      <section className="event-hero">
        <div className="event-hero-copy">
          <div className="row-start"><StatusBadge status={event.status} />{countdown(event.date) && event.status !== 'finished' && <span className="countdown">{countdown(event.date)}</span>}</div>
          <h1>{event.name}</h1>
          <p>{event.description}</p>
          <div className="event-meta">
            <span><CalendarDays size={15} /> {dateBr(event.date)}</span>
            <span><MapPin size={15} /> {event.venue} · {event.city}, {event.state}</span>
          </div>
          <div className="hero-actions">
            {win.open
              ? <Link className="btn btn-primary btn-lg" to={`/eventos/${event.slug}/inscrever`}>Inscrever trio <ArrowRight size={17} /></Link>
              : <span className="btn btn-disabled btn-lg">{win.reason}</span>}
            <Link className="btn btn-ghost btn-lg" to={`/eventos/${event.slug}/resultados`}><Trophy size={16} /> {published ? 'Ordem e resultados' : 'Resultados'}</Link>
            <Link className="btn btn-ghost btn-lg" to={`/eventos/${event.slug}/live`}><MonitorPlay size={16} /> Arena</Link>
          </div>
        </div>
        <aside className="price-card">
          <Gallop className="price-gallop" />
          <small>VALOR POR PARTICIPAÇÃO</small>
          <strong>{money(event.registrationPrice)}</strong>
          <p>Cada competidor paga só as próprias participações, por Pix, direto na área do competidor.</p>
          <dl>
            <div><dt>Inscrições</dt><dd>{event.registrationOpens ? `${shortDate(event.registrationOpens)} a ${shortDate(event.registrationCloses)}` : 'A definir'}</dd></div>
            <div><dt>Trios inscritos</dt><dd>{metrics.registrations}</dd></div>
            <div><dt>Confirmados</dt><dd>{metrics.confirmed}</dd></div>
          </dl>
        </aside>
      </section>

      <div className="rope" aria-hidden="true" />

      <section className="section">
        <div className="section-head">
          <span className="eyebrow">Categorias</span>
          <h2>Regras desta etapa</h2>
        </div>
        <div className="category-grid">
          {cats.map((c) => (
            <article key={c.id} className="category-card" style={{ '--cat': c.color }}>
              <span className="cat-name">{c.name}</span>
              <strong>Soma até {c.maxHandicap}</strong>
              <ul>
                <li>{c.qualifyingRuns} passadas classificatórias</li>
                <li>Soma dos {c.bestTimesCount} melhores tempos</li>
                <li>{c.finalistsCount} trios na final, {c.finalRuns} {c.finalRuns > 1 ? 'passadas' : 'passada'}</li>
                <li>{c.carryQualifying ? 'Final soma com a classificatória' : 'Final começa do zero'}</li>
                <li>Desempate: {TIEBREAKS[c.tiebreak] || 'a definir'}</li>
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="section two-col">
        <div>
          <span className="eyebrow">Inscrição</span>
          <h2>O trio só entra na prova confirmado.</h2>
          <p className="lead">Confirmado quer dizer três aceites e três pagamentos. Quem cria o trio já entra aceito. Os outros dois recebem o convite na área do competidor, com CPF e telefone.</p>
        </div>
        <ol className="rules-list">
          <li><Horseshoe size={16} /><span><b>Handicap CONTEP.</b> Competidor cadastrado usa o handicap da base e a soma é conferida contra a categoria.</span></li>
          <li><Horseshoe size={16} /><span><b>Limites do evento.</b> Até {event.limits?.maxPerCompetitor || 'N'} participações por competidor e sem trio repetido.</span></li>
          <li><Horseshoe size={16} /><span><b>Pagamento individual.</b> Cada CPF tem o próprio saldo. Um pagamento quita as participações aceitas mais antigas primeiro.</span></li>
          <li><Horseshoe size={16} /><span><b>Montagem sorteada.</b> A ordem sai de um sorteio com semente registrada, espaçando as passadas de quem corre em vários trios.</span></li>
        </ol>
      </section>
    </>
  )
}
