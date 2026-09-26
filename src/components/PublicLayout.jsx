import React, { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { Gallop, Horseshoe, Wordmark } from './UI'

export default function PublicLayout() {
  const { state } = useStore()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { pathname } = useLocation()
  const active = state.events.find((e) => e.active)

  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="public">
      <header className={`public-nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="nav-shell">
          <Wordmark />
          <nav className={open ? 'open' : ''}>
            <NavLink to="/" end>Eventos</NavLink>
            {active && <NavLink to={`/eventos/${active.slug}/resultados`}>Resultados</NavLink>}
            {active && <NavLink to={`/eventos/${active.slug}/live`}>Arena Live</NavLink>}
            <NavLink to="/minha-area">Minha área</NavLink>
            <Link to="/admin" className="nav-admin">Organização</Link>
          </nav>
          <button className="nav-toggle" onClick={() => setOpen((v) => !v)} aria-label={open ? 'Fechar menu' : 'Abrir menu'} aria-expanded={open}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>
      <main key={pathname} className="public-main">
        <Outlet />
      </main>
      <footer className="public-footer">
        <div className="fence" aria-hidden="true" />
        <div className="footer-inner">
          <div className="footer-brand">
            <Wordmark />
            <p>Gestão de Team Penning da inscrição ao último tempo. Um produto Achilles Media.</p>
          </div>
          <div className="footer-horse">
            <Gallop />
            <small>Silhuetas de The Horse in Motion, Eadweard Muybridge, 1878. Domínio público.</small>
          </div>
          <div className="footer-links">
            <Link to="/">Eventos</Link>
            <Link to="/minha-area">Minha área</Link>
            <Link to="/admin">Área da organização</Link>
            <span><Horseshoe size={14} /> Achilles Media</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
