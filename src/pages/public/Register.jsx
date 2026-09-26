import React, { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Lock, MessageCircle, Search, UserPlus, X } from 'lucide-react'
import { Button, Empty, Errors, Field, Gallop, Horseshoe } from '../../components/UI'
import { useStore } from '../../lib/store'
import { registrationWindow, resolveMembers, validateRegistration } from '../../lib/rules'
import { contepRecordFor } from '../../lib/contepBase'
import { cleanCpf, formatCpf, formatPhone, isValidCpf, maskCpf, money, normalize, whatsappLink } from '../../lib/utils'

const blank = () => ({ mode: 'search', query: '', competitorId: '', name: '', cpf: '', phone: '', contepCode: '', handicap: 0 })

function Slot({ index, slot, onChange, taken, creator, onCreator }) {
  const { state } = useStore()
  const set = (patch) => onChange({ ...slot, ...patch })
  const picked = slot.competitorId && state.competitors.find((c) => c.id === slot.competitorId)
  const record = slot.mode === 'new' ? contepRecordFor(state, { cpf: slot.cpf, contepCode: slot.contepCode }) : null
  const known = slot.mode === 'new' && isValidCpf(slot.cpf) && state.competitors.find((c) => cleanCpf(c.cpf) === cleanCpf(slot.cpf))

  const results = useMemo(() => {
    const q = normalize(slot.query)
    if (q.length < 2) return []
    const digits = cleanCpf(slot.query)
    return state.competitors
      .filter((c) => !taken.includes(c.id))
      .filter((c) => normalize(c.name).includes(q) || normalize(c.nickname).includes(q) || normalize(c.contepCode).startsWith(q) || (digits.length === 11 && cleanCpf(c.cpf) === digits))
      .slice(0, 6)
  }, [slot.query, state.competitors, taken])

  return (
    <article className={`slot ${picked ? 'is-picked' : ''}`}>
      <header>
        <span className="slot-n">0{index + 1}</span>
        <label className="creator-pick">
          <input type="radio" name="creator" checked={creator} onChange={onCreator} />
          Sou eu
        </label>
      </header>

      {picked ? (
        <div className="picked">
          <strong>{picked.name}</strong>
          <span>{picked.contepCode ? `CONTEP ${picked.contepCode}` : 'Sem código CONTEP'} · {maskCpf(picked.cpf)}</span>
          <div className="hcp-lock"><Lock size={13} /> Handicap {picked.handicap} <small>da base</small></div>
          <button className="link" onClick={() => onChange(blank())}><X size={13} /> Trocar</button>
        </div>
      ) : slot.mode === 'search' ? (
        <div className="slot-search">
          <div className="search-input">
            <Search size={16} />
            <input value={slot.query} onChange={(e) => set({ query: e.target.value })} placeholder="Nome, apelido ou código CONTEP" aria-label={`Buscar competidor ${index + 1}`} />
          </div>
          {results.length > 0 && (
            <ul className="search-results">
              {results.map((c) => (
                <li key={c.id}>
                  <button onClick={() => onChange({ ...blank(), mode: 'picked', competitorId: c.id })}>
                    <b>{c.name}</b>
                    <span>{c.contepCode || 'sem código'} · Hcp {c.handicap} · {maskCpf(c.cpf)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {slot.query.length >= 2 && !results.length && <p className="muted small">Ninguém com esse nome na base.</p>}
          <button className="link" onClick={() => set({ mode: 'new' })}><UserPlus size={14} /> Cadastrar competidor novo</button>
        </div>
      ) : (
        <div className="slot-new">
          <Field label="Nome completo"><input value={slot.name} onChange={(e) => set({ name: e.target.value })} placeholder={record?.name || 'Nome do competidor'} /></Field>
          <Field label="CPF" hint={slot.cpf.length === 11 && !isValidCpf(slot.cpf) ? 'CPF inválido' : null}>
            <input inputMode="numeric" value={formatCpf(slot.cpf)} onChange={(e) => set({ cpf: cleanCpf(e.target.value).slice(0, 11) })} placeholder="000.000.000-00" />
          </Field>
          {known ? (
            <div className="notice notice-info small">
              Este CPF já está cadastrado como {known.name}.{' '}
              <button className="link" onClick={() => onChange({ ...blank(), mode: 'picked', competitorId: known.id })}>Usar cadastro</button>
            </div>
          ) : (
            <>
              <Field label="Celular com DDD" hint="É por ele que o competidor entra na área dele e aceita o convite">
                <input inputMode="tel" value={formatPhone(slot.phone)} onChange={(e) => set({ phone: e.target.value.replace(/\D/g, '').slice(0, 11) })} placeholder="(34) 99999-9999" />
              </Field>
              <div className="inline-2">
                <Field label="Código CONTEP"><input value={slot.contepCode} onChange={(e) => set({ contepCode: e.target.value.toUpperCase() })} placeholder="Opcional" /></Field>
                {record ? (
                  <div className="hcp-lock tall"><Lock size={13} /> Handicap {record.handicap} <small>base CONTEP</small></div>
                ) : (
                  <Field label="Handicap" hint="A organização confere">
                    <input type="number" min="0" max="15" step="0.5" value={slot.handicap} onChange={(e) => set({ handicap: e.target.value })} />
                  </Field>
                )}
              </div>
            </>
          )}
          <button className="link" onClick={() => onChange(blank())}><Search size={13} /> Voltar para a busca</button>
        </div>
      )}
    </article>
  )
}

export default function Register() {
  const { slug } = useParams()
  const { state, actions } = useStore()
  const event = state.events.find((e) => e.slug === slug)
  const cats = state.categories.filter((c) => c.eventId === event?.id)
  const [step, setStep] = useState(0)
  const [categoryId, setCategoryId] = useState(cats[0]?.id || '')
  const [slots, setSlots] = useState([blank(), blank(), blank()])
  const [creator, setCreator] = useState(0)
  const [terms, setTerms] = useState(false)
  const [errors, setErrors] = useState([])
  const [doneId, setDoneId] = useState(null)
  const [invitees, setInvitees] = useState([])

  if (!event) return <section className="section"><Empty title="Evento não encontrado" /></section>
  const win = registrationWindow(event)
  if (!win.open && !doneId) {
    return (
      <section className="section narrow">
        <Empty title="Inscrições indisponíveis" description={win.reason} action={<Link className="btn btn-ghost" to={`/eventos/${event.slug}`}>Voltar ao evento</Link>} />
      </section>
    )
  }

  const people = slots.map((s) => (s.competitorId ? { competitorId: s.competitorId } : { name: s.name, cpf: s.cpf, phone: s.phone, contepCode: s.contepCode, handicap: s.handicap }))
  const resolved = resolveMembers(state, people)
  const cat = cats.find((c) => c.id === categoryId)
  const sum = resolved.reduce((s, p) => s + Number(p.handicap || 0), 0)
  const over = cat && sum > Number(cat.maxHandicap)
  const taken = slots.map((s) => s.competitorId).filter(Boolean)
  const filled = slots.every((s) => s.competitorId || (s.mode === 'new' && isValidCpf(s.cpf) && s.phone.length >= 10 && (s.name || contepRecordFor(state, s))))

  const next = () => {
    if (step === 1) {
      const errs = validateRegistration(state, { eventId: event.id, categoryId, people, termsAccepted: true }).filter((e) => !e.includes('regulamento'))
      setErrors(errs)
      if (errs.length) return
    }
    setErrors([])
    setStep((s) => s + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const submit = () => {
    const res = actions.createRegistration({ eventId: event.id, categoryId, people, creatorIndex: creator, termsAccepted: terms })
    if (res.ok === false) return setErrors(res.errors)
    const creatorName = resolved[creator]?.known?.name || resolved[creator]?.name
    setInvitees(resolved.filter((_, i) => i !== creator).map((p) => ({
      name: p.known?.name || p.name || p.record?.name,
      phone: p.known?.phone || p.phone,
      creatorName
    })))
    setDoneId(res.registrationId)
  }

  if (doneId) {
    const me = resolved[creator]
    return (
      <section className="section narrow">
        <div className="success-card">
          <Gallop />
          <span className="eyebrow">Trio criado</span>
          <h2>Agora faltam os aceites e os pagamentos.</h2>
          <p>{me?.known?.name || me?.name || 'Você'} já está confirmado. Os outros dois integrantes precisam aceitar o convite na área do competidor. Depois, cada CPF paga só a própria participação de {money(event.registrationPrice)} por Pix.</p>
          <div className="notify">
            <b>Avise os parceiros</b>
            {invitees.map((p) => {
              const link = whatsappLink(p.phone, `Olá, ${p.name?.split(' ')[0]}. ${p.creatorName} te colocou num trio da ${event.name}. Para confirmar, entre em ${location.origin}/minha-area com seu CPF e os 4 últimos dígitos do seu celular.`)
              return link
                ? <a key={p.name} className="btn btn-ghost" href={link} target="_blank" rel="noreferrer"><MessageCircle size={16} /> {p.name}</a>
                : <span key={p.name} className="muted small">{p.name}: sem celular cadastrado</span>
            })}
          </div>
          <div className="hero-actions center">
            <Link className="btn btn-primary" to="/minha-area">Abrir minha área</Link>
            <Button variant="ghost" onClick={() => { setSlots([blank(), blank(), blank()]); setStep(0); setTerms(false); setInvitees([]); setDoneId(null) }}>Inscrever outro trio</Button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="section register">
      <div className="section-head">
        <span className="eyebrow"><Link to={`/eventos/${event.slug}`}>{event.name}</Link></span>
        <h1 className="page-title">Nova inscrição</h1>
      </div>

      <ol className="stepper">
        {['Categoria', 'Trio', 'Revisão'].map((label, i) => (
          <li key={label} className={i === step ? 'current' : i < step ? 'done' : ''}><b>{i < step ? <Check size={13} /> : i + 1}</b>{label}</li>
        ))}
      </ol>

      {step === 0 && (
        <div className="cat-pick">
          {cats.map((c) => (
            <label key={c.id} className={`cat-option ${c.id === categoryId ? 'selected' : ''}`} style={{ '--cat': c.color }}>
              <input type="radio" name="cat" checked={c.id === categoryId} onChange={() => setCategoryId(c.id)} />
              <span className="cat-name">{c.name}</span>
              <strong>Soma até {c.maxHandicap}</strong>
              <small>{c.qualifyingRuns} passadas · {c.bestTimesCount} melhores tempos</small>
            </label>
          ))}
        </div>
      )}

      {step === 1 && (
        <>
          <div className={`sum-bar ${over ? 'over' : ''}`}>
            <Horseshoe size={16} />
            <span>Soma do trio</span>
            <b>{sum}</b>
            <span>de {cat?.maxHandicap} na {cat?.name}</span>
          </div>
          <div className="slots">
            {slots.map((slot, i) => (
              <Slot
                key={i}
                index={i}
                slot={slot}
                taken={taken.filter((id) => id !== slot.competitorId)}
                creator={creator === i}
                onCreator={() => setCreator(i)}
                onChange={(s) => setSlots((list) => list.map((x, j) => (j === i ? s : x)))}
              />
            ))}
          </div>
        </>
      )}

      {step === 2 && (
        <div className="review">
          <div className="review-card">
            <span className="cat-name" style={{ '--cat': cat?.color }}>{cat?.name}</span>
            {resolved.map((p, i) => (
              <div key={i} className="review-row">
                <span className="slot-n">0{i + 1}</span>
                <b>{p.known?.name || p.name || p.record?.name}</b>
                <span>Hcp {p.handicap}{p.source === 'declared' ? ' declarado' : ''}</span>
                <em>{i === creator ? 'Cria o trio, já confirmado' : 'Recebe convite'}</em>
              </div>
            ))}
            <div className="review-total"><span>Soma do trio</span><b>{sum} / {cat?.maxHandicap}</b></div>
            <div className="review-total"><span>Valor por participação</span><b>{money(event.registrationPrice)}</b></div>
          </div>
          {event.terms && (
            <div className="terms">
              <h3>Regulamento</h3>
              <p>{event.terms}</p>
              <label className="check"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} /> Li e aceito o regulamento</label>
            </div>
          )}
        </div>
      )}

      <Errors list={errors} />

      <div className="wizard-foot">
        {step > 0 ? <Button variant="ghost" onClick={() => { setErrors([]); setStep((s) => s - 1) }}><ArrowLeft size={16} /> Voltar</Button> : <span />}
        {step < 2 ? (
          <Button onClick={next} disabled={step === 1 && (!filled || over)}>Continuar <ArrowRight size={16} /></Button>
        ) : (
          <Button onClick={submit} disabled={Boolean(event.terms) && !terms}>Criar trio</Button>
        )}
      </div>
    </section>
  )
}
