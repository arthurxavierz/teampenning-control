import { cleanCpf, normalize } from './utils.js'

// Registro da base CONTEP importada. A base pode trazer gente que ainda não
// tem cadastro no sistema: quando essa pessoa se inscreve pelo código ou pelo
// CPF, o handicap vem daqui e não do que ela digitou.
export function contepRecordFor(state, { cpf, contepCode }) {
  const records = state.contep?.records || []
  const d = cleanCpf(cpf)
  const code = normalize(contepCode || '')
  return (d && records.find((r) => cleanCpf(r.cpf) === d)) || (code && records.find((r) => normalize(r.contepCode) === code)) || null
}
