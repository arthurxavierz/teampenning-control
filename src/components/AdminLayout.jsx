import React, { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  CalendarDays, Database, ExternalLink, FileBarChart, History, LayoutDashboard, Menu, MonitorPlay,
  Settings, Shuffle, Timer, Trophy, Users, Wallet, X, ClipboardList, Mic, ShieldCheck, LogOut, RefreshCw
} from 'lucide-react'
import { mode, useStore } from '../lib/store'
import { Empty, Horseshoe, Loading, StatusBadge } from './UI'
import { eventMetrics } from '../lib/finance'
import AdminLogin from '../pages/admin/Login'

// Situação da gravação no banco. Na pista, mostra se os tempos já subiram.
function SyncPill({ sync }) {
  if (mode !== 'cloud') return null
  const offline = sync.online === false
  const pending = sync.pending > 0
  const label = offline
    ? `Sem conexão${pending ? `: ${sync.pending} na fila` : ''}`
    : pending ? `Enviando ${sync.pending}` : sync.live ? 'Sincronizado' : 'Conectando'
  return (
    <span className={`sync-pill ${offline ? 'is-offline' : pending ? 'is-pending' : ''}`} title={offline ? 'Os lançamentos ficam guardados neste navegador e sobem quando a internet voltar.' : 'Tudo gravado no banco.'}>
      <i />{label}
    </span>
  )
}

export function AdminShell() {
  const { status, session } = useStore()
  if (mode === 'cloud') {
    if (!status.authChecked) return <Loading dark label="Conectando ao banco" />
    if (!session.admin) return <AdminLogin />
    if (!status.ready) return <Loading dark label="Carregando os dados da organização" />
  }
  return <AdminFrame />
}

function AdminFrame() {
  const { state, session, status, actions } = useStore()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const match = pathname.match(/\/admin\/evento\/([^/]+)/)
  const current = state.events.find((e) => e.id === match?.[1]) || state.events.find((e) => e.active)
  const metrics = current ? eventMetrics(state, current.id) : null

  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const base = current ? `/admin/evento/${current.id}` : null
  const eventLinks = base ? [
    [`${base}/visao`, LayoutDashboard, 'Visão do evento'],
    [`${base}/inscricoes`, ClipboardList, 'Inscrições', metrics?.awaitingConfirmation || null],
    [`${base}/financeiro`, Wallet, 'Financeiro', metrics?.reported || null],
    [`${base}/montagem`, Shuffle, 'Montagem'],
    [`${base}/pista`, Timer, 'Operação de pista'],
    [`${base}/locucao`, Mic, 'Locução'],
    [`${base}/ranking`, Trophy, 'Ranking e finais'],
    [`${base}/arena`, MonitorPlay, 'Arena Live'],
    [`${base}/relatorios`, FileBarChart, 'Relatórios'],
    [`${base}/historico`, History, 'Auditoria'],
    [`${base}/configuracoes`, Settings, 'Configurações']
  ] : []

  return (
    <div className="admin">
      {open && <div className="side-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside className={`side ${open ? 'open' : ''}`}>
        <button className="side-close" onClick={() => setOpen(false)} aria-label="Fechar menu"><X size={20} /></button>
        <Link to="/admin" className="side-brand"><img src="/wordmark.png" alt="Achilles" /><small>TEAM PENNING</small></Link>

        <nav className="side-group">
          <NavLink to="/admin" end><CalendarDays size={17} /><span>Central de eventos</span></NavLink>
          <NavLink to="/admin/competidores"><Users size={17} /><span>Competidores</span></NavLink>
          <NavLink to="/admin/contep"><Database size={17} /><span>Base CONTEP</span></NavLink>
          {mode === 'cloud' && <NavLink to="/admin/equipe"><ShieldCheck size={17} /><span>Equipe</span></NavLink>}
        </nav>

        {current && (
          <>
            <div className="side-event">
              <small>EVENTO</small>
              <select value={current.id} onChange={(e) => navigate(`/admin/evento/${e.target.value}/visao`)} aria-label="Trocar evento">
                {state.events.map((e) => <option key={e.id} value={e.id}>{e.name}{e.active ? ' (ativo)' : ''}</option>)}
              </select>
              <StatusBadge status={current.status} />
            </div>
            <nav className="side-group">
              {eventLinks.map(([to, Icon, label, badge]) => (
                <NavLink key={to} to={to}><Icon size={17} /><span>{label}</span>{badge ? <em>{badge}</em> : null}</NavLink>
              ))}
            </nav>
          </>
        )}

        <div className="side-foot">
          {session.admin && (
            <div className="side-user">
              <small className="muted">CONECTADO</small>
              <b>{session.admin.email}</b>
              <button onClick={() => actions.signOut()}><LogOut size={13} /> Sair</button>
            </div>
          )}
          <label className="operator">
            <small>OPERADOR</small>
            <input
              value={session.operator}
              onChange={(e) => actions.setOperator(e.target.value)}
              placeholder="Seu nome"
              aria-label="Nome do operador"
            />
          </label>
          {current && <a href={`/eventos/${current.slug}`} target="_blank" rel="noreferrer"><ExternalLink size={15} />Página pública</a>}
          {current && <a href={`/eventos/${current.slug}/live`} target="_blank" rel="noreferrer"><MonitorPlay size={15} />Abrir Arena</a>}
        </div>
      </aside>

      <div className="workspace">
        <header className="app-top">
          <button className="menu-btn" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu size={20} /></button>
          <div className="app-top-title">
            <b><Horseshoe size={13} /> {current ? current.name.toUpperCase() : 'TEAM PENNING'}</b>
            <span>{current ? `${current.venue || ''} · ${current.city || ''}` : 'Gestão da organização'}</span>
          </div>
          {!session.operator && !session.admin && <span className="top-warning">Informe o operador no menu para assinar os lançamentos</span>}
          <SyncPill sync={status.sync} />
        </header>
        {status.sync?.error && (
          <div className="notice notice-error app-banner">
            {status.sync.error}
            <button className="btn btn-ghost btn-sm" onClick={() => actions.reloadFromServer()}><RefreshCw size={13} /> Recarregar</button>
          </div>
        )}
        {status.error && <div className="notice notice-error app-banner">{status.error}</div>}
        <Outlet />
      </div>
    </div>
  )
}

export function EventAdminShell() {
  const { id } = useParams()
  const { state } = useStore()
  const event = state.events.find((e) => e.id === id)
  if (!event) return <div className="page"><Empty title="Evento não encontrado" description="Volte para a central e escolha outro evento." /></div>
  // A chave recria as telas ao trocar de evento: formulários não herdam dados do anterior.
  return <React.Fragment key={event.id}><Outlet context={{ event }} /></React.Fragment>
}
