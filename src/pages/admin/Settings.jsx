import React, { useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { Button, Errors, Field, Modal, PageHeader, useRun } from '../../components/UI'
import { mode, useStore } from '../../lib/store'
import { CATEGORY_PRESETS, CATTLE_MODES, OCCURRENCE_EFFECTS, PRIZE_MODES, TIEBREAKS, categoryFromPreset } from '../../lib/defaults'
import { GENDERS } from '../../lib/rules'
import { parseSplit } from '../../lib/ranking'
import { money } from '../../lib/utils'

function CategoryEditor({ eventId, category, onClose }) {
  const { state, actions } = useStore()
  const used = state.categories.filter((x) => x.eventId === eventId).map((x) => x.name)
  const [c, setC] = useState(() => structuredClone(category || categoryFromPreset(eventId, { name: '', maxHandicap: 0, finalistsCount: 10, color: '#D8AF58' })))
  const [errors, setErrors] = useState([])
  const set = (k, v) => setC((s) => ({ ...s, [k]: v }))
  const setPrize = (k, v) => setC((s) => ({ ...s, prize: { ...(s.prize || {}), [k]: v } }))
  const applyPreset = (name) => {
    const preset = CATEGORY_PRESETS.find((p) => p.name === name)
    if (preset) setC((s) => ({ ...categoryFromPreset(eventId, preset), id: s.id, eventId }))
  }
  const submit = (e) => {
    e.preventDefault()
    const res = actions.saveCategory(eventId, c)
    if (res.ok === false) return setErrors(res.errors)
    onClose()
  }
  const prize = c.prize || { mode: 'none' }
  const split = parseSplit(prize.split)
  const splitTotal = split.reduce((a, b) => a + b, 0)
  return (
    <Modal title={category ? `Editar ${category.name}` : 'Nova categoria'} eyebrow="Categoria" onClose={onClose} wide>
      <form onSubmit={submit} className="stack">
        {!category && (
          <div className="preset-row">
            <span className="muted small">Começar de um modelo:</span>
            {CATEGORY_PRESETS.filter((p) => !used.includes(p.name)).map((p) => (
              <button type="button" key={p.name} className={`chip ${c.name === p.name ? 'active' : ''}`} onClick={() => applyPreset(p.name)}>{p.name}</button>
            ))}
          </div>
        )}
        <div className="grid-3">
          <Field label="Nome"><input value={c.name} onChange={(e) => set('name', e.target.value.toUpperCase())} /></Field>
          <Field label="Soma máxima de handicap" hint="Iniciante soma 0"><input type="number" step="0.5" value={c.maxHandicap} onChange={(e) => set('maxHandicap', e.target.value)} /></Field>
          <Field label="Cor"><input type="color" value={c.color} onChange={(e) => set('color', e.target.value)} /></Field>
          <Field label="Passadas classificatórias"><input type="number" min="1" value={c.qualifyingRuns} onChange={(e) => set('qualifyingRuns', e.target.value)} /></Field>
          <Field label="Melhores tempos somados"><input type="number" min="1" value={c.bestTimesCount} onChange={(e) => set('bestTimesCount', e.target.value)} /></Field>
          <Field label="Tempo limite (s)" hint="Acima disso a passada vira SAT. Vazio: sem limite"><input type="number" min="0" step="1" value={c.timeLimit ?? ''} onChange={(e) => set('timeLimit', e.target.value)} placeholder="Ex.: 60" /></Field>
          <Field label="Classificados para a final"><input type="number" min="0" value={c.finalistsCount} onChange={(e) => set('finalistsCount', e.target.value)} /></Field>
          <Field label="Passadas da final"><input type="number" min="1" value={c.finalRuns} onChange={(e) => set('finalRuns', e.target.value)} /></Field>
          <Field label="Na final">
            <select value={c.carryQualifying ? 'carry' : 'zero'} onChange={(e) => set('carryQualifying', e.target.value === 'carry')}>
              <option value="carry">Soma com a classificatória</option>
              <option value="zero">Começa do zero</option>
            </select>
          </Field>
          <Field label="Desempate" hint={c.tiebreak === 'runoff' ? 'Os empatados correm de novo. O botão aparece no ranking.' : null}>
            <select value={c.tiebreak} onChange={(e) => set('tiebreak', e.target.value)}>
              {Object.entries(TIEBREAKS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>

        <details className="subsection" open={Boolean(c.maxAge || c.maxAgeSum || c.gender || (c.maxMemberHandicap ?? '') !== '')}>
          <summary>Restrições de quem pode correr</summary>
          <div className="grid-4">
            <Field label="Handicap máximo por competidor" hint="Ex.: amador até 2"><input type="number" min="0" step="0.5" value={c.maxMemberHandicap ?? ''} onChange={(e) => set('maxMemberHandicap', e.target.value)} /></Field>
            <Field label="Idade máxima" hint="No dia da prova"><input type="number" min="0" value={c.maxAge ?? ''} onChange={(e) => set('maxAge', e.target.value)} /></Field>
            <Field label="Soma de idades do trio" hint="Mirim CONTEP: 36"><input type="number" min="0" value={c.maxAgeSum ?? ''} onChange={(e) => set('maxAgeSum', e.target.value)} /></Field>
            <Field label="Sexo">
              <select value={c.gender || ''} onChange={(e) => set('gender', e.target.value)}>
                <option value="">Livre</option>
                {Object.entries(GENDERS).map(([k, v]) => <option key={k} value={k}>Só {v.toLowerCase()}</option>)}
              </select>
            </Field>
          </div>
        </details>

        <details className="subsection" open={Boolean(prize.mode && prize.mode !== 'none')}>
          <summary>Premiação</summary>
          <div className="grid-4">
            <Field label="Forma">
              <select value={prize.mode || 'none'} onChange={(e) => setPrize('mode', e.target.value)}>
                {Object.entries(PRIZE_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            {prize.mode === 'percent' && <Field label="% do arrecadado na categoria"><input type="number" min="0" max="100" value={prize.percent ?? 60} onChange={(e) => setPrize('percent', e.target.value)} /></Field>}
            {prize.mode === 'fixed' && <Field label="Valor total"><input type="number" min="0" value={prize.amount ?? 0} onChange={(e) => setPrize('amount', e.target.value)} /></Field>}
            {prize.mode && prize.mode !== 'none' && (
              <Field label="Divisão por colocação (%)" hint={`${split.length} colocações. Soma ${splitTotal}%${splitTotal !== 100 ? ', será proporcional' : ''}`}>
                <input value={prize.split ?? ''} onChange={(e) => setPrize('split', e.target.value)} placeholder="50, 30, 20" />
              </Field>
            )}
          </div>
        </details>

        <p className="muted small">Regras que ainda dependem da organização ficam aqui, e não no código. Mudar depois de lançado recalcula o ranking.</p>
        <Errors list={errors} />
        <div className="row-end"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar categoria</Button></div>
      </form>
    </Modal>
  )
}

export default function Settings() {
  const { event } = useOutletContext()
  const { state, actions } = useStore()
  const run = useRun()
  const [f, setF] = useState(() => structuredClone(event))
  const [editing, setEditing] = useState(null)
  const cats = state.categories.filter((c) => c.eventId === event.id)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const setIn = (group, k, v) => setF((s) => ({ ...s, [group]: { ...s[group], [k]: v } }))
  const setOcc = (i, k, v) => setF((s) => ({ ...s, occurrences: s.occurrences.map((o, j) => (j === i ? { ...o, [k]: v } : o)) }))

  const save = () => {
    const patch = {
      name: f.name, slug: f.slug, date: f.date, venue: f.venue, city: f.city, state: f.state, description: f.description, status: f.status,
      registrationOpens: f.registrationOpens, registrationCloses: f.registrationCloses, registrationPrice: Number(f.registrationPrice),
      limits: { maxPerCompetitor: Number(f.limits?.maxPerCompetitor) || 0, maxSameTrio: Number(f.limits?.maxSameTrio) || 0 },
      terms: f.terms, pix: f.pix,
      cattle: { ...f.cattle, min: Number(f.cattle.min), max: Number(f.cattle.max) },
      schedule: { ...event.schedule, minGap: Number(f.schedule.minGap), mode: f.schedule.mode },
      occurrences: f.occurrences.filter((o) => o.code && o.label).map((o) => ({ ...o, code: o.code.toUpperCase(), seconds: Number(o.seconds) || 0 }))
    }
    if (patch.cattle.max < patch.cattle.min) return run({ ok: false, errors: ['O boi final precisa ser maior que o inicial.'] })
    run(actions.updateEvent(event.id, patch), 'Configurações salvas.')
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Evento"
        title="Configurações"
        description="As regras pertencem ao evento. Duplicar esta etapa leva tudo isso para a próxima."
        actions={<Button onClick={save}><Save size={15} /> Salvar alterações</Button>}
      />

      <div className="settings">
        <section className="panel stack">
          <h3>Dados do evento</h3>
          <div className="grid-2">
            <Field label="Nome"><input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Endereço público" hint={`/eventos/${f.slug}`}><input value={f.slug} onChange={(e) => set('slug', e.target.value)} /></Field>
            <Field label="Data"><input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
            <Field label="Status">
              <select value={f.status} onChange={(e) => set('status', e.target.value)}>
                <option value="draft">Rascunho (fora da lista pública)</option>
                <option value="registration_open">Inscrições abertas</option>
                <option value="registration_closed">Inscrições encerradas</option>
                <option value="in_progress">Em andamento</option>
                <option value="finished">Finalizado</option>
              </select>
            </Field>
            <Field label="Local"><input value={f.venue} onChange={(e) => set('venue', e.target.value)} /></Field>
            <div className="grid-2 tight">
              <Field label="Cidade"><input value={f.city} onChange={(e) => set('city', e.target.value)} /></Field>
              <Field label="UF"><input maxLength={2} value={f.state} onChange={(e) => set('state', e.target.value.toUpperCase())} /></Field>
            </div>
          </div>
          <Field label="Descrição pública"><textarea rows={2} value={f.description || ''} onChange={(e) => set('description', e.target.value)} /></Field>
        </section>

        <section className="panel stack">
          <h3>Inscrições</h3>
          <div className="grid-3">
            <Field label="Abertura"><input type="date" value={f.registrationOpens || ''} onChange={(e) => set('registrationOpens', e.target.value)} /></Field>
            <Field label="Encerramento"><input type="date" value={f.registrationCloses || ''} onChange={(e) => set('registrationCloses', e.target.value)} /></Field>
            <Field label="Valor por participação" hint={money(f.registrationPrice)}><input type="number" min="0" value={f.registrationPrice} onChange={(e) => set('registrationPrice', e.target.value)} /></Field>
            <Field label="Participações por competidor" hint="0 para sem limite"><input type="number" min="0" value={f.limits?.maxPerCompetitor ?? 0} onChange={(e) => setIn('limits', 'maxPerCompetitor', e.target.value)} /></Field>
            <Field label="Repetições do mesmo trio" hint="1 bloqueia trio duplicado"><input type="number" min="0" value={f.limits?.maxSameTrio ?? 1} onChange={(e) => setIn('limits', 'maxSameTrio', e.target.value)} /></Field>
          </div>
          <Field label="Regulamento aceito na inscrição" hint="Deixe vazio para não exigir aceite"><textarea rows={4} value={f.terms || ''} onChange={(e) => set('terms', e.target.value)} /></Field>
          <p className="muted small">O novo valor vale para inscrições novas. Quem já se inscreveu mantém o valor da época.</p>
        </section>

        <section className="panel stack">
          <h3>Pix do evento</h3>
          <div className="grid-3">
            <Field label="Chave Pix"><input value={f.pix?.key || ''} onChange={(e) => setIn('pix', 'key', e.target.value)} /></Field>
            <Field label="Nome do recebedor"><input value={f.pix?.name || ''} onChange={(e) => setIn('pix', 'name', e.target.value)} /></Field>
            <Field label="Cidade do recebedor"><input value={f.pix?.city || ''} onChange={(e) => setIn('pix', 'city', e.target.value)} /></Field>
          </div>
        </section>

        <section className="panel stack">
          <div className="row-between"><h3>Categorias</h3><Button size="sm" variant="secondary" onClick={() => setEditing('new')}><Plus size={14} /> Categoria</Button></div>
          {cats.map((c) => (
            <div key={c.id} className="cat-line">
              <i style={{ background: c.color }} />
              <b>{c.name}</b>
              <span>Soma {c.maxHandicap}</span>
              <span>{c.qualifyingRuns} passadas, {c.bestTimesCount} melhores</span>
              <span>{c.finalistsCount} na final, {c.finalRuns} passada{c.finalRuns > 1 ? 's' : ''}</span>
              <span>{[TIEBREAKS[c.tiebreak], c.timeLimit ? `limite ${c.timeLimit}s` : null, c.maxAge ? `até ${c.maxAge} anos` : null, c.gender ? GENDERS[c.gender] : null, c.prize?.mode && c.prize.mode !== 'none' ? 'premiação' : null].filter(Boolean).join(' · ')}</span>
              <span className="row-actions">
                <Button size="sm" variant="ghost" onClick={() => setEditing(c)} aria-label="Editar"><Pencil size={14} /></Button>
                <Button size="sm" variant="ghost" onClick={() => run(actions.removeCategory(c.id), 'Categoria removida.')} aria-label="Remover"><Trash2 size={14} /></Button>
              </span>
            </div>
          ))}
        </section>

        <section className="panel stack">
          <h3>Montagem e boiada</h3>
          <div className="grid-3">
            <Field label="Distância mínima" hint="Passadas entre duas participações da mesma pessoa"><input type="number" min="0" value={f.schedule?.minGap ?? 2} onChange={(e) => setIn('schedule', 'minGap', e.target.value)} /></Field>
            <Field label="Ordem das categorias">
              <select value={f.schedule?.mode || 'mixed'} onChange={(e) => setIn('schedule', 'mode', e.target.value)}>
                <option value="mixed">Intercaladas por rodada</option>
                <option value="by_category">Uma categoria de cada vez</option>
              </select>
            </Field>
            <Field label="Boiada">
              <select value={f.cattle?.mode || 'draw'} onChange={(e) => setIn('cattle', 'mode', e.target.value)}>
                {Object.entries(CATTLE_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Boi inicial"><input type="number" min="0" value={f.cattle?.min ?? 0} onChange={(e) => setIn('cattle', 'min', e.target.value)} /></Field>
            <Field label="Boi final"><input type="number" min="0" value={f.cattle?.max ?? 6} onChange={(e) => setIn('cattle', 'max', e.target.value)} /></Field>
          </div>
          <p className="muted small">Vale para o próximo sorteio. Uma montagem publicada não muda. No sorteio na hora, o trio só conhece o boi quando a mesa sorteia ou digita o número da fotocélula.</p>
        </section>

        <section className="panel stack">
          <div className="row-between">
            <h3>Ocorrências de pista</h3>
            <Button size="sm" variant="secondary" onClick={() => set('occurrences', [...(f.occurrences || []), { code: '', label: '', effect: 'no_time', seconds: 0 }])}><Plus size={14} /> Ocorrência</Button>
          </div>
          <p className="muted small">A ordem define o atalho na mesa de pista: Alt 1 para a primeira, Alt 2 para a segunda.</p>
          {(f.occurrences || []).map((o, i) => (
            <div key={i} className="occ-line">
              <kbd>Alt {i + 1}</kbd>
              <input value={o.code} onChange={(e) => setOcc(i, 'code', e.target.value)} placeholder="Código" aria-label="Código" />
              <input value={o.label} onChange={(e) => setOcc(i, 'label', e.target.value)} placeholder="Nome na tela" aria-label="Nome" />
              <select value={o.effect} onChange={(e) => setOcc(i, 'effect', e.target.value)} aria-label="Efeito">
                {Object.entries(OCCURRENCE_EFFECTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              {o.effect === 'penalty' ? <input type="number" value={o.seconds} onChange={(e) => setOcc(i, 'seconds', e.target.value)} aria-label="Segundos" /> : <span />}
              <Button size="sm" variant="ghost" onClick={() => set('occurrences', f.occurrences.filter((_, j) => j !== i))} aria-label="Remover"><Trash2 size={14} /></Button>
            </div>
          ))}
        </section>

        <section className="panel stack">
          <h3>Cópia de segurança</h3>
          <p className="muted">As cópias de segurança e a restauração ficam em <Link className="link" to="/admin/seguranca">Segurança dos dados</Link>, no menu da organização.</p>
        </section>

        <section className="panel stack danger-zone">
          <h3>Excluir evento</h3>
          <p className="muted">Apaga este evento com categorias, inscrições, pagamentos e passadas. Os competidores continuam no cadastro. Não dá para desfazer: baixe uma cópia antes.</p>
          <div className="row-start">
            <Button variant="danger" onClick={() => {
              const typed = window.prompt(`Para excluir, digite o nome do evento:\n${event.name}`)
              if (typed == null) return
              if (run(actions.deleteEvent(event.id, typed), 'Evento excluído.')) location.assign('/admin')
            }}><Trash2 size={15} /> Excluir evento</Button>
          </div>
        </section>
      </div>

      {editing && <CategoryEditor eventId={event.id} category={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
