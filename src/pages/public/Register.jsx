import React, { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, MessageCircle } from 'lucide-react'
import { Button, Empty, Errors, Gallop, Horseshoe, Loading } from '../../components/UI'
import TrioSlot, { blankSlot as blank, categoryNeeds, slotFilled, slotToPerson } from '../../components/TrioSlot'
import { mode, useStore, usePublicContep, usePublicEvent } from '../../lib/store'
import { GENDERS, registrationWindow, resolveMembers, validateRegistration } from '../../lib/rules'
import { money, whatsappLink } from '../../lib/utils'

export default function Register() {
  const { slug } = useParams()
  const { state, status, actions } = useStore()
  usePublicEvent(slug)
  usePublicContep()
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
  const [busy, setBusy] = useState(false)

  if (!status.ready) return <Loading />
  if (!event) return <section className="section"><Empty title="Evento não encontrado" /></section>
  const win = registrationWindow(event)
  if (!win.open && !doneId) {
    return (
      <section className="section narrow">
        <Empty title="Inscrições indisponíveis" description={win.reason} action={<Link className="btn btn-ghost" to={`/eventos/${event.slug}`}>Voltar ao evento</Link>} />
      </section>
    )
  }

  const people = slots.map(slotToPerson)
  const resolved = resolveMembers(state, people)
  const cat = cats.find((c) => c.id === categoryId) || cats[0]
  const needs = categoryNeeds(cat)
  const sum = resolved.reduce((s, p) => s + Number(p.handicap || 0), 0)
  const over = cat && sum > Number(cat.maxHandicap)
  const taken = slots.map((s) => s.competitorId).filter(Boolean)
  const filled = slots.every((s) => slotFilled(state, s, { counter: false, needs }))

  const next = () => {
    if (step === 1) {
      // No site público em nuvem o navegador não conhece CPF nem idade de quem
      // já é cadastrado; o servidor confere de novo no envio.
      const errs = validateRegistration(state, { eventId: event.id, categoryId: cat?.id, people, termsAccepted: true })
        .filter((e) => !e.includes('regulamento'))
        .filter((e) => mode !== 'cloud' || !/^Informe (a data de nascimento|o sexo)/.test(e) || !people.some((p) => p.competitorId))
      setErrors(errs)
      if (errs.length) return
    }
    setErrors([])
    setStep((s) => s + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const submit = async () => {
    setBusy(true)
    const res = await actions.createRegistration({ eventId: event.id, categoryId: cat?.id, people, creatorIndex: creator, termsAccepted: terms })
    setBusy(false)
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
              <input type="radio" name="cat" checked={c.id === cat?.id} onChange={() => setCategoryId(c.id)} />
              <span className="cat-name">{c.name}</span>
              <strong>{Number(c.maxHandicap) === 0 ? 'Só iniciantes' : `Soma até ${c.maxHandicap}`}</strong>
              <small>{c.qualifyingRuns} passadas · {c.bestTimesCount} melhores tempos{c.timeLimit ? ` · limite ${c.timeLimit}s` : ''}</small>
              {(c.maxAge || c.maxAgeSum || c.gender || c.maxMemberHandicap != null) && (
                <small className="cat-rules">
                  {[c.maxAge && `até ${c.maxAge} anos`, c.maxAgeSum && `soma de idades até ${c.maxAgeSum}`, c.gender && GENDERS[c.gender], c.maxMemberHandicap != null && c.maxMemberHandicap !== '' && `handicap individual até ${c.maxMemberHandicap}`].filter(Boolean).join(' · ')}
                </small>
              )}
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
              <TrioSlot
                key={i}
                index={i}
                needs={needs}
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
          <Button onClick={submit} disabled={busy || (Boolean(event.terms) && !terms)}>{busy ? 'Enviando' : 'Criar trio'}</Button>
        )}
      </div>
    </section>
  )
}
