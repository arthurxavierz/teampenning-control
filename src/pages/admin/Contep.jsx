import React, { useMemo, useRef, useState } from 'react'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { Button, Field, Metric, PageHeader, Tabs, useRun } from '../../components/UI'
import { useStore } from '../../lib/store'
import { buildContepPreview, CONTEP_FIELDS, guessMapping, readSheet } from '../../lib/contep'
import { dateTime, formatCpf } from '../../lib/utils'

const STATUS = {
  update: ['Atualiza', 'ok'],
  unchanged: ['Sem mudança', ''],
  new: ['Novo na base', 'info'],
  conflict: ['Conferir', 'warn'],
  invalid: ['Inválido', 'bad']
}

export default function Contep() {
  const { state, actions } = useStore()
  const run = useRun()
  const input = useRef(null)
  const [sheet, setSheet] = useState(null)
  const [mapping, setMapping] = useState({})
  const [year, setYear] = useState(new Date().getFullYear())
  const [overrides, setOverrides] = useState({})
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(false)

  const preview = useMemo(() => {
    if (!sheet) return []
    return buildContepPreview(state, sheet.rows, mapping).map((item) => ({ ...item, apply: overrides[item.index] ?? item.apply }))
  }, [sheet, mapping, state, overrides])

  const open = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLoading(true)
    try {
      const data = await readSheet(file)
      if (!data.rows.length) throw new Error('A planilha não tem linhas de dados.')
      setSheet({ ...data, fileName: file.name })
      setMapping(guessMapping(data.headers))
      setOverrides({})
    } catch (err) {
      run({ ok: false, errors: [`Não foi possível ler o arquivo. ${err.message || ''}`] })
    } finally {
      setLoading(false)
    }
  }

  const count = (s) => preview.filter((p) => p.status === s).length
  const shown = preview.filter((p) => filter === 'all' || p.status === filter)
  const selected = preview.filter((p) => p.apply && p.status !== 'invalid')

  const apply = () => {
    const res = actions.applyContepImport(selected, { fileName: sheet.fileName, year })
    if (run(res, `Base importada: ${res.updated} competidores atualizados e ${res.added} registros novos.`)) setSheet(null)
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Base anual"
        title="Base CONTEP"
        description="Importe a relação anual em XLSX ou CSV. Nada é gravado antes da conferência. Inscrições já feitas mantêm o handicap da época."
        actions={
          <>
            <input ref={input} type="file" accept=".xlsx,.xls,.csv,.txt" hidden onChange={open} />
            <Button onClick={() => input.current?.click()} disabled={loading}><Upload size={15} /> {loading ? 'Lendo...' : 'Importar planilha'}</Button>
          </>
        }
      />
      <div className="metrics">
        <Metric label="Ano da base" value={state.contep.year} />
        <Metric label="Registros na base" value={state.contep.records.length} />
        <Metric label="Competidores com código" value={state.competitors.filter((c) => c.contepCode).length} />
        <Metric label="Última importação" value={state.contep.importedAt ? new Date(state.contep.importedAt).toLocaleDateString('pt-BR') : 'Nunca'} />
      </div>

      {sheet ? (
        <section className="panel stack">
          <div className="row-between">
            <h3><FileSpreadsheet size={18} /> {sheet.fileName} · {sheet.rows.length} linhas</h3>
            <Button variant="ghost" size="sm" onClick={() => setSheet(null)}>Descartar</Button>
          </div>
          <div className="grid-5">
            {CONTEP_FIELDS.map(([key, label]) => (
              <Field key={key} label={label}>
                <select value={mapping[key] || ''} onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}>
                  <option value="">Não usar</option>
                  {sheet.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </Field>
            ))}
            <Field label="Ano da base"><input type="number" value={year} onChange={(e) => setYear(e.target.value)} /></Field>
          </div>
          <Tabs
            value={filter}
            onChange={setFilter}
            items={[['all', 'Todas', preview.length], ['update', 'Atualizam', count('update')], ['new', 'Novos', count('new')], ['conflict', 'Conferir', count('conflict')], ['invalid', 'Inválidos', count('invalid')], ['unchanged', 'Sem mudança', count('unchanged')]]}
          />
          <div className="table">
            <div className="thead contep-cols"><span /><span>Linha da planilha</span><span>Cadastro no sistema</span><span>Mudança</span><span>Situação</span></div>
            {shown.slice(0, 300).map((p) => (
              <label key={p.index} className={`trow static contep-cols ${p.status}`}>
                <span><input type="checkbox" disabled={p.status === 'invalid'} checked={Boolean(p.apply)} onChange={(e) => setOverrides((o) => ({ ...o, [p.index]: e.target.checked }))} /></span>
                <span><b>{p.name || '(sem nome)'}</b><small>{p.contepCode || 'sem código'}{p.cpf ? ` · ${formatCpf(p.cpf)}` : ''} · hcp {p.handicap ?? '-'}</small></span>
                <span>{p.match ? <><b>{p.match.name}</b><small>por {p.matchBy === 'cpf' ? 'CPF' : p.matchBy === 'code' ? 'código' : 'nome'}</small></> : <small>Sem cadastro. Fica na base para a inscrição.</small>}</span>
                <span className="small">{Object.entries(p.changes).map(([k, [a, b]]) => `${k === 'handicap' ? 'Handicap' : 'Código'}: ${a || '-'} para ${b}`).join(' · ') || '-'}</span>
                <span><em className={`tag tag-${STATUS[p.status][1]}`}>{STATUS[p.status][0]}</em>{p.issues.length > 0 && <small>{p.issues.join('. ')}</small>}</span>
              </label>
            ))}
            {shown.length > 300 && <p className="muted pad">Mostrando 300 de {shown.length} linhas. Todas as marcadas serão aplicadas.</p>}
          </div>
          <div className="row-between">
            <span className="muted">{selected.length} linhas marcadas para aplicar. Linhas em Conferir só entram se você marcar.</span>
            <Button onClick={apply} disabled={!selected.length}>Aplicar importação</Button>
          </div>
        </section>
      ) : (
        <div className="panel">
          <h3>Como funciona</h3>
          <ol className="how">
            <li>O sistema reconhece as colunas de nome, CPF, código e handicap. Você pode trocar o mapeamento.</li>
            <li>Cada linha é associada por CPF e, sem CPF, pelo código CONTEP. Associação só por nome vai para conferência.</li>
            <li>Célula de handicap vazia não zera ninguém. Valores com vírgula, como 1,5, são aceitos.</li>
            <li>Quem está na base mas ainda não tem cadastro entra na inscrição com o handicap oficial pelo código.</li>
          </ol>
        </div>
      )}

      {state.contep.imports.length > 0 && (
        <section className="block">
          <h3 className="block-title">Importações</h3>
          <div className="table">
            {state.contep.imports.map((i) => (
              <div key={i.id} className="trow static imp-cols">
                <span><b>{i.fileName}</b><small>{dateTime(i.at)} · {i.by}</small></span>
                <span>Base {i.year}</span>
                <span>{i.rows} linhas</span>
                <span>{i.updated} atualizados · {i.added} novos</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
