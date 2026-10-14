import React, { useCallback, useEffect, useState } from 'react'
import { KeyRound, Trash2, UserPlus } from 'lucide-react'
import { Button, Errors, Field, PageHeader, useRun } from '../../components/UI'
import { useStore } from '../../lib/store'

const ROLES = { owner: 'Responsável', admin: 'Administração', operator: 'Mesa de pista' }

// Quem pode entrar no painel. A pessoa é cadastrada pelo e-mail e, no
// primeiro acesso, entra com a senha criada para ela no Supabase.
export default function Team() {
  const { session, actions } = useStore()
  const run = useRun()
  const [list, setList] = useState([])
  const [form, setForm] = useState({ email: '', name: '', role: 'admin' })
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState([])
  const load = useCallback(() => actions.listTeam().then(setList), [actions])
  useEffect(() => { load() }, [load])
  const canManage = ['owner', 'admin'].includes(session.admin?.role)

  const add = async (e) => {
    e.preventDefault()
    const res = await actions.addTeamMember(form.email, form.role, form.name)
    if (res.ok === false) return setErrors(res.errors)
    setErrors([])
    setForm({ email: '', name: '', role: 'admin' })
    load()
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Organização" title="Equipe" description="E-mails autorizados a entrar no painel. A senha de cada pessoa é criada no Supabase, em Authentication, com o mesmo e-mail." />
      <div className="grid-2">
        <section className="panel">
          <h3>Quem tem acesso</h3>
          <div className="team-list">
            {list.map((m) => (
              <div className="team-row" key={m.id}>
                <div>
                  <b>{m.display_name || m.email}</b>
                  <small className="muted">{m.email} · {ROLES[m.role] || m.role} · {m.user_id ? 'já entrou' : 'ainda não entrou'}</small>
                </div>
                {canManage && m.email !== session.admin?.email && (
                  <Button size="sm" variant="ghost" onClick={async () => { if (window.confirm(`Tirar o acesso de ${m.email}?`) && await run(actions.removeTeamMember(m.id), 'Acesso removido.')) load() }}><Trash2 size={14} /></Button>
                )}
              </div>
            ))}
          </div>
        </section>
        <div className="stack">
          {canManage && (
            <form className="panel pad stack" onSubmit={add}>
              <h3>Adicionar pessoa</h3>
              <Field label="E-mail"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
              <div className="grid-2 tight">
                <Field label="Nome"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                <Field label="Papel">
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
              </div>
              <Errors list={errors} />
              <Button type="submit"><UserPlus size={15} /> Adicionar</Button>
            </form>
          )}
          <form className="panel pad stack" onSubmit={async (e) => { e.preventDefault(); if (await run(actions.changePassword(password), 'Senha alterada.')) setPassword('') }}>
            <h3>Minha senha</h3>
            <p className="muted small">Entrou como {session.admin?.email}.</p>
            <Field label="Nova senha" hint="Pelo menos 8 caracteres."><input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <Button type="submit" variant="secondary"><KeyRound size={15} /> Trocar senha</Button>
          </form>
        </div>
      </div>
    </div>
  )
}
