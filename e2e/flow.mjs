// Percorre o sistema clicando como uma pessoa: inscrição, convite, pagamento,
// montagem, pista, locução, backup, CONTEP, relatórios e telas de celular.
// Uso: com `npm run dev` rodando, `npm run e2e`. Capturas de tela vão para
// e2e/out. Variáveis: BASE_URL (padrão http://localhost:5173) e CHROME_PATH.
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), 'out') + path.sep
const CHROME = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome'
].find((p) => fs.existsSync(p))
fs.mkdirSync(OUT, { recursive: true })
let failed = 0
const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
const page = await ctx.newPage()
const problems = []
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`console.${m.type()}: ${m.text().slice(0, 300)}`) })
const shot = (name) => page.screenshot({ path: `${OUT}${name}.png`, fullPage: false })
const step = async (name, fn) => {
  try { await fn(); console.log('ok  ', name) } catch (e) { failed++
    console.log('FAIL', name, '\n   ', e.message.split('\n')[0]); await shot(`fail-${name.replace(/\W+/g, '-')}`) }
}
const toast = async () => (await page.locator('.toast').allInnerTexts()).join(' | ')

await page.goto(BASE + '/admin/evento/evt_demo/configuracoes')
page.once('dialog', (d) => d.accept())
await page.getByRole('button', { name: 'Restaurar demonstração' }).click()
await page.waitForURL('**/admin')

await step('home', async () => {
  await page.goto(BASE + '/')
  await page.getByRole('heading', { name: /inscrição/ }).waitFor()
})

await step('inscrição completa', async () => {
  await page.goto(BASE + '/eventos/8-etapa-ctm-hsf/inscrever')
  await page.getByText('Soma até 3', { exact: true }).click()
  await page.getByRole('button', { name: /Continuar/ }).click()
  await page.getByLabel('Buscar competidor 1').fill('Nic')
  await page.getByRole('button', { name: /Nicolas Souza/ }).click()
  await page.getByLabel('Buscar competidor 2').fill('Klé')
  await page.getByRole('button', { name: /Kleber Rocha/ }).click()
  await page.locator('.slot').nth(2).getByRole('button', { name: /Cadastrar competidor novo/ }).click()
  const s3 = page.locator('.slot').nth(2)
  await s3.getByPlaceholder('Nome do competidor').fill('Paulo Teste')
  await s3.getByPlaceholder('000.000.000-00').fill('52998224725')
  await s3.getByPlaceholder('(34) 99999-9999').fill('34911112222')
  await s3.locator('input[type=number]').fill('1')
  await shot('inscricao-trio')
  await page.getByRole('button', { name: /Continuar/ }).click()
  await page.getByText('Li e aceito o regulamento').click()
  await shot('inscricao-revisao')
  await page.getByRole('button', { name: 'Criar trio' }).click()
  await page.getByText('Agora faltam os aceites').waitFor()
  const links = await page.locator('.notify a').evaluateAll((as) => as.map((a) => a.href))
  console.log('     avisos WhatsApp:', links.length, links[0]?.slice(0, 60))
  await shot('inscricao-ok')
})

await step('minha área: login, convite, pagamento', async () => {
  await page.goto(BASE + '/minha-area')
  await page.getByRole('button', { name: 'Preencher' }).click()
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.getByText('Arthur Xavier').first().waitFor()
  await shot('minha-area')
  await page.locator('.invite').first().getByRole('button', { name: 'Aceitar' }).click()
  await page.waitForTimeout(200)
  await shot('minha-area-aceite')
})

await step('financeiro: conferir pagamento', async () => {
  await page.goto(BASE + '/admin')
  await page.getByLabel('Nome do operador').fill('Mesa Teste')
  await page.goto(BASE + '/admin/evento/evt_demo/financeiro')
  await page.getByRole('tab', { name: /Informados/ }).click()
  await page.getByRole('button', { name: /Conferir/ }).first().click()
  await page.getByRole('button', { name: /Confirmar recebimento/ }).click()
  console.log('     toast:', await toast())
})

await step('inscrições: detalhe e cancelar', async () => {
  await page.goto(BASE + '/admin/evento/evt_demo/inscricoes')
  await page.locator('.trow').first().click()
  await shot('inscricoes-detalhe')
})

await step('montagem: sortear e publicar', async () => {
  await page.goto(BASE + '/admin/evento/evt_demo/montagem')
  await page.getByRole('button', { name: /Sortear montagem/ }).click()
  await page.getByRole('button', { name: /Publicar e travar/ }).click()
  await page.locator('.sched-row').first().waitFor()
  await page.locator('.sched-move').nth(3).getByLabel('Descer').click()
  await page.getByPlaceholder(/histórico do evento/).fill('Ajuste de teste')
  await page.getByRole('button', { name: 'Aplicar ajuste' }).click()
  console.log('     toast:', await toast())
})

