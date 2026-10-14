import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import PublicLayout from './components/PublicLayout'
import PublicGate from './components/PublicGate'
import { AdminShell, EventAdminShell } from './components/AdminLayout'
import Home from './pages/public/Home'
import EventPage from './pages/public/EventPage'
import Register from './pages/public/Register'
import Results from './pages/public/Results'
import MyArea from './pages/public/MyArea'
import LiveArena from './pages/public/LiveArena'
import Dashboard from './pages/admin/Dashboard'
import Competitors from './pages/admin/Competitors'
import Contep from './pages/admin/Contep'
import Overview from './pages/admin/Overview'
import Registrations from './pages/admin/Registrations'
import Finance from './pages/admin/Finance'
import Schedule from './pages/admin/Schedule'
import Operation from './pages/admin/Operation'
import Ranking from './pages/admin/Ranking'
import Arena from './pages/admin/Arena'
import Narrator from './pages/admin/Narrator'
import Reports from './pages/admin/Reports'
import Audit from './pages/admin/Audit'
import Settings from './pages/admin/Settings'
import Team from './pages/admin/Team'

export function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<PublicGate><Home /></PublicGate>} />
        <Route path="/eventos/:slug" element={<PublicGate><EventPage /></PublicGate>} />
        <Route path="/eventos/:slug/inscrever" element={<PublicGate><Register /></PublicGate>} />
        <Route path="/eventos/:slug/resultados" element={<PublicGate><Results /></PublicGate>} />
        <Route path="/minha-area" element={<PublicGate><MyArea /></PublicGate>} />
      </Route>
      <Route path="/eventos/:slug/live" element={<PublicGate dark><LiveArena /></PublicGate>} />
      <Route path="/admin" element={<AdminShell />}>
        <Route index element={<Dashboard />} />
        <Route path="competidores" element={<Competitors />} />
        <Route path="contep" element={<Contep />} />
        <Route path="equipe" element={<Team />} />
        <Route path="evento/:id" element={<EventAdminShell />}>
          <Route index element={<Navigate to="visao" replace />} />
          <Route path="visao" element={<Overview />} />
          <Route path="inscricoes" element={<Registrations />} />
          <Route path="financeiro" element={<Finance />} />
          <Route path="montagem" element={<Schedule />} />
          <Route path="pista" element={<Operation />} />
          <Route path="ranking" element={<Ranking />} />
          <Route path="locucao" element={<Narrator />} />
          <Route path="arena" element={<Arena />} />
          <Route path="relatorios" element={<Reports />} />
          <Route path="historico" element={<Audit />} />
          <Route path="configuracoes" element={<Settings />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
