import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { BRAND } from '../lib/brand'

export function Wordmark({ small = 'TEAM PENNING', to = '/', dark = false }) {
  return (
    <Link to={to} className={`wordmark ${dark ? 'wordmark-dark' : ''}`} aria-label={BRAND.title}>
      <img src={dark ? BRAND.markDark : BRAND.mark} alt={BRAND.name} />
      <small>{small}</small>
    </Link>
  )
}

// Silhueta do galope de "The Horse in Motion" (Muybridge, 1878, domínio
// público). O quadro é uma máscara: a cor vem do CSS, então o mesmo cavalo
// serve no tema claro, no escuro e na Arena.
export function Gallop({ className = '', still = false, label }) {
  return <span className={`gallop ${still ? 'is-still' : ''} ${className}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />
}

export function Horseshoe({ size = 18, className = '' }) {
  return (
    <svg className={`horseshoe ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 21H3.6C2.8 16.5 2.5 12.8 3.5 9.6 4.7 5.6 8 3 12 3s7.3 2.6 8.5 6.6c1 3.2.7 6.9-.1 11.4H18c.6-3.8.8-6.9 0-9.5C17.2 8.4 14.9 6.6 12 6.6s-5.2 1.8-6 4.9c-.8 2.6-.6 5.7 0 9.5Z" fill="currentColor" />
      <g fill="var(--horseshoe-nail, #0b0a08)">
        <circle cx="4.9" cy="15.6" r=".75" /><circle cx="5.1" cy="11.8" r=".75" /><circle cx="7" cy="8.2" r=".75" />
        <circle cx="19.1" cy="15.6" r=".75" /><circle cx="18.9" cy="11.8" r=".75" /><circle cx="17" cy="8.2" r=".75" />
      </g>
    </svg>
  )
}

// Número do boi no formato de marca a ferro: é assim que a pista lê a boiada.
export function CattleBrand({ value, size = 'md' }) {
  const known = value != null && value !== ''
  return <span className={`cattle-brand cattle-${size} ${known ? '' : 'is-unknown'}`} title={known ? `Boi ${value}` : 'Boi a sortear'}><small>BOI</small><b>{known ? value : '?'}</b></span>
}

export function Button({ as: Tag = 'button', variant = 'primary', size, className = '', children, ...props }) {
  const extra = Tag === 'button' && !props.type ? { type: 'button' } : {}
  return <Tag className={`btn btn-${variant} ${size ? `btn-${size}` : ''} ${className}`} {...extra} {...props}>{children}</Tag>
}

const STATUS = {
  draft: 'Rascunho',
  registration_open: 'Inscrições abertas',
  registration_closed: 'Inscrições encerradas',
  in_progress: 'Em andamento',
  finished: 'Finalizado',
  cancelled: 'Cancelado',
  confirmed: 'Confirmado',
  awaiting_payment: 'Aguardando pagamento',
  awaiting_confirmation: 'Aguardando confirmação',
  declined: 'Recusado',
  accepted: 'Aceito',
  pending: 'Pendente',
  paid: 'Pago',
  reported: 'Pagamento informado',
  rejected: 'Não localizado',
  done: 'Lançada',
  qualifying: 'Classificatória',
  final: 'Final',
  runoff: 'Desempate',
  homologated: 'Homologado'
}
export const statusLabel = (s) => STATUS[s] || s

export function StatusBadge({ status, label }) {
  return <span className={`status status-${status}`}>{label || statusLabel(status)}</span>
}

export function Metric({ label, value, meta, tone, icon: Icon }) {
  return (
    <div className={`metric ${tone ? `metric-${tone}` : ''}`}>
      <span>{Icon && <Icon size={15} />}{label}</span>
      <strong>{value}</strong>
      {meta && <small>{meta}</small>}
    </div>
  )
}

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}

export function Empty({ title, description, action }) {
  return (
    <div className="empty">
      <Gallop still />
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  )
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`field ${className}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

export function Errors({ list }) {
  if (!list?.length) return null
  return <div className="notice notice-error" role="alert">{list.map((e) => <p key={e}>{e}</p>)}</div>
}

export function Modal({ title, eyebrow, onClose, children, footer, wide = false }) {
  const ref = useRef(null)
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.querySelector('input,select,textarea,button:not(.modal-close)')?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header>
          <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>
          <button className="modal-close" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  )
}

// Ações que mexem em resultado, dinheiro ou montagem publicada pedem motivo.
// O texto vai para o registro de auditoria junto com quem fez e quando.
export function ReasonDialog({ title, description, confirmLabel = 'Confirmar', danger, onConfirm, onClose, children }) {
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState([])
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    const res = await onConfirm(reason)
    setBusy(false)
    if (res?.ok === false) setErrors(res.errors)
    else onClose()
  }
  return (
    <Modal title={title} eyebrow="Ação auditada" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        {description && <p className="muted">{description}</p>}
        {children}
        <Field label="Motivo">
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Fica registrado no histórico do evento" />
        </Field>
        <Errors list={errors} />
        <div className="row-end">
          <Button variant="ghost" onClick={onClose}>Voltar</Button>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={busy}>{confirmLabel}</Button>
        </div>
      </form>
    </Modal>
  )
}

const ToastContext = createContext(() => {})

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((text, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2)
    setItems((list) => [...list, { id, text, tone }])
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 3600)
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast toast-${t.tone}`}>{t.text}</div>)}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)

// Executa uma ação da store e avisa o resultado. Devolve true quando deu
// certo. Com ação assíncrona (modo nuvem), devolve uma Promise do mesmo valor.
export function useRun() {
  const toast = useToast()
  return useCallback((result, okText) => {
    const handle = (res) => {
      if (res?.ok === false) {
        if (res.errors?.length) toast(res.errors.join(' '), 'error')
        return false
      }
      if (okText) toast(okText)
      return true
    }
    return typeof result?.then === 'function' ? result.then(handle) : handle(result)
  }, [toast])
}

// Tela de espera enquanto os dados chegam do banco.
export function Loading({ label = 'Carregando dados', dark = false }) {
  return (
    <div className={`loading-screen ${dark ? 'is-dark' : ''}`} role="status">
      <Gallop />
      <span>{label}</span>
    </div>
  )
}

export function Tabs({ items, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {items.map(([key, label, extra]) => (
        <button key={key} role="tab" aria-selected={value === key} className={value === key ? 'active' : ''} onClick={() => onChange(key)}>
          {label}{extra != null && <em>{extra}</em>}
        </button>
      ))}
    </div>
  )
}

export function Dots({ values }) {
  return <span className="dots">{values.map((v, i) => <i key={i} className={v} />)}</span>
}
