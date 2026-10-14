import React from 'react'
import { useOutletContext } from 'react-router-dom'
import { ClipboardList, Download, MessageCircle, Printer, Shuffle, Trophy, Users, Wallet } from 'lucide-react'
import { Button, Metric, PageHeader, StatusBadge, statusLabel } from '../../components/UI'
import { useStore } from '../../lib/store'
import { eventMetrics, financialByCompetitor } from '../../lib/finance'
import { membersOf } from '../../lib/rules'
import { finalRanking, qualifyingRanking } from '../../lib/ranking'
import { eventRuns, memberIdsOf } from '../../lib/schedule'
import { decimal, downloadCsv } from '../../lib/export'
import { dateTime, formatCpf, formatPhone, money, runStageLabel, whatsappLink } from '../../lib/utils'

export default function Reports() {
  const { event } = useOutletContext()
  const { state } = useStore()
  const m = eventMetrics(state, event.id)
  const fin = financialByCompetitor(state, event.id)
  const debtors = fin.filter((r) => r.balance > 0)
  const cats = state.categories.filter((c) => c.eventId === event.id)
  const regs = state.registrations.filter((r) => r.eventId === event.id)
  const comp = (id) => state.competitors.find((c) => c.id === id)
  const catName = (id) => cats.find((c) => c.id === id)?.name
  const file = (name) => `${name}-${event.slug}.csv`

  const reports = [
    ['Inscrições', 'Todos os trios com integrantes, handicap, aceite, pagamento e status.', ClipboardList, () => downloadCsv(file('inscricoes'), [
      ['Trio', 'Categoria', 'Status', 'Criado em', 'Integrante', 'CPF', 'Telefone', 'Handicap', 'Aceite', 'Pagamento'],
      ...regs.flatMap((r, i) => membersOf(state, r.id).map((mm) => {
        const c = comp(mm.competitorId)
        return [i + 1, catName(r.categoryId), statusLabel(r.status), dateTime(r.createdAt), c?.name, formatCpf(c?.cpf), c?.phone, decimal(mm.handicapSnapshot), statusLabel(mm.confirmationStatus), statusLabel(mm.paymentStatus)]
      }))
    ])],
    ['Financeiro por CPF', 'Devido, recebido, saldo e crédito de cada competidor.', Wallet, () => downloadCsv(file('financeiro'), [
      ['Competidor', 'CPF', 'Aceitas', 'Devido', 'Recebido', 'Saldo', 'Crédito'],
      ...fin.map((r) => [r.competitor.name, formatCpf(r.competitor.cpf), r.accepted, decimal(r.due), decimal(r.paid), decimal(r.balance), decimal(r.credit)])
    ])],
    ['Pagamentos', 'Cada pagamento informado, confirmado ou recusado, com quem conferiu.', Wallet, () => downloadCsv(file('pagamentos'), [
      ['Competidor', 'Valor', 'Status', 'Informado em', 'Confirmado em', 'Conferido por', 'Observação'],
      ...state.payments.filter((p) => p.eventId === event.id).map((p) => [comp(p.competitorId)?.name, decimal(p.amount), statusLabel(p.status), dateTime(p.createdAt), dateTime(p.confirmedAt || p.rejectedAt), p.confirmedBy || p.rejectedBy || '', p.note || p.rejectReason || ''])
    ])],
    ['Montagem e tempos', 'Ordem de passadas com boi, tempo, ocorrência e quem lançou.', Shuffle, () => downloadCsv(file('passadas'), [
      ['Passada', 'Etapa', 'Categoria', 'Boi', 'Trio', 'Tempo', 'Ocorrência', 'Lançado por', 'Lançado em'],
      ...eventRuns(state, event.id).map((r) => [r.number, runStageLabel(r), catName(r.categoryId), r.cattle ?? '', memberIdsOf(state, r.registrationId).map((id) => comp(id)?.name).join(', '), decimal(r.time), r.occurrence || '', r.recordedBy || '', dateTime(r.recordedAt)])
    ])],
    ['Resultados', 'Classificatória e final de todas as categorias.', Trophy, () => downloadCsv(file('resultados'), [
      ['Categoria', 'Etapa', 'Posição', 'Trio', 'Soma'],
      ...cats.flatMap((c) => [
        ...finalRanking(state, event.id, c.id).map((r) => [c.name, 'Final', r.position ?? '', r.members.map((x) => x.name).join(', '), r.invalid ? 'Sem tempo' : decimal(r.total)]),
        ...qualifyingRanking(state, event.id, c.id).map((r) => [c.name, 'Classificatória', r.position ?? '', r.members.map((x) => x.name).join(', '), decimal(r.score)])
      ])
    ])],
    ['Participações por competidor', 'Quantos trios cada pessoa tem no evento e em quais categorias.', Users, () => downloadCsv(file('participacoes'), [
      ['Competidor', 'CPF', 'Participações', 'Categorias'],
      ...fin.map((r) => {
        const own = state.registrationMembers.filter((mm) => mm.competitorId === r.competitor.id).map((mm) => regs.find((x) => x.id === mm.registrationId)).filter(Boolean)
        return [r.competitor.name, formatCpf(r.competitor.cpf), own.length, [...new Set(own.map((x) => catName(x.categoryId)))].join(', ')]
      })
    ])]
  ]

  return (
    <div className="page">
      <PageHeader
        eyebrow="Relatórios"
        title="Números do evento"
        description="Arquivos CSV em ponto e vírgula, que abrem direto no Excel. Use Imprimir para levar a inadimplência em papel."
        actions={<Button variant="secondary" onClick={() => window.print()}><Printer size={15} /> Imprimir</Button>}
      />
      <div className="metrics">
        <Metric label="Previsto" value={money(m.receivable)} />
        <Metric label="Recebido" value={money(m.received)} tone="gold" />
        <Metric label="Inadimplência" value={money(m.pending)} meta={`${debtors.length} competidores`} />
        <Metric label="Créditos" value={money(m.credits)} meta="valores de trios que saíram" />
      </div>

      <div className="report-grid no-print">
        {reports.map(([title, text, Icon, fn]) => (
          <button key={title} className="report-card" onClick={fn}>
            <Icon size={20} />
            <b>{title}</b>
            <span>{text}</span>
            <em><Download size={14} /> Baixar CSV</em>
          </button>
        ))}
      </div>

      <section className="block print-area">
        <div className="print-title"><h2>{event.name}</h2><p>Inadimplência em {dateTime(new Date().toISOString())}</p></div>
        <h3 className="block-title">Inadimplência</h3>
        <div className="table">
          <div className="thead debt-cols"><span>Competidor</span><span>Telefone</span><span>Pendentes</span><span>Saldo</span><span /></div>
          {debtors.map((r) => (
            <div key={r.competitor.id} className="trow static debt-cols">
              <span><b>{r.competitor.name}</b><small>{formatCpf(r.competitor.cpf)}</small></span>
              <span>{formatPhone(r.competitor.phone)}</span>
              <span>{r.pendingCount}{r.reported.length ? <StatusBadge status="reported" /> : null}</span>
              <span><b>{money(r.balance)}</b></span>
              <span className="no-print">
                {whatsappLink(r.competitor.phone, '') && (
                  <a className="btn btn-sm btn-ghost" target="_blank" rel="noreferrer" href={whatsappLink(r.competitor.phone, `Olá, ${r.competitor.nickname || r.competitor.name}. Seu saldo na ${event.name} é de ${money(r.balance)}. O Pix está na área do competidor: ${location.origin}/minha-area`)}>
                    <MessageCircle size={14} /> Cobrar
                  </a>
                )}
              </span>
            </div>
          ))}
          {!debtors.length && <p className="muted pad">Ninguém com saldo em aberto.</p>}
        </div>
      </section>
    </div>
  )
}