await step('pista: lançar, ocorrência, desfazer, corrigir', async () => {
  await page.goto(BASE + '/admin/evento/evt_demo/pista')
  const input = page.getByLabel('Tempo em segundos')
  for (const t of ['41.2', '39.87', '44,5']) {
    await input.fill(t)
    await input.press('Enter')
    await page.waitForTimeout(550)
  }
  await page.keyboard.press('Alt+1')
  await page.waitForTimeout(550)
  await shot('pista')
  await page.keyboard.press('Control+z')
  await page.getByPlaceholder(/histórico do evento/).fill('Erro de digitação')
  await page.getByRole('button', { name: 'Desfazer lançamento' }).click()
  await page.getByLabel(/Corrigir passada/).first().click()
  await page.locator('.modal input[inputmode=decimal]').fill('40,001')
  await page.getByPlaceholder(/histórico do evento/).fill('Cronômetro reserva')
  await page.getByRole('button', { name: 'Salvar correção' }).click()
  const done = await page.locator('.done-line').count()
  console.log('     lançadas visíveis:', done)
})

await step('locução', async () => {
  await page.goto(BASE + '/admin/evento/evt_demo/locucao')
  await page.locator('.nar-now').waitFor()
  console.log('     situação:', await page.locator('.nar-situation').allInnerTexts())
  await shot('locucao')
})

await step('backup: baixar e carregar', async () => {
  await page.goto(BASE + '/admin/evento/evt_demo/configuracoes')
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Baixar backup/ }).click()])
  const file = `${OUT}backup.json`
  await dl.saveAs(file)
  page.once('dialog', (d) => d.accept())
  await page.locator('input[type=file][accept*=json]').setInputFiles(file)
  await page.waitForURL('**/admin')
  console.log('     backup ok, bytes:', fs.statSync(file).size)
})

await step('ranking e arena', async () => {
  await page.goto(BASE + '/admin/evento/evt_demo/ranking')
  await page.getByRole('tab', { name: /SOMA 03/ }).click()
  await shot('ranking')
  await page.goto(BASE + '/eventos/8-etapa-ctm-hsf/live')
  await page.locator('.now').waitFor()
  await shot('arena')
})

await step('contep: importar csv', async () => {
  const csv = 'Nome;CPF;Código;Handicap\nArthur Xavier;;D1278;2\nJosé Martins;;E0182;\nFulano Novo;;Z1234;3,5\nNome Errado;;F4410;1\n'
  fs.writeFileSync(`${OUT}base.csv`, csv)
  await page.goto(BASE + '/admin/contep')
  await page.locator('input[type=file]').setInputFiles(`${OUT}base.csv`)
  await page.getByText('base.csv').waitFor()
  console.log('     linhas:', (await page.locator('.contep-cols.trow').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').slice(0, 90)).join(' || '))
  await shot('contep-preview')
  await page.getByRole('button', { name: 'Aplicar importação' }).click()
  console.log('     toast:', await toast())
})

await step('novo evento duplicado e configurações', async () => {
  await page.goto(BASE + '/admin')
  await page.getByRole('button', { name: /Novo evento/ }).click()
  await page.getByPlaceholder('9ª Etapa CTM HSF').fill('9ª Etapa CTM HSF')
  await page.getByRole('button', { name: 'Criar evento' }).click()
  await page.waitForURL('**/configuracoes')
  await page.getByRole('button', { name: /Salvar alterações/ }).click()
  console.log('     toast:', await toast())
  await shot('config')
})

await step('relatórios e auditoria', async () => {
  await page.goto(BASE + '/admin/evento/evt_demo/relatorios')
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Financeiro por CPF/ }).click()])
  console.log('     download:', dl.suggestedFilename())
  await page.goto(BASE + '/admin/evento/evt_demo/historico')
  console.log('     linhas de auditoria:', await page.locator('.audit-line').count())
  await shot('auditoria')
})

await step('celular', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const [n, u] of [['m-home', '/'], ['m-inscricao', '/eventos/8-etapa-ctm-hsf/inscrever'], ['m-area', '/minha-area'], ['m-pista', '/admin/evento/evt_demo/pista'], ['m-arena', '/eventos/8-etapa-ctm-hsf/live']]) {
    await page.goto(BASE + u)
    await page.waitForTimeout(300)
    const w = await page.evaluate(() => document.documentElement.scrollWidth)
    if (w > 392) problems.push(`overflow horizontal em ${u}: ${w}px`)
    await shot(n)
  }
})

console.log('\nPROBLEMAS:', problems.length ? '\n' + [...new Set(problems)].join('\n') : 'nenhum')
await browser.close()
process.exit(failed || problems.length ? 1 : 0)
