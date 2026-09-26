import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, MapPin, MonitorPlay, Shuffle, Timer, Users, Wallet } from 'lucide-react'
import { Gallop, Horseshoe, StatusBadge } from '../../components/UI'
import { useStore } from '../../lib/store'
import { registrationWindow } from '../../lib/rules'
import { dateBr, money, shortDate } from '../../lib/utils'

const STEPS = [
  ['01', 'Monte o trio', 'Escolha a categoria e os três competidores. O handicap vem da base CONTEP e a soma é conferida na hora.', Users],
  ['02', 'Cada um confirma', 'Quem cria o trio já entra confirmado. Os outros dois aceitam o convite na própria área.', Horseshoe],
  ['03', 'Pix por CPF', 'Cada competidor paga só as participações dele, com QR Code do evento. A organização dá a baixa.', Wallet],
  ['04', 'Sorteio e pista', 'Trios confirmados entram na montagem sorteada. Cada tempo lançado atualiza ranking e Arena.', Timer]
]

function DateBlock({ date }) {
  const d = new Date(`${date}T12:00:00`)
  return (
    <div className="date-block">
      <b>{String(d.getDate()).padStart(2, '0')}</b>
      <small>{d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase()}</small>
    </div>
  )
}

export default function Home() {
  const { state } = useStore()
  const events = [...state.events].filter((e) => e.status !== 'draft').sort((a, b) => b.date.localeCompare(a.date))
  const active = state.events.find((e) => e.active) || events[0]
  const win = registrationWindow(active)

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow"><Horseshoe size={14} /> Gestão de Team Penning</span>
          <h1>Da inscrição ao <em>último tempo.</em></h1>
          <p>Inscrições por trio, financeiro por CPF, montagem sorteada, operação de pista, ranking e Arena Live no mesmo lugar, para a prova correr no ritmo do cavalo.</p>
          <div className="hero-actions">
            {active && <Link className="btn btn-primary btn-lg" to={`/eventos/${active.slug}`}>Ver {active.name} <ArrowRight size={17} /></Link>}
            <Link className="btn btn-ghost btn-lg" to="/minha-area">Minha área</Link>
          </div>
        </div>

        <div className="hero-stage">
          <div className="chrono" aria-hidden="true">
            {[0, 2, 4, 6, 8, 10].map((f, i) => (
              <div key={f} className="chrono-cell">
                <span className="chrono-n">{i + 1}</span>
                <span className="gallop is-frame" style={{ '--frame': f }} />
              </div>
            ))}
          </div>
          <div className="hero-track">
            <Gallop className="hero-gallop" label="Cavalo a galope" />
            <div className="track-lines" />
          </div>
          {active && (
            <Link to={`/eventos/${active.slug}`} className="hero-ticket">
              <DateBlock date={active.date} />
              <div>
                <StatusBadge status={active.status} />
                <strong>{active.name}</strong>
                <span><MapPin size={13} /> {active.venue} · {active.city}, {active.state}</span>
              </div>
              <div className="ticket-price">
                <small>POR PARTICIPAÇÃO</small>
                <b>{money(active.registrationPrice)}</b>
                {win.open && active.registrationCloses && <em>Inscrições até {shortDate(active.registrationCloses)}</em>}
              </div>
            </Link>
          )}
        </div>
      </section>

      <div className="rope" aria-hidden="true" />

      <section className="section">
        <div className="section-head">
          <span className="eyebrow">Como funciona</span>
          <h2>Um trio, três confirmações, uma prova limpa.</h2>
        </div>
        <div className="steps">
          {STEPS.map(([n, title, text, Icon]) => (
            <article key={n}>
              <div className="step-top"><b>{n}</b><Icon size={20} /></div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head split">
          <div>
            <span className="eyebrow">Calendário</span>
            <h2>Etapas</h2>
          </div>
        </div>
        <div className="event-list">
          {events.map((e) => (
            <Link key={e.id} to={`/eventos/${e.slug}`} className="event-card">
              <DateBlock date={e.date} />
              <div className="event-card-body">
                <StatusBadge status={e.status} />
                <h3>{e.name}</h3>
                <p>{e.venue} · {e.city}, {e.state} · {dateBr(e.date)}</p>
              </div>
              <span className="event-card-go">{e.status === 'finished' ? 'Resultados' : 'Abrir'} <ArrowRight size={16} /></span>
            </Link>
          ))}
        </div>
      </section>

      {active && (
        <section className="arena-teaser">
          <div>
            <span className="eyebrow">Arena Live</span>
            <h2>O placar da pista no telão, em tempo real.</h2>
            <p>Classificação por categoria, próxima passada, último tempo e quanto falta para liderar a final. Pensado para TV, painel de LED e celular.</p>
            <div className="hero-actions">
              <Link className="btn btn-gold" to={`/eventos/${active.slug}/live`}><MonitorPlay size={17} /> Abrir Arena</Link>
              <Link className="btn btn-outline-light" to={`/eventos/${active.slug}/resultados`}><Shuffle size={16} /> Ordem e resultados</Link>
            </div>
          </div>
          <Gallop className="teaser-gallop" />
        </section>
      )}
    </>
  )
}
