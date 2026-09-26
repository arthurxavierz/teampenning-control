import React, { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Download, Search } from 'lucide-react'
import { Button, Empty, PageHeader, Tabs } from '../../components/UI'
import { useStore } from '../../lib/store'
import { downloadCsv } from '../../lib/export'
import { dateTime, normalize } from '../../lib/utils'

const GROUPS = [
  ['all', 'Tudo'],
  ['run', 'Pista'],
  ['payment', 'Financeiro'],
  ['registration', 'Inscrições'],
  ['schedule', 'Montagem'],
  ['result', 'Resultados']
]

const fmt = (v) => (v == null || v === '' ? 'vazio' : String(v))

export default function Audit() {
  const { event } = useOutletContext()
  const { state } = useStore()
  const [group, setGroup] = useState('all')
  const [q, setQ] = useState('')
  const logs = state.auditLog
    .filter((l) => l.eventId === event.id || l.eventId == null)
    .filter((l) => group === 'all' || l.action.startsWith(group) || (group === 'result' && l.action.startsWith('final')))
    .filter((l) => !q || normalize(`${l.summary} ${l.actor}`).includes(normalize(q)))

  return (
    <div className="page">
      <PageHeader
        eyebrow="Auditoria"
        title="Histórico de alterações"
        description="Toda ação que mexe em inscrição, dinheiro, montagem ou resultado fica aqui, com operador, horário e motivo."
        actions={<Button variant="secondary" onClick={() => downloadCsv(`auditoria-${event.slug}.csv`, [['Quando', 'Quem', 'Ação', 'Descrição'], ...logs.map((l) => [dateTime(l.at), l.actor, l.action, l.summary])])}><Download size={15} /> Exportar</Button>}
      />
      <div className="toolbar">
        <Tabs value={group} onChange={setGroup} items={GROUPS} />
        <div className="search-input"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" /></div>
      </div>
      {!logs.length ? <Empty title="Nada registrado" /> : (
        <div className="audit">
          {logs.map((l) => (
            <div key={l.id} className="audit-line">
              <time>{dateTime(l.at)}</time>
              <b>{l.actor}</b>
              <span>
                {l.summary}
                {l.detail?.before && l.detail?.after && (
                  <small className="diff">
                    {Object.keys(l.detail.after).filter((k) => fmt(l.detail.before[k]) !== fmt(l.detail.after[k])).map((k) => `${k}: ${fmt(l.detail.before[k])} para ${fmt(l.detail.after[k])}`).join(' · ')}
                  </small>
                )}
              </span>
              <code>{l.action}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
