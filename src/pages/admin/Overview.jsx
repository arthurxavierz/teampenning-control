import React from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Check, ChevronRight } from 'lucide-react'
import { Metric, PageHeader, StatusBadge } from '../../components/UI'
import { useStore } from '../../lib/store'
import { eventMetrics } from '../../lib/finance'
import { eventRuns } from '../../lib/schedule'
import { dateBr, dateTime, money } from '../../lib/utils'

export default function Overview() {
  const { event } = useOutletContext()
  const { state } = useStore()
  const m = eventMetrics(state, event.id)
  const cats = state.categories.filter((c) => c.eventId === event.id)
  const runs = eventRuns(state, event.id)
  const done = runs.filter((r) => r.status === 'done').length
  const finals = runs.filter((r) => r.stage === 'final')
  const homologated = cats.filter((c) => event.homologated?.[c.id]).length
  const base = `/admin/evento/${event.id}`
  const logs = state.auditLog.filter((l) => l.eventId === event.id).slice(0, 6)

  // Linha do tempo do evento: cada etapa diz se está feita e o que falta.
  const flow = [
    ['Inscrições', `${m.confirmed} de ${m.registrations} trios confirmados`, m.registrations > 0 && m.awaitingConfirmation + m.awaitingPayment === 0, `${base}/inscricoes`],
    ['Financeiro', m.reported ? `${m.reported} ${m.reported === 1 ? 'pagamento informado' : 'pagamentos informados'} para conferir` : `${money(m.pending)} em aberto`, m.pending === 0 && m.reported === 0, `${base}/financeiro`],
    ['Montagem', event.schedule?.publishedAt ? `Publicada, semente ${event.schedule.seed}` : runs.length ? 'Sorteada, falta publicar' : 'Ainda não sorteada', Boolean(event.schedule?.publishedAt), `${base}/montagem`],
    ['Pista', runs.length ? `${done} de ${runs.length} passadas lançadas` : 'Aguardando montagem', runs.length > 0 && done === runs.length, `${base}/pista`],
    ['Finais', finals.length ? `${new Set(finals.map((r) => r.categoryId)).size} de ${cats.length} categorias` : 'Nenhuma final gerada', finals.length > 0 && finals.every((r) => r.status === 'done'), `${base}/ranking`],
    ['Homologação', `${homologated} de ${cats.length} categorias`, homologated === cats.length && cats.length > 0, `${base}/ranking`]
  ]

  return (
    <div className="page">
      <PageHeader
        eyebrow={dateBr(event.date)}
        title={event.name}
        description={`${event.venue} · ${event.city}, ${event.state}`}
        actions={<StatusBadge status={event.status} />}
      />
      <div className="metrics">
        <Metric label="Trios" value={m.registrations} meta={`${m.confirmed} liberados para a prova`} />
        <Metric label="Competidores" value={m.competitors} />
        <Metric label="Recebido" value={money(m.received)} meta={`de ${money(m.receivable)} previstos`} tone="gold" />
        <Metric label="Em aberto" value={money(m.pending)} meta={m.credits ? `${money(m.credits)} em créditos` : null} />
      </div>

      <div className="grid-2 align-start">
        <div className="panel">
          <span className="eyebrow">Andamento</span>
          <h3>Do cadastro ao resultado</h3>
          <div className="flow">
            {flow.map(([title, text, ok, to], i) => (
              <Link key={title} to={to} className={`flow-step ${ok ? 'ok' : ''}`}>
                <b>{ok ? <Check size={14} /> : String(i + 1).padStart(2, '0')}</b>
                <span><strong>{title}</strong><small>{text}</small></span>
                <ChevronRight size={16} />
              </Link>
            ))}
          </div>
        </div>
        <div className="stack">
          <div className="panel">
            <span className="eyebrow">Categorias</span>
            <h3>Regras da prova</h3>
            {cats.map((c) => (
              <div key={c.id} className="rule-line">
                <i style={{ background: c.color }} />
                <strong>{c.name}</strong>
                <span>Soma {c.maxHandicap}</span>
                <span>{c.qualifyingRuns}P · {c.bestTimesCount}T</span>
                <span>{c.finalistsCount} na final</span>
              </div>
            ))}
          </div>
          <div className="panel">
            <span className="eyebrow">Últimas ações</span>
            {logs.map((l) => (
              <div key={l.id} className="log-line"><small>{dateTime(l.at)} · {l.actor}</small><span>{l.summary}</span></div>
            ))}
            <Link className="link" to={`${base}/historico`}>Ver auditoria completa</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
