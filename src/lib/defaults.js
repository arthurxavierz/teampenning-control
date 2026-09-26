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
  shared: 'Empate mantido'
}

export const DEFAULT_TERMS =
  'Declaro que as informações do trio são verdadeiras, que o handicap informado segue a base CONTEP vigente e que conheço o regulamento da prova. A participação só é confirmada após o aceite dos três integrantes e a confirmação do pagamento pela organização.'

export function defaultEventSettings() {
  return {
    limits: { maxPerCompetitor: 8, maxSameTrio: 1 },
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

export function defaultCategories(eventId) {
  const base = { qualifyingRuns: 4, bestTimesCount: 2, finalRuns: 1, carryQualifying: true, tiebreak: 'best_single' }
  return [
    { ...base, id: uid('cat'), eventId, name: 'SOMA 11', maxHandicap: 11, finalistsCount: 12, color: '#D8AF58' },
    { ...base, id: uid('cat'), eventId, name: 'SOMA 03', maxHandicap: 3, finalistsCount: 12, color: '#E9E1CF' },
    { ...base, id: uid('cat'), eventId, name: 'INICIANTE', maxHandicap: 0, finalistsCount: 6, color: '#9CB58B' }
  ]
}
