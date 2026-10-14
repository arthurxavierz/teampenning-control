import { uid } from './utils.js'

// Tudo aqui é ponto de partida editável em Configurações. Nenhuma regra
// esportiva deve ficar presa ao código: SAT, desempate, final e carregamento
// da classificatória ainda dependem de confirmação da organização.
export const DEFAULT_OCCURRENCES = [
  { code: 'SAT', label: 'SAT', effect: 'no_time', seconds: 0 },
  { code: 'ST', label: 'Sem tempo', effect: 'no_time', seconds: 0 },
  { code: 'P5', label: 'Penalidade 5s', effect: 'penalty', seconds: 5 },
  { code: 'DQ', label: 'Desclassificação', effect: 'disqualified', seconds: 0 }
]

export const OCCURRENCE_EFFECTS = {
  no_time: 'Anula o tempo da passada',
  penalty: 'Soma segundos ao tempo',
  disqualified: 'Tira o trio da classificação'
}

export const TIEBREAKS = {
  best_single: 'Melhor tempo individual',
  last_valid: 'Último tempo válido',
  runoff: 'Desempate em pista',
  shared: 'Empate mantido'
}

export const CATTLE_MODES = {
  draw: 'Sorteado na montagem',
  live: 'Sorteado na hora, pela mesa',
  sequential: 'Em sequência'
}

export const PRIZE_MODES = {
  none: 'Sem premiação no sistema',
  percent: 'Percentual do arrecadado',
  fixed: 'Valor fixo'
}

export const DEFAULT_TERMS =
  'Declaro que as informações do trio são verdadeiras, que o handicap informado segue a base CONTEP vigente e que conheço o regulamento da prova. A participação só é confirmada após o aceite dos três integrantes e a confirmação do pagamento pela organização.'

export function defaultEventSettings() {
  return {
    limits: { maxPerCompetitor: 10, maxSameTrio: 2 },
    terms: DEFAULT_TERMS,
    cattle: { min: 0, max: 6, mode: 'draw' },
    schedule: { minGap: 2, mode: 'mixed', seed: null, generatedAt: null, publishedAt: null },
    occurrences: DEFAULT_OCCURRENCES.map((o) => ({ ...o })),
    arena: {
      mode: 'tv',
      rotationSeconds: 10,
      intermission: false,
      intermissionMessage: 'Intervalo. A prova volta em instantes.',
      sponsors: ['Achilles Media'],
      accent: '#D8AF58'
    },
    homologated: {}
  }
}

const CATEGORY_BASE = {
  qualifyingRuns: 4,
  bestTimesCount: 2,
  finalRuns: 1,
  carryQualifying: true,
  tiebreak: 'best_single',
  timeLimit: null,
  maxMemberHandicap: null,
  maxAge: null,
  maxAgeSum: null,
  gender: '',
  prize: { mode: 'none', percent: 60, amount: 0, split: '50, 30, 20' }
}

// Modelos de categoria usados nos circuitos. A soma é o teto do handicap
// CONTEP do trio. Iniciante soma zero. Mirim e Kids seguem os critérios da
// CONTEP 2026 (até 13 e até 10 anos, soma de idades até 36 na Mirim).
export const CATEGORY_PRESETS = [
  { name: 'INICIANTE', maxHandicap: 0, finalistsCount: 6, color: '#9CB58B' },
  { name: 'SOMA 01', maxHandicap: 1, finalistsCount: 10, color: '#B9C7A8' },
  { name: 'SOMA 03', maxHandicap: 3, finalistsCount: 12, color: '#E9E1CF' },
  { name: 'SOMA 06', maxHandicap: 6, finalistsCount: 12, color: '#C9A46A' },
  { name: 'SOMA 09', maxHandicap: 9, finalistsCount: 12, color: '#B38B4D' },
  { name: 'SOMA 11', maxHandicap: 11, finalistsCount: 12, color: '#D8AF58' },
  { name: 'FEMININA', maxHandicap: 11, finalistsCount: 10, color: '#D49A9A', gender: 'F' },
  { name: 'MIRIM', maxHandicap: 11, finalistsCount: 10, color: '#8FB3C9', maxAge: 13, maxAgeSum: 36, timeLimit: 60 },
  { name: 'KIDS', maxHandicap: 11, finalistsCount: 6, color: '#A9C6E0', maxAge: 10, timeLimit: 60 }
]

export function categoryFromPreset(eventId, preset) {
  return { ...structuredClone(CATEGORY_BASE), ...structuredClone(preset), id: uid('cat'), eventId }
}

export function defaultCategories(eventId) {
  return ['SOMA 11', 'SOMA 03', 'INICIANTE'].map((name, i) => ({ ...categoryFromPreset(eventId, CATEGORY_PRESETS.find((p) => p.name === name)), sortOrder: i }))
}
