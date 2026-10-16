import React, { useState } from 'react'
import { LogIn } from 'lucide-react'
import { Button, Errors, Field } from '../../components/UI'
import { useStore } from '../../lib/store'
import { BRAND } from '../../lib/brand'

// Entrada da organização (modo nuvem). Quem entra precisa estar na equipe,
// cadastrada pelo e-mail em Equipe ou direto no banco.
export default function AdminLogin() {
  const { actions } = useStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState([])
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErrors([])
    const res = await actions.signIn(email, password)
    setBusy(false)
    if (res?.ok === false) setErrors(res.errors)
  }

  return (
    <div className="admin admin-login">
      <form className="admin-login-card" onSubmit={submit}>
        <img className="login-logo" src={BRAND.logoDark} alt={BRAND.name} />
        <div>
          <span className="eyebrow">Organização</span>
          <h1>Entrar no painel</h1>
          <p className="muted">Inscrições, financeiro, montagem, pista e Arena do seu evento.</p>
        </div>
        <Field label="E-mail"><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="Senha"><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        <Errors list={errors} />
        <Button type="submit" disabled={busy}><LogIn size={15} /> {busy ? 'Entrando' : 'Entrar'}</Button>
        <a className="muted small" href="/">Voltar ao site</a>
      </form>
    </div>
  )
}
