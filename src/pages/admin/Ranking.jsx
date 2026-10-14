import React, { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { BadgeCheck, Download, Flag, RotateCcw, Swords, Trash2 } from 'lucide-react'
import { Button, PageHeader, ReasonDialog, StatusBadge, Tabs, useRun } from '../../components/UI'
import { FinalTable, QualifyingTable } from '../../components/RankingTable'
import { useStore } from '../../lib/store'
import { finalRanking, prizeByRegistration, prizeTable, qualifyingComplete, qualifyingRanking, tieGroups, timeToLead } from '../../lib/ranking'
import { TIEBREAKS } from '../../lib/defaults'
import { decimal, downloadCsv } from '../../lib/export'
import { dateTime, money, time, trioLabel } from '../../lib/utils'

// Empates que mexem em pódio, premiação ou corte da final. Com desempate em
// pista, a organização manda os trios correrem de novo daqui.
function TiePanel({ groups, stage, event, category, pendingRunoff }) {
  const { actions } = useStore()
  const run = useRun()
  if (!groups.length && !pendingRunoff) return null
  return (
    <div className="tie-panel">
      {pendingRunoff && <p><Swords size={15} /> Desempate em pista aguardando na mesa: {pendingRunoff} passada{pendingRunoff > 1 ? 's' : ''}.</p>}
      {!pendingRunoff && groups.map((g) => (
        <div key={g.position} className="tie-line">
          <span><b>Empate no {g.position}º lugar</b> entre {g.rows.map((r) => trioLabel(r.members)).join(', ')}</span>
          <Button size="sm" variant="secondary" onClick={() => run(actions.createRunoff(event.id, category.id, stage, g.rows.map((r) => r.registration.id)), 'Desempate adicionado ao fim da ordem de passadas.')}>
            <Swords size={14} /> Desempate em pista
          </Button>
        </div>
      ))}
    </div>
  )
}

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
  const prizeInfo = prizeTable(state, event.id, cat.id)
  const prizeStage = finals.length ? finals : qualifying
  const prizes = prizeByRegistration(prizeStage, prizeInfo)
  const relevant = Math.max(Number(cat.finalistsCount || 0) + 1, prizeInfo?.places.length || 0, 3)
  const pendingRunoff = (stage) => state.runs.filter((r) => r.eventId === event.id && r.categoryId === cat.id && r.stage === 'runoff' && r.runoffFor === stage && r.status === 'pending').length
  const qTies = complete && !finals.length ? tieGroups(qualifying, relevant) : []
  const fTies = finalDone ? tieGroups(finals, Math.max(prizeInfo?.places.length || 0, 3)) : []

  const leadFor = (row) => {
    const lead = timeToLead(state, event.id, cat.id, row.registration.id)
    return lead == null ? 'Aguardando' : lead > 0 ? `Precisa de ${time(lead)}` : 'Não alcança o líder'
  }

  const exportCsv = () => downloadCsv(`resultado-${event.slug}-${cat.name.toLowerCase().replace(/\s+/g, '-')}.csv`, [
    ['Etapa', 'Posição', 'Competidores', 'Tempos', 'Soma', 'Prêmio'],
    ...finals.map((r) => ['Final', r.position ?? '', r.members.map((m) => m.name).join(', '), r.finalTimes.map((t) => (t == null ? 'ST' : decimal(t))).join(' | '), r.invalid ? 'Sem tempo' : decimal(r.total), prizes[r.registration.id] ? decimal(prizes[r.registration.id]) : '']),
    ...qualifying.map((r) => ['Classificatória', r.position ?? '', r.members.map((m) => m.name).join(', '), r.times.map(decimal).join(' | '), r.score == null ? '' : decimal(r.score), !finals.length && prizes[r.registration.id] ? decimal(prizes[r.registration.id]) : ''])
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
        {cat.timeLimit ? <span>Tempo limite {cat.timeLimit}s</span> : null}
        {prizeInfo && <span className="gold">Premiação {money(prizeInfo.pool)}{prizeInfo.mode === 'percent' ? ` (${cat.prize.percent}% de ${money(prizeInfo.collected)})` : ''}: {prizeInfo.places.map((p) => `${p.place}º ${money(p.amount)}`).join(' · ')}</span>}
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
          <TiePanel groups={fTies} stage="final" event={event} category={cat} pendingRunoff={pendingRunoff('final')} />
          <FinalTable rows={finals} category={cat} event={event} leadFor={leadFor} prizes={prizes} />
        </section>
      )}
      <section className="block">
        <h3 className="block-title">Classificatória</h3>
        {!finals.length && <TiePanel groups={qTies} stage="qualifying" event={event} category={cat} pendingRunoff={pendingRunoff('qualifying')} />}
        <QualifyingTable rows={qualifying} category={cat} event={event} prizes={finals.length ? null : prizes} />
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
