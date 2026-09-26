import React, { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Check, Download, MessageCircle, Search, X } from 'lucide-react'
import { Button, Errors, Field, Metric, Modal, PageHeader, ReasonDialog, StatusBadge, Tabs, useRun } from '../../components/UI'
import { useStore } from '../../lib/store'
import { eventMetrics, financialByCompetitor } from '../../lib/finance'
import { decimal, downloadCsv } from '../../lib/export'
import { dateTime, formatCpf, money, normalize, whatsappLink } from '../../lib/utils'

function Receive({ row, event, payment, onClose }) {
  const { actions } = useStore()
  const run = useRun()
  const [amount, setAmount] = useState(payment?.amount ?? row.balance)
  const [errors, setErrors] = useState([])
  const submit = (e) => {
    e.preventDefault()
    const res = actions.confirmPayment({ eventId: event.id, competitorId: row.competitor.id, amount, paymentId: payment?.id, method: payment ? 'pix' : 'manual' })
    if (res.ok === false) return setErrors(res.errors)
    run(res, `Recebimento confirmado para ${row.competitor.name}.`)
    onClose()
  }
  return (
    <Modal title={payment ? 'Confirmar pagamento informado' : 'Registrar recebimento'} eyebrow={row.competitor.name} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <div className="kv">
          <span>Participações aceitas</span><b>{row.accepted}</b>
          <span>Total devido</span><b>{money(row.due)}</b>
          <span>Já confirmado</span><b>{money(row.paid)}</b>
          <span>Saldo</span><b>{money(row.balance)}</b>
        </div>
        {payment?.note && <p className="notice notice-info small">Observação do competidor: {payment.note}</p>}
        <Field label="Valor recebido" hint="O valor quita as participações aceitas mais antigas primeiro. O que sobrar fica como crédito.">
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <Errors list={errors} />
        <div className="row-end">
          <Button variant="ghost" onClick={onClose}>Voltar</Button>
          <Button type="submit"><Check size={15} /> Confirmar recebimento</Button>
        </div>
      </form>
    </Modal>
  )
}

export default function Finance() {
  const { event } = useOutletContext()
  const { state, actions } = useStore()
  const [tab, setTab] = useState('open')
  const [q, setQ] = useState('')
  const [receive, setReceive] = useState(null)
  const [reject, setReject] = useState(null)
  const rows = financialByCompetitor(state, event.id)
  const m = eventMetrics(state, event.id)

  const filtered = rows.filter((r) => {
    if (tab === 'reported' && !r.reported.length) return false
    if (tab === 'open' && r.balance <= 0 && !r.reported.length) return false
    if (tab === 'paid' && r.balance > 0) return false
    return !q || normalize(`${r.competitor.name} ${r.competitor.cpf}`).includes(normalize(q))
  })

  const exportCsv = () => downloadCsv(`financeiro-${event.slug}.csv`, [
    ['Competidor', 'CPF', 'Telefone', 'Participações aceitas', 'Pagas', 'Pendentes', 'Devido', 'Recebido', 'Saldo', 'Crédito', 'Pagamento informado'],
    ...rows.map((r) => [r.competitor.name, formatCpf(r.competitor.cpf), r.competitor.phone, r.accepted, r.paidCount, r.pendingCount, decimal(r.due), decimal(r.paid), decimal(r.balance), decimal(r.credit), r.reported.length ? 'sim' : ''])
  ])

  return (
    <div className="page">
      <PageHeader
        eyebrow="Financeiro"
        title="Conta por CPF"
        description="Cada competidor paga só as participações que aceitou. A baixa é manual, depois de conferir o extrato."
        actions={<Button variant="secondary" onClick={exportCsv}><Download size={15} /> Exportar CSV</Button>}
      />
      <div className="metrics">
        <Metric label="Previsto" value={money(m.receivable)} />
        <Metric label="Recebido" value={money(m.received)} tone="gold" />
        <Metric label="Em aberto" value={money(m.pending)} />
        <Metric label="Para conferir" value={m.reported} meta="pagamentos informados" />
      </div>

      <div className="toolbar">
        <Tabs value={tab} onChange={setTab} items={[['open', 'Em aberto'], ['reported', 'Informados', m.reported], ['paid', 'Quitados'], ['all', 'Todos', rows.length]]} />
        <div className="search-input"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar competidor" /></div>
      </div>

      <div className="table">
        <div className="thead fin-cols"><span>Competidor</span><span>Aceitas</span><span>Pagas</span><span>Saldo</span><span>Situação</span><span /></div>
        {filtered.map((r) => {
          const reported = r.reported[0]
          const wa = r.balance > 0 && whatsappLink(r.competitor.phone, `Olá, ${r.competitor.nickname || r.competitor.name}. Seu saldo na ${event.name} é de ${money(r.balance)}. O Pix está na área do competidor: ${location.origin}/minha-area`)
          return (
            <div key={r.competitor.id} className={`trow fin-cols static ${reported ? 'highlight' : ''}`}>
              <span><b>{r.competitor.name}</b><small>{formatCpf(r.competitor.cpf)}</small></span>
              <span>{r.accepted}{r.invites ? <small>+{r.invites} convite{r.invites > 1 ? 's' : ''}</small> : null}</span>
              <span>{r.paidCount}</span>
              <span><b>{money(r.balance)}</b>{r.credit > 0 && <small className="ok-text">crédito {money(r.credit)}</small>}</span>
              <span>
                {reported ? <><StatusBadge status="reported" /><small>{money(reported.amount)} em {dateTime(reported.createdAt)}</small></>
                  : r.balance > 0 ? <StatusBadge status="pending" label="Em aberto" /> : <StatusBadge status="paid" label="Quitado" />}
              </span>
              <span className="row-actions">
                {reported && <Button size="sm" onClick={() => setReceive({ row: r, payment: reported })}><Check size={14} /> Conferir</Button>}
                {reported && <Button size="sm" variant="ghost" onClick={() => setReject(reported)} title="Não localizado"><X size={14} /></Button>}
                {!reported && r.balance > 0 && <Button size="sm" variant="secondary" onClick={() => setReceive({ row: r })}>Dar baixa</Button>}
                {wa && <a className="btn btn-sm btn-ghost" href={wa} target="_blank" rel="noreferrer" title="Cobrar pelo WhatsApp"><MessageCircle size={14} /></a>}
              </span>
            </div>
          )
        })}
        {!filtered.length && <p className="muted pad">Nada nesta lista.</p>}
      </div>

      {receive && <Receive row={receive.row} payment={receive.payment} event={event} onClose={() => setReceive(null)} />}
      {reject && (
        <ReasonDialog
          title="Pagamento não localizado"
          description="O competidor verá o aviso na área dele. O saldo continua em aberto."
          confirmLabel="Marcar como não localizado"
          danger
          onClose={() => setReject(null)}
          onConfirm={(reason) => actions.rejectPayment(reject.id, reason)}
        />
      )}
    </div>
  )
}
