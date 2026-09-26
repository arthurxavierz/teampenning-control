import React, { useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Download, Pencil, Plus, RotateCcw, Save, Trash2, Upload } from 'lucide-react'
import { Button, Errors, Field, Modal, PageHeader, useRun } from '../../components/UI'
import { useStore } from '../../lib/store'
import { OCCURRENCE_EFFECTS, TIEBREAKS } from '../../lib/defaults'
import { money } from '../../lib/utils'

function CategoryEditor({ eventId, category, onClose }) {
  const { actions } = useStore()
  const [c, setC] = useState(category || { name: '', maxHandicap: 0, qualifyingRuns: 4, bestTimesCount: 2, finalistsCount: 10, finalRuns: 1, carryQualifying: true, tiebreak: 'best_single', color: '#D8AF58' })
  const [errors, setErrors] = useState([])
  const set = (k, v) => setC((s) => ({ ...s, [k]: v }))
  const submit = (e) => {
    e.preventDefault()
    const res = actions.saveCategory(eventId, c)
    if (res.ok === false) return setErrors(res.errors)
    onClose()
  }
  return (
    <Modal title={category ? `Editar ${category.name}` : 'Nova categoria'} eyebrow="Categoria" onClose={onClose} wide>
      <form onSubmit={submit} className="stack">
        <div className="grid-3">
          <Field label="Nome"><input value={c.name} onChange={(e) => set('name', e.target.value.toUpperCase())} /></Field>
          <Field label="Soma máxima de handicap"><input type="number" step="0.5" value={c.maxHandicap} onChange={(e) => set('maxHandicap', e.target.value)} /></Field>
          <Field label="Cor"><input type="color" value={c.color} onChange={(e) => set('color', e.target.value)} /></Field>
          <Field label="Passadas classificatórias"><input type="number" min="1" value={c.qualifyingRuns} onChange={(e) => set('qualifyingRuns', e.target.value)} /></Field>
          <Field label="Melhores tempos somados"><input type="number" min="1" value={c.bestTimesCount} onChange={(e) => set('bestTimesCount', e.target.value)} /></Field>
          <Field label="Classificados para a final"><input type="number" min="0" value={c.finalistsCount} onChange={(e) => set('finalistsCount', e.target.value)} /></Field>
          <Field label="Passadas da final"><input type="number" min="1" value={c.finalRuns} onChange={(e) => set('finalRuns', e.target.value)} /></Field>
          <Field label="Na final">
            <select value={c.carryQualifying ? 'carry' : 'zero'} onChange={(e) => set('carryQualifying', e.target.value === 'carry')}>
              <option value="carry">Soma com a classificatória</option>
              <option value="zero">Começa do zero</option>
            </select>
          </Field>
          <Field label="Desempate">
            <select value={c.tiebreak} onChange={(e) => set('tiebreak', e.target.value)}>
              {Object.entries(TIEBREAKS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
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
  const backupInput = useRef(null)
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
              <span>{TIEBREAKS[c.tiebreak]}</span>
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
                <option value="draw">Sorteada, sem repetir boi no mesmo trio</option>
                <option value="sequential">Sequencial</option>
              </select>
            </Field>
            <Field label="Boi inicial"><input type="number" min="0" value={f.cattle?.min ?? 0} onChange={(e) => setIn('cattle', 'min', e.target.value)} /></Field>
            <Field label="Boi final"><input type="number" min="0" value={f.cattle?.max ?? 6} onChange={(e) => setIn('cattle', 'max', e.target.value)} /></Field>
          </div>
          <p className="muted small">Vale para o próximo sorteio. Uma montagem publicada não muda.</p>
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

        <section className="panel stack danger-zone">
          <h3>Dados do protótipo</h3>
          <p className="muted">Este protótipo guarda tudo no navegador. Para testar em outro computador, baixe o backup aqui e carregue lá. Restaurar a demonstração apaga as alterações.</p>
          <div className="row-start">
            <Button variant="secondary" onClick={() => {
              const blob = new Blob([actions.exportBackup()], { type: 'application/json' })
              const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `team-penning-backup-${new Date().toISOString().slice(0, 10)}.json` })
              a.click()
              setTimeout(() => URL.revokeObjectURL(a.href), 1000)
            }}><Download size={15} /> Baixar backup</Button>
            <Button variant="secondary" onClick={() => backupInput.current?.click()}><Upload size={15} /> Carregar backup</Button>
            <input ref={backupInput} type="file" accept=".json,application/json" hidden onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              if (!confirm('Substituir todos os dados deste navegador pelo backup?')) return
              if (run(actions.importBackup(await file.text()), 'Backup carregado.')) location.assign('/admin')
            }} />
            <Button variant="danger" onClick={() => { if (confirm('Apagar todas as alterações e restaurar a demonstração?')) { actions.reset(); location.assign('/admin') } }}><RotateCcw size={15} /> Restaurar demonstração</Button>
          </div>
        </section>
      </div>

      {editing && <CategoryEditor eventId={event.id} category={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
