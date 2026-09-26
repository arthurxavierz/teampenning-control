import React, { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { ExternalLink, Pause, Play, Save } from 'lucide-react'
import { Button, Field, PageHeader, useRun } from '../../components/UI'
import { useStore } from '../../lib/store'

export default function Arena() {
  const { event } = useOutletContext()
  const { actions } = useStore()
  const run = useRun()
  const arena = event.arena || {}
  const [f, setF] = useState({ ...arena, sponsorsText: (arena.sponsors || []).join('\n') })
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const url = `${location.origin}/eventos/${event.slug}/live`

  const save = () => {
    const { sponsorsText, ...rest } = f
    const next = { ...rest, rotationSeconds: Math.max(4, Number(rest.rotationSeconds) || 10), sponsors: sponsorsText.split('\n').map((s) => s.trim()).filter(Boolean) }
    run(actions.updateEvent(event.id, { arena: { ...next, intermission: arena.intermission } }, 'Configuração da Arena atualizada.'), 'Arena atualizada. As telas abertas mudam na hora.')
  }

  const toggleIntermission = () =>
    run(actions.updateEvent(event.id, { arena: { ...arena, intermission: !arena.intermission, intermissionMessage: f.intermissionMessage } }, arena.intermission ? 'Intervalo encerrado na Arena.' : 'Intervalo exibido na Arena.'))

  return (
    <div className="page">
      <PageHeader
        eyebrow="Telão"
        title="Arena Live"
        description="A Arena lê os mesmos dados da mesa de pista. Abra em outra aba ou em outro monitor do mesmo computador e ela acompanha cada lançamento."
        actions={
          <>
            <a className="btn btn-secondary" href={url} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Modo TV</a>
            <a className="btn btn-secondary" href={`${url}?modo=led`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Modo LED</a>
          </>
        }
      />

      <div className={`intermission-bar ${arena.intermission ? 'on' : ''}`}>
        <div>
          <b>{arena.intermission ? 'Intervalo no ar' : 'Placar no ar'}</b>
          <span>{arena.intermission ? 'O telão mostra a tela de intervalo.' : 'O telão mostra classificação, pista e último resultado.'}</span>
        </div>
        <Button onClick={toggleIntermission} variant={arena.intermission ? 'primary' : 'secondary'}>
          {arena.intermission ? <><Play size={15} /> Voltar ao placar</> : <><Pause size={15} /> Mostrar intervalo</>}
        </Button>
      </div>

      <div className="grid-2 align-start">
        <div className="panel stack">
          <h3>Exibição</h3>
          <Field label="Modo padrão" hint="O modo LED usa menos linhas e letras maiores, para painel de baixa resolução.">
            <select value={f.mode} onChange={(e) => set('mode', e.target.value)}>
              <option value="tv">TV e projetor</option>
              <option value="led">Painel de LED</option>
            </select>
          </Field>
          <Field label="Troca de categoria a cada (segundos)"><input type="number" min="4" value={f.rotationSeconds} onChange={(e) => set('rotationSeconds', e.target.value)} /></Field>
          <Field label="Cor de destaque do evento">
            <div className="color-field"><input type="color" value={f.accent || '#D8AF58'} onChange={(e) => set('accent', e.target.value)} /><span className="mono">{f.accent}</span></div>
          </Field>
        </div>
        <div className="panel stack">
          <h3>Intervalo e patrocinadores</h3>
          <Field label="Mensagem de intervalo"><input value={f.intermissionMessage || ''} onChange={(e) => set('intermissionMessage', e.target.value)} /></Field>
          <Field label="Patrocinadores" hint="Um por linha. Eles se revezam no rodapé e aparecem juntos no intervalo.">
            <textarea rows={5} value={f.sponsorsText} onChange={(e) => set('sponsorsText', e.target.value)} />
          </Field>
        </div>
      </div>
      <div className="row-end"><Button onClick={save}><Save size={15} /> Salvar Arena</Button></div>

      <div className="arena-preview">
        <span className="eyebrow">Pré-visualização</span>
        <iframe title="Arena" src={`/eventos/${event.slug}/live`} />
      </div>
    </div>
  )
}
