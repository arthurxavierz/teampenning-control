import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, AlertTriangle, Clock3, FolderOpen, HardDriveDownload, RotateCcw, Upload } from 'lucide-react'
import { Button, PageHeader, useRun } from '../../components/UI'
import { mode, useStore } from '../../lib/store'
import { dateTime } from '../../lib/utils'
import {
  BACKUP_EVERY_DAYS, KEEPALIVE_LATE_DAYS, backupFolderName, backupOverdue, canPickFolder, chooseBackupFolder, daysSince, saveBackupFile
} from '../../lib/backup'

const ago = (days) => (days === 0 ? 'hoje' : days === 1 ? 'ontem' : `há ${days} dias`)

function Status({ tone, icon: Icon, children }) {
  return <div className={`safety-status is-${tone}`}><Icon size={18} /><span>{children}</span></div>
}

// Botão de cópia reaproveitado no aviso da Central de eventos.
export function useSaveBackup() {
  const { actions } = useStore()
  const run = useRun()
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      const { name, place } = await saveBackupFile(actions.exportBackup())
      await run(actions.markBackup(), `Cópia salva: ${name}, na ${place}.`)
    } finally {
      setBusy(false)
    }
  }
  return { save, busy }
}

export function BackupReminder() {
  const { state } = useStore()
  const { save, busy } = useSaveBackup()
  const settings = state.organizations[0]?.settings
  if (!backupOverdue(settings)) return null
  const days = daysSince(settings?.lastBackupAt)
  return (
    <div className="notice notice-warn">
      <p>{days == null ? 'Ainda não há nenhuma cópia de segurança salva neste computador.' : `A última cópia de segurança foi ${ago(days)}.`} Salve uma agora, leva um segundo.</p>
      <Button size="sm" onClick={save} disabled={busy}><HardDriveDownload size={14} /> Salvar cópia</Button>
      <Link className="link" to="/admin/seguranca">Como funciona</Link>
    </div>
  )
}

export default function DataSafety() {
  const { state, actions } = useStore()
  const run = useRun()
  const { save, busy } = useSaveBackup()
  const input = useRef(null)
  const [folder, setFolder] = useState('')
  useEffect(() => { backupFolderName().then(setFolder) }, [])

  const settings = state.organizations[0]?.settings || {}
  const aliveDays = daysSince(settings.keepAliveAt)
  const backupDays = daysSince(settings.lastBackupAt)
  const overdue = backupOverdue(settings)

  const pick = async () => {
    try { setFolder(await chooseBackupFolder()) } catch { /* fechou a janela sem escolher */ }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Organização"
        title="Segurança dos dados"
        description="Duas rotinas cuidam do sistema: uma mantém o banco ligado sozinha, a outra guarda uma cópia de tudo no seu computador."
      />

      <div className="grid-2 safety">
        {mode === 'cloud' && (
          <section className="panel pad stack">
            <small className="eyebrow">1. AUTOMÁTICO</small>
            <h3>Sistema sempre ligado</h3>
            {aliveDays == null
              ? <Status tone="wait" icon={Clock3}>Aguardando o primeiro acesso automático, que roda todo dia às 6h.</Status>
              : aliveDays < KEEPALIVE_LATE_DAYS
                ? <Status tone="ok" icon={CheckCircle2}>Funcionando. Último acesso automático: {dateTime(settings.keepAliveAt)} ({ago(aliveDays)}).</Status>
                : <Status tone="warn" icon={AlertTriangle}>O acesso automático não roda desde {dateTime(settings.keepAliveAt)}. Avise o suporte.</Status>}
            <p className="muted">
              O banco de dados é gratuito e desliga sozinho quando passa uma semana sem uso. Entre uma etapa e outra isso
              aconteceria. Para evitar, o servidor acessa o banco todo dia às 6h da manhã.
            </p>
            <p className="muted"><b>Você não precisa fazer nada.</b> Se um dia este quadro ficar amarelo, avise o suporte.</p>
          </section>
        )}

        <section className="panel pad stack">
          <small className="eyebrow">{mode === 'cloud' ? '2. TODA SEMANA' : 'TODA SEMANA'}</small>
          <h3>Cópia de segurança</h3>
          {backupDays == null
            ? <Status tone="warn" icon={AlertTriangle}>Nenhuma cópia salva ainda.</Status>
            : overdue
              ? <Status tone="warn" icon={AlertTriangle}>Última cópia {ago(backupDays)} ({dateTime(settings.lastBackupAt)}). Hora de salvar outra.</Status>
              : <Status tone="ok" icon={CheckCircle2}>Em dia. Última cópia {ago(backupDays)}, por {settings.lastBackupBy}.</Status>}
          <Button className="safety-cta" onClick={save} disabled={busy}><HardDriveDownload size={17} /> {busy ? 'Salvando' : 'Salvar cópia agora'}</Button>

          <ol className="safety-steps">
            <li>Uma vez por semana, e sempre no fim de cada etapa, clique em <b>Salvar cópia agora</b>.</li>
            <li>
              O arquivo vai para {folder ? <>a pasta <b>{folder}</b></> : <>a pasta <b>Downloads</b></>} deste computador, com a data
              no nome (ex.: copia-team-penning-2026-10-19.json). Ele guarda eventos, inscrições, pagamentos, tempos e resultados.
            </li>
            <li>Não apague esses arquivos. De vez em quando, copie a pasta para um pendrive ou para o Google Drive.</li>
          </ol>

          {canPickFolder() ? (
            <div className="safety-folder">
              <FolderOpen size={16} />
              <span>{folder ? <>Pasta das cópias: <b>{folder}</b></> : 'Recomendado: escolha uma pasta fixa, por exemplo Documentos > Cópias Team Penning.'}</span>
              <Button size="sm" variant="secondary" onClick={pick}>{folder ? 'Trocar pasta' : 'Escolher pasta'}</Button>
            </div>
          ) : (
            <p className="muted">Neste navegador a cópia vai sempre para Downloads. Mova os arquivos para uma pasta fixa, como Documentos &gt; Cópias Team Penning.</p>
          )}
          <p className="muted">Quando a última cópia passar de {BACKUP_EVERY_DAYS} dias, a Central de eventos mostra um aviso.</p>
        </section>
      </div>

      <section className="panel pad stack danger-zone">
        <h3>Restaurar uma cópia</h3>
        <p className="muted">
          {mode === 'cloud'
            ? 'Use só com o suporte. Carregar uma cópia soma ao banco tudo o que está nela, sem apagar nada do que já existe.'
            : 'Este protótipo guarda tudo no navegador. Carregar uma cópia substitui os dados daqui. Restaurar a demonstração apaga as alterações.'}
        </p>
        <div className="row-start">
          <Button variant="secondary" onClick={() => input.current?.click()}><Upload size={15} /> Carregar cópia</Button>
          <input ref={input} type="file" accept=".json,application/json" hidden onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            if (!confirm(mode === 'cloud' ? 'Somar ao banco tudo o que está nesta cópia?' : 'Substituir todos os dados deste navegador pela cópia?')) return
            if (run(actions.importBackup(await file.text()), 'Cópia carregada.')) location.assign('/admin')
          }} />
          {mode === 'local' && <Button variant="danger" onClick={() => { if (confirm('Apagar todas as alterações e restaurar a demonstração?')) { actions.reset(); location.assign('/admin') } }}><RotateCcw size={15} /> Restaurar demonstração</Button>}
        </div>
      </section>
    </div>
  )
}
