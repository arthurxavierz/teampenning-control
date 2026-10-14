import React, { useRef, useState } from 'react'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { Button, Errors, Modal } from '../../components/UI'
import { useStore } from '../../lib/store'
import { parseLegacy, planLegacy, readWorkbook } from '../../lib/legacy'
import { money } from '../../lib/utils'

// Traz para o evento as inscrições da planilha de controle usada até hoje.
// Mostra o que vai acontecer antes de gravar.
export default function LegacyImport({ event, onClose, onDone }) {
  const { state, actions } = useStore()
  const input = useRef(null)
  const [plan, setPlan] = useState(null)
  const [fileName, setFileName] = useState('')
  const [errors, setErrors] = useState([])
  const [busy, setBusy] = useState(false)
  const [applySettings, setApplySettings] = useState(true)
  const [importPayments, setImportPayments] = useState(true)
  const [result, setResult] = useState(null)

  const load = async (file) => {
    if (!file) return
    setBusy(true)
    setErrors([])
    try {
      const parsed = parseLegacy(await readWorkbook(file))
      if (parsed.warnings.length) setErrors(parsed.warnings)
      setPlan(planLegacy(state, event.id, parsed))
      setFileName(file.name)
    } catch (err) {
      setErrors([`Não consegui ler o arquivo: ${err.message}`])
    }
    setBusy(false)
  }

  const apply = () => {
    const res = actions.importLegacy(event.id, plan, { applySettings, importPayments })
    if (res.ok === false) return setErrors(res.errors)
    setResult(res)
    onDone?.(res)
  }

  const ready = plan && plan.trios.length > 0
  const withIssues = plan?.trios.filter((t) => t.issues.length) || []

  return (
    <Modal title="Importar planilha" eyebrow="Planilha de controle" onClose={onClose} wide footer={!result && (
      <div className="row-end">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button disabled={!ready} onClick={apply}><FileSpreadsheet size={15} /> Importar {plan?.trios.length || ''} inscrições</Button>
      </div>
    )}>
      {result ? (
        <div className="stack">
          <h3>Importação concluída</h3>
          <div className="kv four">
            <span>Inscrições criadas</span><b>{result.created}</b>
            <span>Ficaram de fora</span><b className={result.failed.length ? 'warn' : ''}>{result.failed.length}</b>
            <span>Categorias criadas</span><b>{result.categoriesCreated.length ? result.categoriesCreated.join(', ') : 'nenhuma'}</b>
            <span>Pagamentos</span><b>{result.paid}</b>
          </div>
          {result.failed.length > 0 && (
            <div className="notice notice-warn">
              {result.failed.slice(0, 12).map((f) => <p key={f.line}>Inscrição {f.line}: {f.error}</p>)}
              {result.failed.length > 12 && <p>e mais {result.failed.length - 12}.</p>}
            </div>
          )}
          <p className="muted small">Competidores novos entraram com o nome da planilha e handicap 0, marcados como declarados. Importe a base CONTEP ou ajuste em Competidores antes do sorteio.</p>
          <div className="row-end"><Button onClick={onClose}>Fechar</Button></div>
        </div>
      ) : (
        <div className="stack">
          <p className="muted">Aceita a planilha de controle de Team Penning (.xlsm ou .xlsx, versão 3.2) com as abas Dados, INSCRIÇÕES e Acerto. As inscrições entram já aceitas pelos três, como no balcão.</p>
          <div className="row-start">
            <Button variant="secondary" disabled={busy} onClick={() => input.current?.click()}><Upload size={15} /> {busy ? 'Lendo' : fileName ? 'Escolher outro arquivo' : 'Escolher arquivo'}</Button>
            {fileName && <span className="muted small">{fileName}</span>}
            <input ref={input} type="file" hidden accept=".xlsm,.xlsx,.xls" onChange={(e) => { load(e.target.files?.[0]); e.target.value = '' }} />
          </div>
          <Errors list={errors} />
          {plan && (
            <>
              <div className="kv four">
                <span>Planilha</span><b>{plan.title || 'sem título'}</b>
                <span>Inscrições</span><b>{plan.trios.length}</b>
                <span>Competidores novos</span><b>{plan.newCompetitors.length}</b>
                <span>Já cadastrados</span><b>{new Set(plan.trios.flatMap((t) => t.members.filter((m) => m.competitorId).map((m) => m.competitorId))).size}</b>
                <span>Categorias a criar</span><b>{plan.missingCategories.length ? plan.missingCategories.join(', ') : 'nenhuma'}</b>
                <span>Pagamentos marcados</span><b>{plan.payments.length}</b>
              </div>
              {withIssues.length > 0 && <div className="notice notice-warn">{withIssues.map((t) => <p key={t.line}>Inscrição {t.line}: {t.issues.join(', ')}</p>)}</div>}
              <label className="check">
                <input type="checkbox" checked={applySettings} onChange={(e) => setApplySettings(e.target.checked)} />
                <span>
                  Usar as regras da planilha: até {plan.limits.maxPerCompetitor || '?'} inscrições por competidor, {plan.limits.maxSameTrio || '?'} do mesmo trio
                  {plan.cattleMax ? `, boiada de 0 a ${plan.cattleMax}` : ''}{plan.price && !Number(event.registrationPrice) ? `, ${money(plan.price)} por participação` : ''}
                </span>
              </label>
              {plan.payments.length > 0 && (
                <label className="check">
                  <input type="checkbox" checked={importPayments} onChange={(e) => setImportPayments(e.target.checked)} />
                  <span>Lançar como recebidos os {plan.payments.length} valores pagos da aba Acerto</span>
                </label>
              )}
              <div className="legacy-preview">
                {plan.trios.slice(0, 8).map((t) => (
                  <div key={t.line}><b>{String(t.line).padStart(3, '0')}</b><span>{t.members.map((m) => m.name).join(' / ')}</span><em>{t.category}</em></div>
                ))}
                {plan.trios.length > 8 && <p className="muted small">e mais {plan.trios.length - 8} inscrições.</p>}
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
