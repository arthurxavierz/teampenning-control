export const money = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))

export const time = (value) => (value == null ? 'Sem tempo' : `${Number(value).toFixed(3)}s`)

export const dateBr = (value) =>
  value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(`${value}T12:00:00`)) : ''

export const shortDate = (value) =>
  value ? new Intl.DateTimeFormat('pt-BR').format(new Date(`${value}T12:00:00`)) : ''

export const dateTime = (value) =>
  value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : ''

export const uid = (prefix = 'id') =>
  `${prefix}_${globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2)}`

export const nowIso = () => new Date().toISOString()

// Data local no formato YYYY-MM-DD. toISOString daria a data em UTC, que no
// Brasil vira o dia seguinte depois das 21h.
export const todayIso = (base = new Date()) => {
  const d = new Date(base)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const addDays = (iso, days) => {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return todayIso(d)
}

export const cleanCpf = (cpf = '') => String(cpf).replace(/\D/g, '')

export const formatCpf = (cpf = '') => {
  const d = cleanCpf(cpf).slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

// Mostra só o miolo do CPF. Serve para telas públicas em que a pessoa precisa
// reconhecer um competidor sem que o documento inteiro fique exposto.
export const maskCpf = (cpf = '') => {
  const d = cleanCpf(cpf)
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : ''
}

function cpfDigit(digits) {
  const factor = digits.length + 1
  const sum = digits.split('').reduce((acc, n, i) => acc + Number(n) * (factor - i), 0)
  const rest = (sum * 10) % 11
  return rest === 10 ? 0 : rest
}

export function isValidCpf(value) {
  const d = cleanCpf(value)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  return cpfDigit(d.slice(0, 9)) === Number(d[9]) && cpfDigit(d.slice(0, 10)) === Number(d[10])
}

// Completa nove dígitos com os verificadores. Usado para gerar CPFs de
// demonstração que passam na validação.
export function makeCpf(base9) {
  const first = cpfDigit(base9)
  return `${base9}${first}${cpfDigit(`${base9}${first}`)}`
}

export const cleanPhone = (phone = '') => String(phone).replace(/\D/g, '')

export const formatPhone = (phone = '') => {
  const d = cleanPhone(phone).slice(0, 11)
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
}

export const whatsappLink = (phone, text) => {
  const d = cleanPhone(phone)
  if (!d) return null
  return `https://wa.me/${d.startsWith('55') ? d : `55${d}`}?text=${encodeURIComponent(text)}`
}

export const normalize = (s = '') =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export const slugify = (s = '') =>
  normalize(s).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export const trioLabel = (competitors) =>
  competitors.map((c) => c?.nickname || c?.name?.split(' ')[0] || '?').join(' / ')

// Gerador determinístico (mulberry32). A mesma semente gera o mesmo sorteio,
// o que permite reproduzir e auditar a montagem.
export function seededRandom(seed) {
  let a = Number(seed) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle(list, rand) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export const newSeed = () => Math.floor(100000 + Math.random() * 900000)

// Tempo digitado pela mesa. Aceita "44,5", "44.5" e "1:02,345" (minutos).
// Devolve segundos com três casas ou NaN.
export function parseTime(value) {
  const raw = String(value ?? '').trim().replace(',', '.')
  if (!raw) return NaN
  const m = raw.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/)
  const n = m ? Number(m[1]) * 60 + Number(m[2]) : /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : NaN
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : NaN
}

export const cleanTimeInput = (value) => String(value).replace(/[^\d.,:]/g, '').slice(0, 10)

// "Faltam 6 dias", "É amanhã", "É hoje". null para datas passadas.
export function countdown(dateIso, today = todayIso()) {
  const days = Math.round((new Date(`${dateIso}T12:00:00`) - new Date(`${today}T12:00:00`)) / 86400000)
  if (days < 0) return null
  if (days === 0) return 'É hoje'
  if (days === 1) return 'É amanhã'
  return `Faltam ${days} dias`
}

// CPF parcial para identificar um competidor em tela. No site público o
// banco já entrega mascarado (cpfMasked) e o número completo nunca chega.
export const cpfHint = (c) => (c?.cpf ? maskCpf(c.cpf) : c?.cpfMasked || '')
