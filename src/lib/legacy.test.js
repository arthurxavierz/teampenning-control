import { describe, expect, it } from 'vitest'
import { parseLegacy, planLegacy } from './legacy.js'
import { core } from './core.js'
import { createSeed } from './seed.js'

// Mesma estrutura da planilha TEAM PENNING CTM HSF 3.2.
const sheets = {
  Dados: [['Variavel', 'Valor'], ['Limite Por Competidor', 10], ['Limite Por Trio', 2], ['Categorias', 'INICIANTE'], [null, 'SOMA 03'], [null, 'SOMA 11'], ['Numeração de Boiada - de 0 a', 6]],
  'INSCRIÇÕES': [
    ['TEAM PENNING - 8ª ETAPA - CTM  HSF - MG'],
    [' Inscrições'],
    ['Inscrição', 'Passada 01', 'Passada 02', 'Passada 03', 'Passada 04', 'Competitor A', 'Competidor B', 'Competidor C', 'Categoria'],
    [1, 537, 1225, 2571, 3818, 'RICARDO BARTHOLO', 'GUSTAVO BARTHOLO', 'ARTUR NEGUIM', 'SOMA 11'],
    [2, 589, 1665, 2717, 3693, 'RICARDO BARTHOLO', 'GUSTAVO BARTHOLO', 'CARLOS PTC', 'SOMA 11'],
    [3, 1, 2, 3, 4, 'ARTHUR XAVIER', 'NICOLAS', 'CARLA', 'SOMA 03'],
    [4, 1, 2, 3, 4, 'TIKIM', 'TIKIM', 'CARLA', 'SOMA 03']
  ],
  Acerto: [['TEAM'], [null], ['Nº', 'Nome', 'INICIANTE', 'SOMA 03', 'SOMA 11', 'Total', 'Vr Total', 'Valor Pago', 'Valor Pend.', 'Pago'], [1, 'RICARDO BARTHOLO', 0, 0, 2, 2, 700, 700, 0, 'PAGO'], [2, 'CARLA', 0, 2, 0, 2, 700, 0, 700, 'PENDENTE']]
}

describe('planilha antiga', () => {
  it('lê regras, inscrições e pagamentos', () => {
    const p = parseLegacy(sheets)
    expect(p.limits).toEqual({ maxPerCompetitor: 10, maxSameTrio: 2 })
    expect(p.categories).toEqual(['INICIANTE', 'SOMA 03', 'SOMA 11'])
    expect(p.cattleMax).toBe(6)
    expect(p.trios).toHaveLength(4)
    expect(p.price).toBe(350)
    expect(p.payments).toEqual([{ name: 'RICARDO BARTHOLO', paid: 700 }])
  })

  it('casa nomes com o cadastro e importa o que é válido', () => {
    const s = createSeed()
    const plan = planLegacy(s, 'evt_demo', parseLegacy(sheets))
    // Arthur Xavier, Nicolas (apelido) e Carla (apelido) já existem.
    expect(plan.trios[2].members.every((m) => m.competitorId)).toBe(true)
    expect(plan.trios[3].issues).toContain('Competidor repetido no trio')
    const res = core.importLegacy(s, { actor: () => 'teste' }, 'evt_demo', plan)
    expect(res.created).toBe(3)
    expect(res.failed).toHaveLength(1)
    const ricardo = s.competitors.find((c) => c.name === 'Ricardo Bartholo')
    expect(ricardo.handicapSource).toBe('declared')
    expect(s.payments.some((p) => p.competitorId === ricardo.id && p.amount === 700)).toBe(true)
  })
})
