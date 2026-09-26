import { cleanCpf, isValidCpf, normalize } from './utils.js'

export const CONTEP_FIELDS = [
  ['name', 'Nome', ['nome', 'competidor', 'atleta']],
  ['cpf', 'CPF', ['cpf', 'documento']],
  ['contepCode', 'Código CONTEP', ['codigo', 'cod', 'contep', 'registro']],
  ['handicap', 'Handicap', ['handicap', 'hcp', 'hand', 'nota']]
]

// Lê XLSX, XLS ou CSV. A biblioteca é carregada só quando alguém importa, para
// não pesar o carregamento das outras telas.
// CSV não diz em que codificação está. Exportado pelo Excel em português vem
// em Windows-1252. Salvo por outro programa costuma vir em UTF-8. Tenta UTF-8
// estrito e, se algum byte não fecha, lê como Windows-1252. Assim "José" não
// vira "JosÃ©" e a coluna "Código" continua sendo reconhecida.
export function decodeText(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

export async function readSheet(file) {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const isText = /\.(csv|txt)$/i.test(file.name)
  const wb = isText
    ? XLSX.read(decodeText(buffer), { type: 'string', raw: true })
    : XLSX.read(buffer, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
  const headerIndex = matrix.findIndex((row) => row.filter((c) => String(c).trim()).length >= 2)
  if (headerIndex < 0) return { headers: [], rows: [] }
  const headers = matrix[headerIndex].map((h) => String(h).trim())
  const rows = matrix
    .slice(headerIndex + 1)
    .filter((row) => row.some((c) => String(c).trim()))
    .map((row) => Object.fromEntries(headers.map((h, i) => [h, String(row[i] ?? '').trim()])))
  return { headers, rows }
}

export function guessMapping(headers) {
  const mapping = {}
  CONTEP_FIELDS.forEach(([key, , hints]) => {
    const found = headers.find((h) => hints.some((hint) => normalize(h).includes(hint)) && !Object.values(mapping).includes(h))
    mapping[key] = found || ''
  })
  return mapping
}

// "1,5" e "1.5" viram 1.5. Célula vazia não vira zero: uma coluna em branco
// não pode derrubar o handicap de ninguém.
export function parseHandicap(value) {
  const raw = String(value ?? '').trim().replace(',', '.')
  if (raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : NaN
}

const firstTwo = (name) => normalize(name).split(/\s+/).slice(0, 2).join(' ')

export function buildContepPreview(state, rows, mapping) {
  const byCpf = new Map(state.competitors.map((c) => [cleanCpf(c.cpf), c]))
  const byCode = new Map(state.competitors.filter((c) => c.contepCode).map((c) => [normalize(c.contepCode), c]))

  return rows.map((row, index) => {
    const name = String(row[mapping.name] ?? '').trim()
    const cpf = cleanCpf(row[mapping.cpf] ?? '')
    const contepCode = String(row[mapping.contepCode] ?? '').trim().toUpperCase()
    const handicap = parseHandicap(row[mapping.handicap])
    const issues = []

    if (Number.isNaN(handicap)) issues.push('Handicap inválido')
    if (handicap == null) issues.push('Sem handicap')
    if (cpf && !isValidCpf(cpf)) issues.push('CPF inválido')
    if (!contepCode && !cpf) issues.push('Sem CPF e sem código')

    const viaCpf = cpf && isValidCpf(cpf) ? byCpf.get(cpf) : null
    const viaCode = contepCode ? byCode.get(normalize(contepCode)) : null
    let match = viaCpf || viaCode || null
    let matchBy = viaCpf ? 'cpf' : viaCode ? 'code' : null
    let status = 'new'

    if (viaCpf && viaCode && viaCpf.id !== viaCode.id) {
      issues.push(`CPF aponta para ${viaCpf.name} e código para ${viaCode.name}`)
      status = 'conflict'
    } else if (match && matchBy === 'code' && name && firstTwo(name) !== firstTwo(match.name)) {
      issues.push(`Nome diferente do cadastro: ${match.name}`)
      status = 'conflict'
    }

    if (!match && !cpf && name) {
      const sameName = state.competitors.filter((c) => normalize(c.name) === normalize(name))
      if (sameName.length === 1) {
        match = sameName[0]
        matchBy = 'name'
        status = 'conflict'
        issues.push('Associado só pelo nome. Confira antes de aplicar.')
      }
    }

    const changes = {}
    if (match) {
      if (handicap != null && !Number.isNaN(handicap) && Number(match.handicap) !== handicap) changes.handicap = [match.handicap, handicap]
      if (contepCode && match.contepCode !== contepCode) changes.contepCode = [match.contepCode || '', contepCode]
      if (status !== 'conflict') status = Object.keys(changes).length ? 'update' : 'unchanged'
    }
    if (issues.some((i) => i.startsWith('Handicap inválido') || i.startsWith('Sem CPF'))) status = 'invalid'

    return { index, name, cpf, contepCode, handicap, match, matchBy, changes, issues, status, apply: status === 'update' || status === 'new' }
  })
}
