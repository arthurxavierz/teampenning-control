import React, { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  CalendarDays, Database, ExternalLink, FileBarChart, History, LayoutDashboard, Menu, MonitorPlay,
  Settings, Shuffle, Timer, Trophy, Users, Wallet, X, ClipboardList, Mic
} from 'lucide-react'
import { useStore } from '../lib/store'
import { Empty, Horseshoe, StatusBadge } from './UI'
import { eventMetrics } from '../lib/finance'

export function AdminShell() {
  const { state, session, actions } = useStore()
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
          {!session.operator && <span className="top-warning">Informe o operador no menu para assinar os lançamentos</span>}
        </header>
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
