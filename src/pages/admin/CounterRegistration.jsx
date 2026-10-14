import React, { useState } from 'react'
import { Button, Errors, Field, Horseshoe, Modal } from '../../components/UI'
import TrioSlot, { blankSlot, categoryNeeds, slotFilled, slotToPerson } from '../../components/TrioSlot'
import { useStore } from '../../lib/store'
import { resolveMembers } from '../../lib/rules'
import { money } from '../../lib/utils'

// Lançamento de trio pela organização, como na planilha: o trio chega pelo
// WhatsApp ou no balcão e entra já aceito pelos três. Pode repetir o mesmo
// trio (limite do evento) e fica fora do prazo do site se preciso.
export default function CounterRegistration({ event, onClose, onDone }) {
  const { state, actions } = useStore()
  const cats = state.categories.filter((c) => c.eventId === event.id)
  const [categoryId, setCategoryId] = useState(cats[0]?.id || '')
  const [slots, setSlots] = useState([blankSlot(), blankSlot(), blankSlot()])
  const [copies, setCopies] = useState(1)
  const [paid, setPaid] = useState(false)
  const [method, setMethod] = useState('pix')
  const [errors, setErrors] = useState([])
  const cat = cats.find((c) => c.id === categoryId)
  const needs = categoryNeeds(cat)
  const people = slots.map(slotToPerson)
  const resolved = resolveMembers(state, people)
  const sum = resolved.reduce((s, p) => s + Number(p.handicap || 0), 0)
  const over = cat && sum > Number(cat.maxHandicap)
  const taken = slots.map((s) => s.competitorId).filter(Boolean)
  const filled = slots.every((s) => slotFilled(state, s, { counter: true, needs }))
  const price = Number(event.registrationPrice || 0)

  const submit = (keepOpen) => {
    const res = actions.createRegistration({ eventId: event.id, categoryId, people, byOrganization: true, copies, paidNow: paid, paymentMethod: method })
    if (res.ok === false) return setErrors(res.errors)
    onDone?.(res)
    if (keepOpen) {
      setSlots([blankSlot(), blankSlot(), blankSlot()])
      setCopies(1)
      setErrors([])
    } else onClose()
  }

  return (
    <Modal title="Lançar trio" eyebrow="Balcão da organização" wide onClose={onClose} footer={(
      <div className="row-end">
        <Button variant="ghost" onClick={onClose}>Fechar</Button>
        <Button variant="secondary" disabled={!filled || over} onClick={() => submit(true)}>Lançar e começar outro</Button>
        <Button disabled={!filled || over} onClick={() => submit(false)}>Lançar trio</Button>
      </div>
    )}>
      <div className="stack">
        <div className="grid-3 tight">
          <Field label="Categoria">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name} (soma até {c.maxHandicap})</option>)}
            </select>
          </Field>
          <Field label="Inscrições deste trio" hint={`Limite do evento: ${event.limits?.maxSameTrio || 'sem limite'}`}>
            <input type="number" min="1" max="10" value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} />
          </Field>
          <div className="counter-paid">
            <label className="check">
              <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
              <span>Os três já pagaram ({money(price * copies)} cada)</span>
            </label>
            {paid && (
              <select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Forma de pagamento">
                <option value="pix">Pix</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="cartao">Cartão</option>
                <option value="transferencia">Transferência</option>
              </select>
            )}
          </div>
        </div>
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
              counter
              needs={needs}
              slot={slot}
              taken={taken.filter((id) => id !== slot.competitorId)}
              onChange={(s) => setSlots((list) => list.map((x, j) => (j === i ? s : x)))}
            />
          ))}
        </div>
        <Errors list={errors} />
      </div>
    </Modal>
  )
}
