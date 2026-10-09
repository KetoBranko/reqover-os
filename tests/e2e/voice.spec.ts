import { expect, test } from '@playwright/test'
import { login, submitDialog, testName } from './support'

// Fake microphone (playwright.config) + STT test double (npm run dev:e2e).
const DICTATED = 'Testmodus-Diktat: Die machen ungefähr 30 bis 40 Angebote im Monat.'

test('Diktat: Notiz im Gesprächsmodus und Sprachbefehl in der Befehlsleiste', async ({ page }) => {
  const company = testName('Diktatfirma')
  page.on('dialog', (d) => d.accept())
  await login(page)

  await page.goto('/unternehmen?neu=1')
  await page.fill('#c-name', company)
  await submitDialog(page)
  await page.waitForURL(/\/unternehmen\/[0-9a-f-]{36}$/)
  const companyUrl = page.url()

  await page.goto('/discovery?neu=1')
  await page.getByLabel('Unternehmen').selectOption({ label: company })
  await submitDialog(page)
  await page.waitForURL(/\/gespraech$/)
  await expect(page.getByText('Das Gespräch selbst wird nicht aufgezeichnet.')).toBeVisible()

  // Recording only starts on click, is visibly on, and stops on the next click.
  const notes = page.getByLabel('Notizen', { exact: true })
  await notes.fill('Erste eigene Notiz.')
  await page.getByRole('button', { name: 'Notiz diktieren' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Mikrofon an' })).toBeVisible()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Diktat beenden' }).click()
  await expect(notes).toHaveValue(`Erste eigene Notiz.\n${DICTATED}`)
  await expect(page.getByRole('button', { name: 'Notiz diktieren' })).toBeVisible()
  await expect(page.getByText('Gespeichert').first()).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Notizen', { exact: true })).toHaveValue(`Erste eigene Notiz.\n${DICTATED}`)

  // Global voice entry: the command bar opens listening; the text becomes a question for ProRendo.
  await page.goto('/')
  await page.getByRole('button', { name: 'Spracheingabe' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Mikrofon an' })).toBeVisible()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Diktat beenden' }).click()
  await expect(page.getByPlaceholder(/Suchen, Aktion wählen/)).toHaveValue(DICTATED)
  await expect(page.getByRole('option', { name: /ProRendo fragen/ })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.goto(companyUrl)
  await page.getByRole('button', { name: 'Weitere Aktionen' }).click()
  await page.getByRole('menuitem', { name: 'Unternehmen löschen' }).click()
  await page.waitForURL(/\/unternehmen$/)
})

test('Transkriptions-Endpunkt: nur angemeldet, nur gleiche Herkunft, nur Audio', async ({ page, playwright, baseURL }) => {
  const anonymous = await playwright.request.newContext({ baseURL })
  const anon = await anonymous.post('/api/sprache', { headers: { origin: baseURL! }, multipart: { audio: { name: 'a.webm', mimeType: 'audio/webm', buffer: Buffer.from('x') } }, maxRedirects: 0 })
  expect(anon.status()).not.toBe(200)
  await anonymous.dispose()

  await login(page)
  const audio = { name: 'a.webm', mimeType: 'audio/webm', buffer: Buffer.from('abc') }
  const foreign = await page.request.post('/api/sprache', { headers: { origin: 'https://example.org' }, multipart: { audio } })
  expect(foreign.status()).toBe(403)
  const empty = await page.request.post('/api/sprache', { headers: { origin: baseURL! }, multipart: { note: 'x' } })
  expect(empty.status()).toBe(400)
  const wrongType = await page.request.post('/api/sprache', { headers: { origin: baseURL! }, multipart: { audio: { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('abc') } } })
  expect(wrongType.status()).toBe(415)
  const ok = await page.request.post('/api/sprache', { headers: { origin: baseURL! }, multipart: { audio } })
  expect(await ok.json()).toEqual({ ok: true, text: DICTATED })
})
