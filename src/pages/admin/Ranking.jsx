import React, { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { BadgeCheck, Download, Flag, RotateCcw, Trash2 } from 'lucide-react'
import { Button, PageHeader, ReasonDialog, StatusBadge, Tabs, useRun } from '../../components/UI'
import { FinalTable, QualifyingTable } from '../../components/RankingTable'
import { useStore } from '../../lib/store'
import { finalRanking, qualifyingComplete, qualifyingRanking, timeToLead } from '../../lib/ranking'
import { TIEBREAKS } from '../../lib/defaults'
import { decimal, downloadCsv } from '../../lib/export'
import { dateTime, time } from '../../lib/utils'

export default function Ranking() {
  const { event } = useOutletContext()
  const { state, actions } = useStore()
  const run = useRun()
  const cats = state.categories.filter((c) => c.eventId === event.id)
  const [catId, setCatId] = useState(cats[0]?.id)
  const [reopen, setReopen] = useState(false)
  const cat = cats.find((c) => c.id === catId)
  if (!cat) return <div className="page"><PageHeader eyebrow="Classificação" title="Ranking e finais" description="Cadastre categorias nas configurações." /></div>

  const qualifying = qualifyingRanking(state, event.id, cat.id)
  const finals = finalRanking(state, event.id, cat.id)
  const complete = qualifyingComplete(state, event.id, cat.id)
  const finalRuns = state.runs.filter((r) => r.eventId === event.id && r.categoryId === cat.id && r.stage === 'final')
  const finalDone = finalRuns.length > 0 && finalRuns.every((r) => r.status === 'done')
  const homologated = event.homologated?.[cat.id]
  const qRuns = state.runs.filter((r) => r.eventId === event.id && r.categoryId === cat.id && r.stage === 'qualifying')

  const leadFor = (row) => {
    const lead = timeToLead(state, event.id, cat.id, row.registration.id)
    return lead == null ? 'Aguardando' : lead > 0 ? `Precisa de ${time(lead)}` : 'Não alcança o líder'
  }

  const exportCsv = () => downloadCsv(`resultado-${event.slug}-${cat.name.toLowerCase().replace(/\s+/g, '-')}.csv`, [
    ['Etapa', 'Posição', 'Competidores', 'Tempos', 'Soma'],
    ...finals.map((r) => ['Final', r.position ?? '', r.members.map((m) => m.name).join(', '), r.finalTimes.map((t) => (t == null ? 'ST' : decimal(t))).join(' | '), r.invalid ? 'Sem tempo' : decimal(r.total)]),
    ...qualifying.map((r) => ['Classificatória', r.position ?? '', r.members.map((m) => m.name).join(', '), r.times.map(decimal).join(' | '), r.score == null ? '' : decimal(r.score)])
  ])

  return (
    <div className="page">
      <PageHeader
        eyebrow="Classificação"
        title="Ranking e finais"
        description="Recalculado a cada tempo lançado. Os critérios vêm da configuração de cada categoria."
        actions={<Button variant="secondary" onClick={exportCsv}><Download size={15} /> Exportar resultado</Button>}
      />
      <Tabs value={catId} onChange={setCatId} items={cats.map((c) => [c.id, c.name, event.homologated?.[c.id] ? 'homologado' : null])} />

      <div className="rules-strip">
        <span>{cat.bestTimesCount} melhores de {cat.qualifyingRuns} passadas</span>
        <span>{cat.finalistsCount} vagas na final</span>
        <span>{cat.finalRuns} passada{cat.finalRuns > 1 ? 's' : ''} na final</span>
        <span>{cat.carryQualifying ? 'Final soma a classificatória' : 'Final começa do zero'}</span>
        <span>Desempate: {TIEBREAKS[cat.tiebreak]}</span>
      </div>

      <div className="stage-actions">
        <div>
          <StatusBadge status={homologated ? 'homologated' : complete ? 'done' : 'pending'} label={homologated ? `Homologado em ${dateTime(homologated.at)} por ${homologated.by}` : complete ? 'Classificatória concluída' : `Classificatória: ${qRuns.filter((r) => r.status === 'done').length} de ${qRuns.length} passadas`} />
        </div>
        <div className="row-end">
          {!finalRuns.length && <Button disabled={!complete} onClick={() => run(actions.generateFinal(event.id, cat.id), `Final da ${cat.name} gerada e adicionada ao fim da ordem.`)}><Flag size={15} /> Gerar final</Button>}
          {finalRuns.length > 0 && !finalRuns.some((r) => r.status === 'done') && <Button variant="ghost" onClick={() => run(actions.removeFinal(event.id, cat.id), 'Final removida.')}><Trash2 size={15} /> Remover final</Button>}
          {!homologated
            ? <Button variant="secondary" disabled={!complete || (finalRuns.length > 0 && !finalDone)} onClick={() => run(actions.homologate(event.id, cat.id, true), `Resultado da ${cat.name} homologado.`)}><BadgeCheck size={15} /> Homologar resultado</Button>
            : <Button variant="ghost" onClick={() => setReopen(true)}><RotateCcw size={15} /> Reabrir</Button>}
        </div>
      </div>

      {finals.length > 0 && (
        <section className="block">
          <h3 className="block-title">Final</h3>
          <FinalTable rows={finals} category={cat} event={event} leadFor={leadFor} />
        </section>
      )}
      <section className="block">
        <h3 className="block-title">Classificatória</h3>
        <QualifyingTable rows={qualifying} category={cat} event={event} />
      </section>

      {reopen && (
        <ReasonDialog
          title={`Reabrir resultado da ${cat.name}`}
          description="O resultado volta a aceitar correções. A reabertura fica registrada."
          confirmLabel="Reabrir"
          danger
          onClose={() => setReopen(false)}
          onConfirm={(reason) => actions.homologate(event.id, cat.id, false, reason)}
        />
      )}
    </div>
  )
}
