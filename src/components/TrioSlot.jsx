import React, { useMemo } from 'react'
import { Lock, Search, UserPlus, X } from 'lucide-react'
import { Field } from './UI'
import { useStore } from '../lib/store'
import { contepRecordFor } from '../lib/contepBase'
import { GENDERS } from '../lib/rules'
import { cleanCpf, cpfHint, formatCpf, formatPhone, isValidCpf, normalize } from '../lib/utils'

// Um dos três integrantes do trio: busca na base ou cadastro novo. Usado no
// formulário público e no lançamento pelo balcão da organização (counter),
// onde CPF e celular podem ficar para depois.

export const blankSlot = () => ({ mode: 'search', query: '', competitorId: '', name: '', nickname: '', cpf: '', phone: '', contepCode: '', handicap: 0, birthDate: '', gender: '' })

export const slotToPerson = (s) => (s.competitorId
  ? { competitorId: s.competitorId, birthDate: s.birthDate || undefined, gender: s.gender || undefined }
  : { name: s.name, nickname: s.nickname, cpf: s.cpf, phone: s.phone, contepCode: s.contepCode, handicap: s.handicap, birthDate: s.birthDate, gender: s.gender })

// O que a categoria exige além da soma.
export const categoryNeeds = (cat) => ({ age: Number(cat?.maxAge) > 0 || Number(cat?.maxAgeSum) > 0, gender: Boolean(cat?.gender) })

export function slotFilled(state, s, { counter, needs }) {
  const picked = s.competitorId && state.competitors.find((c) => c.id === s.competitorId)
  const ageOk = !needs.age || picked?.birthDate || s.birthDate
  const genderOk = !needs.gender || picked?.gender || s.gender
  if (picked) return Boolean(ageOk && genderOk)
  if (s.mode !== 'new') return false
  const named = s.name || contepRecordFor(state, s)
  if (counter) return Boolean(named && (!s.cpf || isValidCpf(s.cpf)) && ageOk && genderOk)
  return Boolean(named && isValidCpf(s.cpf) && s.phone.length >= 10 && ageOk && genderOk)
}

