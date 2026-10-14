import { normalize } from './utils.js'

// Importação da planilha de controle usada antes do sistema (TEAM PENNING
// CTM HSF, versão 3.2). Ela traz:
//   Dados        limites por competidor e por trio, categorias, boiada
//   INSCRIÇÕES   uma linha por inscrição: Competidor A, B, C e Categoria
//   Acerto       por competidor: valor total, valor pago
// Os competidores aparecem só pelo nome usado na pista, sem CPF nem handicap.

const findSheet = (sheets, ...names) => {
  const keys = Object.keys(sheets)
  for (const name of names) {
    const hit = keys.find((k) => normalize(k).replace(/\s+/g, '') === normalize(name).replace(/\s+/g, ''))
    if (hit) return sheets[hit]
  }
  return null
}

const cell = (v) => (v == null ? '' : String(v).trim())
const num = (v) => {
  if (typeof v === 'number') return v
  const n = Number(String(v ?? '').replace(/[R$\s.]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export const titleCase = (s) => cell(s).toLowerCase().replace(/(^|\s)(\S)/g, (_, a, b) => a + b.toUpperCase())

// sheets: { nomeDaAba: matriz de linhas }
export function parseLegacy(sheets) {
  const out = { title: '', limits: {}, categories: [], cattleMax: null, trios: [], payments: [], price: null, warnings: [] }

  const dados = findSheet(sheets, 'Dados')
  if (dados) {
    let inCategories = false
    dados.forEach((row) => {
      const label = normalize(cell(row[0]))
      const value = row[1]
      if (label.startsWith('limite por competidor')) out.limits.maxPerCompetitor = num(value)
      else if (label.startsWith('limite por trio')) out.limits.maxSameTrio = num(value)
      else if (label.startsWith('numeracao de boiada')) out.cattleMax = num(value)
      if (label === 'categorias') inCategories = true
      else if (label) inCategories = false
      if (inCategories && cell(value)) out.categories.push(cell(value).toUpperCase())
    })
  }

  const insc = findSheet(sheets, 'INSCRIÇÕES', 'Inscricoes')
  if (!insc) {
    out.warnings.push('A aba INSCRIÇÕES não foi encontrada.')
    return out
  }
  out.title = cell(insc[0]?.[0])
  const headerAt = insc.findIndex((row) => row.some((c) => /^compet(itor|idor) a$/i.test(cell(c))) && row.some((c) => /^categoria$/i.test(cell(c))))
  if (headerAt < 0) {
    out.warnings.push('Não achei as colunas Competidor A, B, C e Categoria.')
    return out
  }
  const header = insc[headerAt].map((c) => normalize(cell(c)))
  const col = (re) => header.findIndex((h) => re.test(h))
  const ia = col(/^compet(itor|idor) a$/)
  const ib = col(/^compet(itor|idor) b$/)
  const ic = col(/^compet(itor|idor) c$/)
  const icat = col(/^categoria$/)
  const inum = col(/^inscricao$/)
  insc.slice(headerAt + 1).forEach((row, i) => {
    const names = [row[ia], row[ib], row[ic]].map(cell)
    if (!names.some(Boolean)) return
    const category = cell(row[icat]).toUpperCase()
    out.trios.push({ line: inum >= 0 && row[inum] ? Number(row[inum]) : i + 1, names, category })
  })

  const acerto = findSheet(sheets, 'Acerto')
  if (acerto) {
    const at = acerto.findIndex((row) => row.some((c) => /^nome$/i.test(cell(c))) && row.some((c) => /valor pago/i.test(cell(c))))
    if (at >= 0) {
      const h = acerto[at].map((c) => normalize(cell(c)))
      const iname = h.indexOf('nome')
      const ipaid = h.findIndex((x) => x === 'valor pago')
      const itotal = h.findIndex((x) => x === 'total')
      const ivalue = h.findIndex((x) => x === 'vr total')
      acerto.slice(at + 1).forEach((row) => {
        const name = cell(row[iname])
        if (!name) return
        const paid = num(row[ipaid])
        if (paid > 0) out.payments.push({ name, paid })
        if (!out.price && itotal >= 0 && ivalue >= 0 && num(row[itotal]) > 0) out.price = Math.round((num(row[ivalue]) / num(row[itotal])) * 100) / 100
      })
    }
  }
  return out
}

// Casa nomes da planilha com o cadastro: nome completo ou apelido iguais,
// sem acento e sem diferença de maiúscula.
export function matchCompetitor(state, name) {
  const key = normalize(name)
  if (!key) return null
  return state.competitors.find((c) => normalize(c.name) === key || normalize(c.nickname) === key) || null
}

export function planLegacy(state, eventId, parsed) {
  const cats = state.categories.filter((c) => c.eventId === eventId)
  const catByName = (name) => cats.find((c) => normalize(c.name) === normalize(name))
  const missingCategories = [...new Set([...parsed.categories, ...parsed.trios.map((t) => t.category)].filter(Boolean))].filter((n) => !catByName(n))
  const newNames = new Map()
  const trios = parsed.trios.map((t) => {
    const members = t.names.map((name) => {
      const known = matchCompetitor(state, name)
      if (!known && name) newNames.set(normalize(name), name)
      return { name, competitorId: known?.id || null }
    })
    const issues = []
    if (members.some((m) => !m.name)) issues.push('Trio incompleto')
    if (new Set(members.map((m) => normalize(m.name))).size < 3) issues.push('Competidor repetido no trio')
    if (!t.category) issues.push('Sem categoria')
    return { ...t, members, categoryId: catByName(t.category)?.id || null, issues }
  })
  return {
    title: parsed.title,
    limits: parsed.limits,
    cattleMax: parsed.cattleMax,
    price: parsed.price,
    missingCategories,
    newCompetitors: [...newNames.values()],
    trios,
    payments: parsed.payments,
    warnings: parsed.warnings
  }
}

export async function readWorkbook(file) {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheets = {}
  wb.SheetNames.forEach((name) => {
    sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: true, blankrows: false })
  })
  return sheets
}
