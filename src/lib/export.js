// CSV com ponto e vírgula e BOM: é o formato que o Excel em português abre
// com acentos e colunas certas sem passar pelo assistente de importação.
export function toCsv(rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n')
}

export function downloadCsv(filename, rows) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const decimal = (n) => (n == null ? '' : String(n).replace('.', ','))