function Extras({ slot, set, needs, picked }) {
  const askAge = needs.age && !picked?.birthDate
  const askGender = needs.gender && !picked?.gender
  if (!askAge && !askGender) return null
  return (
    <div className="inline-2">
      {askAge && <Field label="Nascimento" hint="A categoria tem limite de idade"><input type="date" value={slot.birthDate} onChange={(e) => set({ birthDate: e.target.value })} /></Field>}
      {askGender && (
        <Field label="Sexo">
          <select value={slot.gender} onChange={(e) => set({ gender: e.target.value })}>
            <option value="">Escolha</option>
            {Object.entries(GENDERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      )}
    </div>
  )
}

export default function TrioSlot({ index, slot, onChange, taken, creator, onCreator, counter = false, needs = { age: false, gender: false } }) {
  const { state } = useStore()
  const set = (patch) => onChange({ ...slot, ...patch })
  const picked = slot.competitorId && state.competitors.find((c) => c.id === slot.competitorId)
  const record = slot.mode === 'new' ? contepRecordFor(state, { cpf: slot.cpf, contepCode: slot.contepCode }) : null
  const known = slot.mode === 'new' && isValidCpf(slot.cpf) && state.competitors.find((c) => c.cpf && cleanCpf(c.cpf) === cleanCpf(slot.cpf))

  const results = useMemo(() => {
    const q = normalize(slot.query)
    if (q.length < 2) return []
    const digits = cleanCpf(slot.query)
    return state.competitors
      .filter((c) => !taken.includes(c.id))
      .filter((c) => normalize(c.name).includes(q) || normalize(c.nickname).includes(q) || normalize(c.contepCode).startsWith(q) || (digits.length === 11 && c.cpf && cleanCpf(c.cpf) === digits))
      .slice(0, counter ? 8 : 6)
  }, [slot.query, state.competitors, taken, counter])

  return (
    <article className={`slot ${picked ? 'is-picked' : ''}`}>
      <header>
        <span className="slot-n">0{index + 1}</span>
        {onCreator && (
          <label className="creator-pick">
            <input type="radio" name="creator" checked={creator} onChange={onCreator} />
            Sou eu
          </label>
        )}
      </header>

      {picked ? (
        <div className="picked">
          <strong>{picked.name}</strong>
          <span>{[picked.nickname && picked.nickname !== picked.name.split(' ')[0] ? picked.nickname : null, picked.contepCode ? `CONTEP ${picked.contepCode}` : 'Sem código CONTEP', cpfHint(picked)].filter(Boolean).join(' · ')}</span>
          <div className="hcp-lock"><Lock size={13} /> Handicap {picked.handicap} <small>da base</small></div>
          <Extras slot={slot} set={set} needs={needs} picked={picked} />
          <button className="link" onClick={() => onChange(blankSlot())}><X size={13} /> Trocar</button>
        </div>
      ) : slot.mode !== 'new' ? (
        <div className="slot-search">
          <div className="search-input">
            <Search size={16} />
            <input value={slot.query} onChange={(e) => set({ query: e.target.value })} placeholder={counter ? 'Nome, apelido, CONTEP ou CPF' : 'Nome, apelido ou código CONTEP'} aria-label={`Buscar competidor ${index + 1}`} />
          </div>
          {results.length > 0 && (
            <ul className="search-results">
              {results.map((c) => (
                <li key={c.id}>
                  <button onClick={() => onChange({ ...blankSlot(), mode: 'picked', competitorId: c.id })}>
                    <b>{c.name}{c.nickname && normalize(c.nickname) !== normalize(c.name.split(' ')[0]) ? ` (${c.nickname})` : ''}</b>
                    <span>{c.contepCode || 'sem código'} · Hcp {c.handicap}{cpfHint(c) ? ` · ${cpfHint(c)}` : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {slot.query.length >= 2 && !results.length && <p className="muted small">Ninguém com esse nome na base.</p>}
          <button className="link" onClick={() => set({ mode: 'new', name: results.length ? '' : slot.query })}><UserPlus size={14} /> Cadastrar competidor novo</button>
        </div>
      ) : (
        <div className="slot-new">
          <Field label={counter ? 'Nome' : 'Nome completo'}><input value={slot.name} onChange={(e) => set({ name: e.target.value })} placeholder={record?.name || 'Nome do competidor'} /></Field>
          {counter && <Field label="Apelido" hint="Como é chamado na pista"><input value={slot.nickname} onChange={(e) => set({ nickname: e.target.value })} /></Field>}
          <Field label={counter ? 'CPF (opcional)' : 'CPF'} hint={slot.cpf.length === 11 && !isValidCpf(slot.cpf) ? 'CPF inválido' : null}>
            <input inputMode="numeric" value={formatCpf(slot.cpf)} onChange={(e) => set({ cpf: cleanCpf(e.target.value).slice(0, 11) })} placeholder="000.000.000-00" />
          </Field>
          {known ? (
            <div className="notice notice-info small">
              Este CPF já está cadastrado como {known.name}.{' '}
              <button className="link" onClick={() => onChange({ ...blankSlot(), mode: 'picked', competitorId: known.id })}>Usar cadastro</button>
            </div>
          ) : (
            <>
              <Field label={counter ? 'Celular (opcional)' : 'Celular com DDD'} hint={counter ? null : 'É por ele que o competidor entra na área dele e aceita o convite'}>
                <input inputMode="tel" value={formatPhone(slot.phone)} onChange={(e) => set({ phone: e.target.value.replace(/\D/g, '').slice(0, 11) })} placeholder="(34) 99999-9999" />
              </Field>
              <div className="inline-2">
                <Field label="Código CONTEP"><input value={slot.contepCode} onChange={(e) => set({ contepCode: e.target.value.toUpperCase() })} placeholder="Opcional" /></Field>
                {record ? (
                  <div className="hcp-lock tall"><Lock size={13} /> Handicap {record.handicap} <small>base CONTEP</small></div>
                ) : (
                  <Field label="Handicap" hint={counter ? 'Iniciante é 0' : 'A organização confere'}>
                    <input type="number" min="0" max="15" step="0.5" value={slot.handicap} onChange={(e) => set({ handicap: e.target.value })} />
                  </Field>
                )}
              </div>
              <Extras slot={slot} set={set} needs={needs} />
            </>
          )}
          <button className="link" onClick={() => onChange(blankSlot())}><Search size={13} /> Voltar para a busca</button>
        </div>
      )}
    </article>
  )
}
